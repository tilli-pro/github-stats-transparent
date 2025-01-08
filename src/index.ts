import util from "node:util";
import terminalImage from "terminal-image";

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

async function main() {
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
    ([, { weekly_stats: _reposA }], [, { weekly_stats: _reposB }]) => {
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

      const totalCommitDiff = totalCommitsB - totalCommitsA;
      const totalChangeDiff = totalChangesB - totalChangesA;

      // we need to weight changes (i.e. literal commit diff character-wise) significantly less than total commits (i.e. the number of commits)
      return totalCommitDiff + 0.01 * totalChangeDiff;
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
      console.log(
        `(${topContributors.indexOf(c) + 1}) Contributor: ${login} (${details.total} Total)\n`,
      );
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
      console.log(
        `(${sortedActiveRepos.indexOf(r) + 1}) Repository: ${details.name} (${details.description})\n`,
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
