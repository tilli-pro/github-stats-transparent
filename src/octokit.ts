import { Octokit } from "@octokit/rest";

import spinner from "./spinner.js";

if (!process.env.GITHUB_TOKEN) {
  throw new Error("GITHUB_TOKEN is not defined");
}

export const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
  log: {
    debug: (message) => {
      spinner.text = message;
    },
    info: (message) => {
      spinner.text = message;
    },
    warn: (message) => {
      spinner.warn(message);
    },
    error: (message) => {
      const currentText = spinner.text;
      spinner.warn(message);
      spinner.start(currentText);
    },
  },
});
