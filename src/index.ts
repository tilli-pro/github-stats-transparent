import terminalImage from "terminal-image";

import spinner from "./spinner.js";
import { getStats } from "./stats.js";

const createTerminalImage = async (
  url: string,
  opts: {
    width?: number | string;
    height?: number | string;
    preserveAspectRatio?: boolean;
  } = {
    height: "50%",
    preserveAspectRatio: true,
  },
) => {
  const imageRequest = await fetch(url);
  const imageBuffer = await imageRequest.arrayBuffer();
  return terminalImage.buffer(Buffer.from(imageBuffer), opts);
};

const emap = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
  4: "4️⃣",
  5: "5️⃣",
};

async function main() {
  spinner.start("Fetching stats...");
  const stats = await getStats();

  const orgImage = await createTerminalImage(stats.organization.avatar_url);

  if (process.env.NODE_ENV !== "production") {
    process.stdout.write("\u001b[2J\u001b[0;0H");
    console.log(orgImage);
    console.log(
      `Organization: ${stats.organization.name} (${stats.organization.login})\n\n`,
    );
  }

  const contributors = Object.entries(stats.contributors);
  contributors.sort(
    ([a, { weekly_stats: _reposA }], [b, { weekly_stats: _reposB }]) => {
      const [reposA, reposB] = [
        Object.entries(_reposA),
        Object.entries(_reposB),
      ];
      const [totalCommitsA, totalChangesA] = reposA.reduce(
        ([totalCommits, totalChanges], [, [commits, adds, deletes]]) => [
          commits + totalCommits,
          adds - deletes + totalChanges,
        ],
        [0, 0],
      );

      const [totalCommitsB, totalChangesB] = reposB.reduce(
        ([totalCommits, totalChanges], [, [commits, adds, deletes]]) => [
          commits + totalCommits,
          adds - deletes + totalChanges,
        ],
        [0, 0],
      );

      // we need to weight changes (i.e. literal commit diff character-wise) significantly less than total commits (i.e. the number of commits)
      // however plethora of commits should also not be overweighted, so we do some "fun math" to get a reasonable commit score
      const scoreCommits = (commits: number) =>
        20 * Math.log(commits) - 5 * Math.sqrt(commits);
      const contributionsA = scoreCommits(totalCommitsA) + 0.01 * totalChangesA;
      stats.contributors[a].score = contributionsA;
      const contributionsB = scoreCommits(totalCommitsB) + 0.01 * totalChangesB;
      stats.contributors[b].score = contributionsB;
      const contributionDiff = contributionsB - contributionsA;

      return contributionDiff;
    },
  );

  const activeRepos: Record<string, [number, number, number]> = {};

  contributors.forEach(([, repos]) => {
    const weeklyStats = Object.entries(repos.weekly_stats);
    weeklyStats.forEach(([repo, stats]) => {
      if (!activeRepos[repo]) {
        activeRepos[repo] = [0, 0, 0];
      }
      activeRepos[repo][0] += stats[0];
      activeRepos[repo][1] += stats[1];
      activeRepos[repo][2] += stats[2];
    });
  });

  const sortedActiveRepos = Object.entries(activeRepos)
    .sort(([, [totalA]], [, [totalB]]) => {
      return totalB - totalA;
    })
    .slice(0, 5);

  const topContributors = contributors.slice(0, 5);

  spinner.succeed("Stats fetched successfully");

  if (process.env.NODE_ENV !== "production") {
    console.log(`Top 5 Contributors\n`);

    for (const c of topContributors) {
      const [login, { weekly_stats }] = c;
      const details = stats.contributors[login];
      try {
        const avatar = await createTerminalImage(details.avatar_url, {
          height: "20%",
          width: "50%",
          preserveAspectRatio: false,
        });
        console.log(avatar);
      } catch (e) {}
      const e = emap[(topContributors.indexOf(c) + 1) as keyof typeof emap];
      console.log(`${e}  ${login} (${details.total} All Time)\n`);
      console.log(` Total Contribution Score: ${details.score?.toFixed(2)}\n`);
      for (const [repo, stats] of Object.entries(weekly_stats)) {
        console.log(
          `\tRepository: ${repo}\n`,
          `\t Total commits: ${stats[0]}\n`,
          `\t Total additions: ${stats[1]}\n`,
          `\t Total deletions: ${stats[2]}\n`,
        );
      }
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`Top 5 Active Repositories\n`);
    for (const r of sortedActiveRepos) {
      const [repo, [commits, adds, deletes]] = r;
      const details = stats.repos.find((r) => r.name === repo);
      if (!details) continue;
      const e = emap[(sortedActiveRepos.indexOf(r) + 1) as keyof typeof emap];
      console.log(
        `${e}  ${details.name} (${details.description?.trim()})\n`,
        `Total commits: ${commits}\n`,
        `Total additions: ${adds}\n`,
        `Total deletions: ${deletes}\n`,
      );
    }
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
