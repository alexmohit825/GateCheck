#!/usr/bin/env node

import { checkGitStatus } from "./git.js";
import { checkAssetIntegrity, checkApiHealth } from "./network.js";
import { checkBrowserRuntime } from "./browser.js";
import { header, pass, fail, info, summaryBox } from "./format.js";

function parseArgs(args) {
  const options = {
    url: null,
    dir: process.cwd(),
    assertText: [],
    selector: null,
    api: null,
    skipGit: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dir" && args[i + 1]) {
      options.dir = args[++i];
    } else if (arg === "--assert-text" && args[i + 1]) {
      options.assertText.push(args[++i]);
    } else if (arg === "--selector" && args[i + 1]) {
      options.selector = args[++i];
    } else if (arg === "--api" && args[i + 1]) {
      options.api = args[++i];
    } else if (arg === "--skip-git") {
      options.skipGit = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith("-") && !options.url) {
      options.url = arg;
    }
  }

  return options;
}

function printHelp() {
  console.log(`
GATECHECK: Deterministic Pre-Flight Quality Control Engine
Usage: gatecheck <target-url> [options]

Options:
  --dir <path>           Project root directory for Git status validation (default: cwd)
  --assert-text <text>   Assert that specific text is present in rendered DOM (can repeat)
  --selector <css>       Assert that CSS selector matches an element in DOM
  --api <path>           Probe specific backend API endpoint (e.g. /api/state)
  --skip-git             Skip local Git clean-tree and remote-sync assertions
  --help, -h             Show this help screen

Examples:
  gatecheck https://etf-rebalancer-afolrgjyzq-uw.a.run.app
  gatecheck http://localhost:5000 --assert-text "Holdings & Target Allocation" --api /api/state
  gatecheck https://myapp.pages.dev --skip-git
`);
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (!options.url) {
    console.error("Error: Target URL is required.");
    printHelp();
    process.exit(1);
  }

  const startTime = Date.now();
  console.log(header(options.url));

  const results = [];

  // Assertion 1: Git Status Check
  if (!options.skipGit) {
    console.log(info("Checking local Git repository state..."));
    const gitRes = checkGitStatus(options.dir);
    results.push(gitRes);
    console.log(gitRes.passed ? pass(gitRes.details) : fail(gitRes.details));
  }

  // Assertion 2: Asset MIME Integrity & 404 Guard
  console.log(info("Inspecting HTML root bundle and asset MIME types..."));
  const assetRes = await checkAssetIntegrity(options.url);
  results.push(assetRes);
  console.log(assetRes.passed ? pass(assetRes.details) : fail(assetRes.details));

  // Assertion 3, 4, 5: Chromium Headless CDP Runtime Execution
  console.log(info("Spawning Headless Chromium via Chrome DevTools Protocol..."));
  try {
    const browserRes = await checkBrowserRuntime(options.url, {
      assertText: options.assertText,
      selector: options.selector,
    });

    results.push(browserRes.exceptionAssertion);
    console.log(
      browserRes.exceptionAssertion.passed
        ? pass(browserRes.exceptionAssertion.details)
        : fail(browserRes.exceptionAssertion.details)
    );

    results.push(browserRes.domAssertion);
    console.log(
      browserRes.domAssertion.passed
        ? pass(browserRes.domAssertion.details)
        : fail(browserRes.domAssertion.details)
    );

    results.push(browserRes.spinnerAssertion);
    console.log(
      browserRes.spinnerAssertion.passed
        ? pass(browserRes.spinnerAssertion.details)
        : fail(browserRes.spinnerAssertion.details)
    );
  } catch (err) {
    const failObj = {
      passed: false,
      name: "Assertion 3-5: Chromium Runtime Execution",
      details: `Browser failed to execute: ${err.message}`,
    };
    results.push(failObj);
    console.log(fail(failObj.details));
  }

  // Assertion 6: API State Probe
  if (options.api) {
    console.log(info(`Probing backend API at ${options.api}...`));
    const apiRes = await checkApiHealth(options.url, options.api);
    results.push(apiRes);
    console.log(apiRes.passed ? pass(apiRes.details) : fail(apiRes.details));
  }

  // Final Summary & Exit Code
  const durationMs = Date.now() - startTime;
  const allPassed = results.every((r) => r.passed);
  console.log(summaryBox(allPassed, results, durationMs));

  if (allPassed) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL GATECHECK SYSTEM ERROR:", err);
  process.exit(1);
});
