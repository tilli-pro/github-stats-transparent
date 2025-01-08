import { octokit } from "./octokit.js";
import spinner from "./spinner.js";

const settleStat = async <T extends PromiseSettledResult<any>>(
  promise: T,
  name: string,
  resource: string,
) => {};

const ignoredFiles = [
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "(.*).csproj",
  "(.*).sln",
  "(.*).dll",
  "(.*).pbxproj",
  "(.*).xcworkspace",
  "(.*).xcodeproj",
  "(.*).xcassets",
  "(.*).xcconfig",
  "(.*).xcuserdatad",
] as const;

export const getStats = async () => {
  const now = Date.now();
  const lastWeek = new Date(now - 7 * 24 * 60 * 60 * 1000);

  if (!process.env.ORG_NAME) {
    spinner.fail("ORG_NAME is not defined");
    throw new Error("ORG_NAME is not defined");
  }

  spinner.prefixText = "GitHub API";
  spinner.text = "Fetching organization data...";

  const [
    { status, data: repoData, headers },
    { data: orgUserData },
    { data: orgData },
  ] = await Promise.all([
    octokit.repos.listForOrg({
      org: process.env.ORG_NAME,
      page: 1,
      per_page: 100,
    }),
    octokit.orgs.listMembers({
      org: process.env.ORG_NAME,
      page: 1,
      per_page: 100,
    }),
    octokit.users.getByUsername({
      username: process.env.ORG_NAME,
    }),
  ]);
  const allUserLogins = orgUserData.map((user) => user.login);

  if (status > 204) {
    console.log(headers);
    spinner.fail("Failed to fetch organization data");
  }

  type GithubStat = (typeof repoData)[number] & {
    languages?: Record<string, number>;
    contributers?: Record<string, number>;
  };

  const langSummary: Record<string, number> = {};
  const userSummary: Record<
    string,
    {
      total: number;
      weekly_stats: Record<string, [number, number, number]>;
    } & Awaited<ReturnType<typeof octokit.orgs.listMembers>>["data"][number]
  > = {};

  // TODO: see how much of this can be parallelized without running into rate limit issues
  for (const repo of repoData as GithubStat[]) {
    try {
      spinner.text = `Fetching data for ${repo.name}`;
      const [langResult, contributerResult, commitResult] =
        await Promise.allSettled([
          octokit.repos.listLanguages({
            owner: repo.owner.name ?? process.env.ORG_NAME,
            repo: repo.name,
          }),
          octokit.repos.listContributors({
            owner: repo.owner.name ?? process.env.ORG_NAME,
            repo: repo.name,
          }),
          octokit.repos.listCommits({
            owner: repo.owner.name ?? process.env.ORG_NAME,
            repo: repo.name,
            since: lastWeek.toISOString(),
          }),
        ]);

      const langData =
        langResult.status === "fulfilled" ? langResult.value.data : null;
      if (langResult.status === "rejected") {
        console.error(`Failed to fetch languages for ${repo.name}`);
        console.error(langResult.reason);
      }
      const userData =
        contributerResult.status === "fulfilled"
          ? contributerResult.value.data
          : null;
      if (contributerResult.status === "rejected") {
        console.error(`Failed to fetch contributors for ${repo.name}`);
        console.error(contributerResult.reason);
      }
      const commitData =
        commitResult.status === "fulfilled" ? commitResult.value.data : null;
      if (commitResult.status === "rejected") {
        const commitResultError = commitResult.reason as {
          response?: { status?: number };
        };
        if (commitResultError.response?.status === 409) {
          // No commit data
          console.info(`No commit data for ${repo.name}`);
        } else {
          console.error(`Failed to fetch commits for ${repo.name}`);
          console.error(commitResult.reason);
        }
      }

      if (commitData) {
        spinner.text = `Fetching detailed commit data for ${repo.name}`;
        const detailedCommitDataResult = await Promise.all(
          commitData.map((commit) =>
            octokit.repos.getCommit({
              owner: repo.owner.name ?? process.env.ORG_NAME!,
              repo: repo.name,
              ref: commit.sha,
            }),
          ),
        );

        const detailedCommitData = detailedCommitDataResult.map((r) => r.data);

        detailedCommitData.forEach((c) => {
          const login = c.author?.login;
          if (!login) return;

          if (!userSummary[login]) {
            const user = orgUserData.find((u) => u.login === login)! ?? {};
            userSummary[login] = { total: 0, weekly_stats: {}, ...user };
          }
          if (!userSummary[login].weekly_stats[repo.name]) {
            userSummary[login].weekly_stats[repo.name] = [0, 0, 0];
          }

          const [lockFileAdditions, lockFileDeletions] = c.files
            ?.filter((f) =>
              ignoredFiles.some((name) => new RegExp(name).test(f.filename)),
            )
            .reduce(
              ([additions, deletions], file) => {
                return [additions + file.additions, deletions + file.deletions];
              },
              [0, 0],
            ) ?? [0, 0];

          userSummary[login].weekly_stats[repo.name][0]++;
          userSummary[login].weekly_stats[repo.name][1] +=
            (c.stats?.additions ?? 0) - lockFileAdditions;
          userSummary[login].weekly_stats[repo.name][2] +=
            (c.stats?.deletions ?? 0) - lockFileDeletions;
        });
      }

      if (langData) {
        repo.languages = langData;
        for (const lang in langData) {
          langSummary[lang] = (langSummary[lang] ?? 0) + langData[lang];
        }
      }

      if (userData) {
        repo.contributers = Object.fromEntries(
          userData
            .filter((user) => !!user.login)
            .map((user) => [user.login!, user.contributions]),
        );

        userData.forEach((user) => {
          const username = user.login ?? "unknown";
          if (!allUserLogins.includes(username)) {
            return;
          }
          if (!userSummary[username]) {
            const orgUser =
              orgUserData.find((u) => u.login === username)! ?? {};
            userSummary[username] = { total: 0, weekly_stats: {}, ...orgUser };
          }
          userSummary[username].total += user.contributions;
        });
      }
    } catch (e) {
      console.error(`Failed to fetch data for ${repo.name}`);
      console.error(e);
    }
  }

  return {
    repos: repoData as GithubStat[],
    languages: langSummary,
    contributors: userSummary,
    organization: orgData,
  };
};
