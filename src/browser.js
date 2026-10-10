import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

function findBrowserBinary() {
  const chromePaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
  ];
  for (const p of chromePaths) {
    if (fs.existsSync(p)) return p;
  }

  const edgePaths = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  for (const p of edgePaths) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error("Neither Google Chrome nor Microsoft Edge could be located on this machine.");
}

async function getDebuggerUrl(port, retries = 15) {
  for (let i = 0; i < retries; i++) {
    try {
      const data = await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/json`, (res) => {
          let raw = "";
          res.on("data", (chunk) => (raw += chunk));
          res.on("end", () => resolve(raw));
        });
        req.on("error", reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error("CDP discovery timeout"));
        });
      });

      const targets = JSON.parse(data);
      const page = targets.find((t) => t.type === "page");
      if (page && page.webSocketDebuggerUrl) {
        return page.webSocketDebuggerUrl;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new Error(`Failed to discover Chrome DevTools Protocol targets on port ${port} after ${retries} attempts.`);
}

export async function checkBrowserRuntime(targetUrl, options = {}) {
  const { assertText = [], selector, timeoutMs = 8000 } = options;
  const binary = findBrowserBinary();
  const port = 9600 + Math.floor(Math.random() * 300);
  const tempProfile = path.join(os.tmpdir(), `gatecheck_profile_${port}`);

  if (!fs.existsSync(tempProfile)) {
    fs.mkdirSync(tempProfile, { recursive: true });
  }

  const chrome = spawn(binary, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempProfile}`,
    "--no-sandbox",
    "--disable-gpu",
    "--disable-background-networking",
    targetUrl,
  ]);

  const runtimeResult = {
    exceptionAssertion: {
      name: "Assertion 3: Chromium CDP Runtime Exception Check",
      passed: false,
      details: "",
      exceptions: [],
    },
    domAssertion: {
      name: "Assertion 4: DOM Hydration & Root Mount Check",
      passed: false,
      details: "",
      htmlLength: 0,
    },
    spinnerAssertion: {
      name: "Assertion 5: Infinite Spinner / Frozen State Gate",
      passed: false,
      details: "",
    },
  };

  try {
    const wsUrl = await getDebuggerUrl(port);
    const ws = new globalThis.WebSocket(wsUrl);

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error(`Timeout after ${timeoutMs}ms waiting for browser evaluation.`));
      }, timeoutMs);

      const capturedExceptions = [];
      const capturedConsoleErrors = [];

      ws.onopen = () => {
        ws.send(JSON.stringify({ id: 1, method: "Runtime.enable" }));
        ws.send(JSON.stringify({ id: 2, method: "Console.enable" }));
        ws.send(JSON.stringify({ id: 3, method: "Log.enable" }));

        // Wait 3.5s for React hydration, initial network requests, and DOM paint
        setTimeout(() => {
          const evalExpr = `({
            htmlLength: document.getElementById("root")?.innerHTML?.length || document.body.innerHTML?.length || 0,
            rootExists: !!document.getElementById("root"),
            bodyText: document.body.innerText || "",
            hasActiveSpinner: !!document.querySelector(".animate-spin, [data-testid*='loading'], [data-testid*='spinner']"),
            selectorExists: ${selector ? `!!document.querySelector(${JSON.stringify(selector)})` : "true"}
          })`;

          ws.send(
            JSON.stringify({
              id: 10,
              method: "Runtime.evaluate",
              params: { expression: evalExpr, returnByValue: true },
            })
          );
        }, 3500);
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.method === "Runtime.exceptionThrown") {
          const details = msg.params.exceptionDetails;
          const text = details.exception?.description || details.text || "Unknown runtime exception";
          capturedExceptions.push(text);
        } else if (msg.method === "Console.messageAdded") {
          if (msg.params.message.level === "error") {
            capturedConsoleErrors.push(msg.params.message.text);
          }
        } else if (msg.id === 10) {
          clearTimeout(timeout);
          const val = msg.result?.result?.value || {};

          // Assertion 3: Zero Runtime Exceptions
          if (capturedExceptions.length === 0) {
            runtimeResult.exceptionAssertion.passed = true;
            runtimeResult.exceptionAssertion.details = `0 unhandled runtime exceptions or React crashes detected`;
          } else {
            runtimeResult.exceptionAssertion.passed = false;
            runtimeResult.exceptionAssertion.details = `${capturedExceptions.length} runtime exception(s): ${capturedExceptions[0].slice(0, 160)}`;
            runtimeResult.exceptionAssertion.exceptions = capturedExceptions;
          }

          // Assertion 4: DOM Hydration
          runtimeResult.domAssertion.htmlLength = val.htmlLength || 0;
          let domErrors = [];

          if ((val.htmlLength || 0) < 300) {
            domErrors.push(`DOM #root is nearly empty (${val.htmlLength || 0} bytes). Expected > 300 bytes after hydration.`);
          }

          if (assertText && assertText.length > 0) {
            for (const text of assertText) {
              if (!val.bodyText.includes(text)) {
                domErrors.push(`Required text "${text}" was not found in rendered DOM.`);
              }
            }
          }

          if (selector && !val.selectorExists) {
            domErrors.push(`Required CSS selector "${selector}" did not match any element in DOM.`);
          }

          if (domErrors.length === 0) {
            runtimeResult.domAssertion.passed = true;
            runtimeResult.domAssertion.details = `Root mounted with ${val.htmlLength.toLocaleString()} bytes. All text/selector assertions verified.`;
          } else {
            runtimeResult.domAssertion.passed = false;
            runtimeResult.domAssertion.details = domErrors.join("; ");
          }

          // Assertion 5: Spinner Gate
          if (val.hasActiveSpinner) {
            runtimeResult.spinnerAssertion.passed = false;
            runtimeResult.spinnerAssertion.details = `Active spinner (.animate-spin) still running after 3.5s. App appears stuck in loading state.`;
          } else {
            runtimeResult.spinnerAssertion.passed = true;
            runtimeResult.spinnerAssertion.details = `Zero frozen spinners detected after hydration window`;
          }

          ws.close();
          resolve();
        }
      };

      ws.onerror = (err) => {
        clearTimeout(timeout);
        reject(err);
      };
    });
  } finally {
    try {
      chrome.kill("SIGKILL");
    } catch {}
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch {}
  }

  return runtimeResult;
}
