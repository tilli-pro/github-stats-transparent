import util from "node:util";
import terminalImage from "terminal-image";

import { getStats } from "./stats.js";

async function main() {
  const stats = await getStats();

  const orgImageUrl = stats.organization.avatar_url;
  const orgImageRequest = await fetch(orgImageUrl);
  const orgImageBuffer = await orgImageRequest.arrayBuffer();
  const orgImage = await terminalImage.buffer(Buffer.from(orgImageBuffer), {
    height: "20%",
    preserveAspectRatio: true,
  });

  if (process.env.NODE_ENV !== "production") {
    process.stdout.write("\u001b[2J\u001b[0;0H");
    console.log(orgImage);
    console.log(
      `Organization: ${stats.organization.name} (${stats.organization.login})`,
    );
  }

  const contributors = Object.entries(stats.contributors);
  contributors.sort(
    (
      [userA, { total: totalA, weekly_stats: _reposA }],
      [userB, { total: totalB, weekly_stats: _reposB }],
    ) => {
      const [reposA, reposB] = [
        Object.entries(_reposA),
        Object.entries(_reposB),
      ];
      const commitAggregateA = reposA.reduce(
        (acc, [repo, stats]) => [
          stats[0] + acc[0],
          stats[1] - stats[2] + acc[1],
        ],
        [0, 0],
      );
      const commitAggregateB = reposB.reduce(
        (acc, [repo, stats]) => [
          stats[0] + acc[0],
          stats[1] - stats[2] + acc[1],
        ],
        [0, 0],
      );

      const [commitStatDiff, commitAddDiff] = [
        commitAggregateB[0] - commitAggregateA[0],
        commitAggregateB[1] - commitAggregateA[1],
      ];
      return commitStatDiff * 0.4 + commitAddDiff * 0.6;
    },
  );
  const activeRepos: Record<string, [number, number, number]> = {};
  contributors.forEach(([user, repos]) => {
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
  const sortedActiveRepos = Object.fromEntries(
    Object.entries(activeRepos)
      .sort(([, [totalA]], [, [totalB]]) => {
        return totalB - totalA;
      })
      .slice(0, 4),
  );

  if (process.env.NODE_ENV !== "production") {
    console.log(
      util.inspect(Object.fromEntries(contributors), {
        depth: 5,
        colors: true,
      }),
    );
  }

  for (const repo in sortedActiveRepos) {
    const details = stats.repos.find((r) => r.name === repo);
    if (!details) continue;
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `Repository: ${details.name} (${details.description})\n`,
        `Total commits: ${sortedActiveRepos[repo][0]}\n`,
        `Total additions: ${sortedActiveRepos[repo][1]}\n`,
        `Total deletions: ${sortedActiveRepos[repo][2]}\n`,
      );
    }
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
