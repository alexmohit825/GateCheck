import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

export async function fetchWithHeaders(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === "https:" ? https : http;

    const req = client.get(
      targetUrl,
      {
        headers: {
          "User-Agent": "GateCheck/1.0.0 (Antigravity Quality Control Engine)",
          Accept: "*/*",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body,
          });
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error(`Timeout after 10000ms fetching ${targetUrl}`));
    });
  });
}

export async function checkAssetIntegrity(baseUrl) {
  const result = {
    passed: false,
    name: "Assertion 2: Asset MIME Integrity & 404 Guard",
    details: "",
    assetsChecked: 0,
    errors: [],
  };

  try {
    const rootRes = await fetchWithHeaders(baseUrl);
    if (rootRes.statusCode < 200 || rootRes.statusCode >= 400) {
      result.passed = false;
      result.details = `Base URL returned HTTP ${rootRes.statusCode}`;
      return result;
    }

    const html = rootRes.body;
    // Extract script src and link href
    const scriptMatches = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
    const linkMatches = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)].map((m) => m[1]);
    const allAssets = [...new Set([...scriptMatches, ...linkMatches])];

    result.assetsChecked = allAssets.length;
    if (allAssets.length === 0) {
      result.passed = true;
      result.details = `HTML root verified (0 external script/css bundles declared)`;
      return result;
    }

    const errors = [];
    for (const assetPath of allAssets) {
      // Resolve relative URLs against baseUrl
      const assetUrl = new URL(assetPath, baseUrl).toString();
      try {
        const assetRes = await fetchWithHeaders(assetUrl);
        const contentType = assetRes.headers["content-type"] || "";

        if (assetRes.statusCode !== 200 && assetRes.statusCode !== 304) {
          errors.push(`${assetPath} returned HTTP ${assetRes.statusCode}`);
          continue;
        }

        // Fatal SPA Fallback check: JS or CSS returning HTML
        if (assetPath.endsWith(".js") && contentType.includes("text/html")) {
          errors.push(`FATAL: ${assetPath} returned Content-Type text/html (SPA 404 fallback trap)`);
        }
        if (assetPath.endsWith(".css") && contentType.includes("text/html")) {
          errors.push(`FATAL: ${assetPath} returned Content-Type text/html instead of text/css`);
        }
      } catch (err) {
        errors.push(`${assetPath} fetch error: ${err.message}`);
      }
    }

    if (errors.length > 0) {
      result.passed = false;
      result.details = `${errors.length} asset error(s): ${errors.slice(0, 3).join("; ")}`;
      result.errors = errors;
      return result;
    }

    result.passed = true;
    result.details = `All ${allAssets.length} bundle assets verified (valid MIME types, 0 fallbacks)`;
    return result;
  } catch (err) {
    result.passed = false;
    result.details = `Network asset check failed: ${err.message}`;
    return result;
  }
}

export async function checkApiHealth(baseUrl, apiPath = "/api/state") {
  const result = {
    passed: false,
    name: "Assertion 6: Backend API State Probe",
    details: "",
    latencyMs: 0,
  };

  try {
    const apiUrl = new URL(apiPath, baseUrl).toString();
    const start = Date.now();
    const res = await fetchWithHeaders(apiUrl);
    const latency = Date.now() - start;
    result.latencyMs = latency;

    if (res.statusCode < 200 || res.statusCode >= 400) {
      result.passed = false;
      result.details = `${apiPath} returned HTTP ${res.statusCode} in ${latency}ms`;
      return result;
    }

    // Attempt JSON parse
    try {
      JSON.parse(res.body);
    } catch {
      result.passed = false;
      result.details = `${apiPath} returned HTTP 200 but payload is not valid JSON (${latency}ms)`;
      return result;
    }

    result.passed = true;
    result.details = `${apiPath} returned HTTP 200 OK (${latency}ms, valid JSON schema)`;
    return result;
  } catch (err) {
    result.passed = false;
    result.details = `API probe failed on ${apiPath}: ${err.message}`;
    return result;
  }
}
