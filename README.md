# GateCheck: Deterministic Pre-Flight Quality Control Engine

**GateCheck** is a hardware-backed, deterministic quality control engine for all web, mobile, and serverless applications built in Dr. A. Alex Mohit's Antigravity ecosystem.

It replaces prompt-based assertions and superficial `curl` checks with **6 hard programmatic gates** executed by real headless Chromium instances via the Chrome DevTools Protocol (CDP).

---

## ⚖️ The 6 Non-Negotiable Gates

| Gate | Assertion Type | Failure Condition |
| :--- | :--- | :--- |
| **Assertion 1** | **Git Sync & Clean Tree** | Uncommitted files (`git status --porcelain`) or unpushed commits. |
| **Assertion 2** | **Asset MIME & 404 Guard** | JavaScript/CSS bundles returning `text/html` (SPA fallback trap) or non-200. |
| **Assertion 3** | **Chromium CDP Runtime** | Unhandled JS exceptions, React invariant crashes (e.g. #310), or unhandled promises. |
| **Assertion 4** | **DOM Hydration & Mount** | `#root` element has < 300 bytes after hydration, or required texts/selectors missing. |
| **Assertion 5** | **Infinite Spinner Protection** | Active loading indicators (`.animate-spin`) frozen after hydration window. |
| **Assertion 6** | **API State Probe** | Backend route fails to return HTTP 200 within 3,000ms or returns invalid JSON. |

---

## 🚀 CLI Usage

```powershell
# Basic usage against any web URL:
gatecheck https://etf-rebalancer-afolrgjyzq-uw.a.run.app

# Full project pre-flight verification:
gatecheck https://etf-rebalancer-afolrgjyzq-uw.a.run.app `
  --dir C:\Users\mohal\Documents\antigravity\ETF-Rebalancer `
  --assert-text "Holdings & Target Allocation" `
  --assert-text "How ETF Rebalancer Works" `
  --api /api/state
```

---

## 🚦 Exit Codes
- **`0`**: ALL assertions passed. Application is certified operational.
- **`1`**: ONE OR MORE assertions failed. The deployment/task must NOT be reported as complete.
