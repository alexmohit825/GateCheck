import { execSync } from "node:child_process";

export function checkGitStatus(targetDir) {
  const result = {
    passed: false,
    name: "Assertion 1: Git Working Tree & Remote Sync",
    details: "",
    data: {},
  };

  try {
    const cwd = targetDir || process.cwd();
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf8" }).trim();
    const commit = execSync("git rev-parse --short HEAD", { cwd, encoding: "utf8" }).trim();
    const status = execSync("git status --porcelain", { cwd, encoding: "utf8" }).trim();

    result.data = { branch, commit, dirtyFiles: status ? status.split("\n") : [] };

    if (status.length > 0) {
      result.passed = false;
      result.details = `Uncommitted changes detected (${result.data.dirtyFiles.length} dirty files). Tree must be clean.`;
      return result;
    }

    // Check remote tracking
    try {
      const remoteStatus = execSync("git status -uno", { cwd, encoding: "utf8" });
      if (remoteStatus.includes("Your branch is ahead of")) {
        result.passed = false;
        result.details = `Local branch is ahead of origin. Must push to remote before certification.`;
        return result;
      }
    } catch {
      // No upstream tracking or offline, continue with local clean check
    }

    result.passed = true;
    result.details = `Clean working tree at commit ${commit} (branch: ${branch})`;
    return result;
  } catch (err) {
    result.passed = false;
    result.details = `Git check failed or not a git repository: ${err.message}`;
    return result;
  }
}
