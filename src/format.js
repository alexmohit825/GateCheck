// ANSI Formatting & Table Helpers for GateCheck

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
};

export function pass(text) {
  return `${colors.bold}${colors.green}[PASS]${colors.reset} ${text}`;
}

export function fail(text) {
  return `${colors.bold}${colors.red}[FAIL]${colors.reset} ${text}`;
}

export function warn(text) {
  return `${colors.bold}${colors.yellow}[WARN]${colors.reset} ${text}`;
}

export function info(text) {
  return `${colors.bold}${colors.cyan}[INFO]${colors.reset} ${text}`;
}

export function header(title) {
  const line = "═".repeat(64);
  return `\n${colors.bold}${colors.cyan}${line}\n  GATECHECK QUALITY CONTROL ENGINE: ${title}\n${line}${colors.reset}\n`;
}

export function summaryBox(allPassed, results, durationMs) {
  const line = "─".repeat(64);
  let out = `\n${colors.bold}${line}\n`;
  out += `  GATECHECK SUMMARY (${(durationMs / 1000).toFixed(2)}s)\n`;
  out += `${line}${colors.reset}\n`;

  for (const r of results) {
    const badge = r.passed ? `${colors.green}✔ PASS${colors.reset}` : `${colors.red}✖ FAIL${colors.reset}`;
    out += `  ${badge.padEnd(16)} ${colors.bold}${r.name}${colors.reset}\n`;
    if (r.details) {
      out += `  ${"".padEnd(8)} ${colors.dim}${r.details}${colors.reset}\n`;
    }
  }

  out += `\n${colors.bold}${line}${colors.reset}\n`;
  if (allPassed) {
    out += `${colors.bold}${colors.bgGreen}${colors.white}  ✔ FINAL VERDICT: EXIT CODE 0 [CERTIFIED OPERATIONAL]  ${colors.reset}\n`;
  } else {
    out += `${colors.bold}${colors.bgRed}${colors.white}  ✖ FINAL VERDICT: EXIT CODE 1 [PRE-FLIGHT GATE FAILED]  ${colors.reset}\n`;
  }
  out += `${colors.bold}${line}${colors.reset}\n`;
  return out;
}
