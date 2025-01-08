import ora from "ora-classic";

const spinner = ora({
  isEnabled: process.env.NODE_ENV !== "production",
});

export default spinner;
