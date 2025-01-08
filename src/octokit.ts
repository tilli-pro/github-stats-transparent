import { Octokit } from "@octokit/rest";

if (!process.env.GITHUB_TOKEN) {
  throw new Error("GITHUB_TOKEN is not defined");
}

export const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
  log: {
    debug: (message) => {},
    info: (message) => {},
    warn: (message) => {},
    error: (message) => console.log(message),
  },
});
