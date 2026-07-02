# BrowserPilot for Chrome

This is a Manifest V3 Chrome extension that gives you a **side panel agent chat** on every page.

BrowserPilot keeps the AGNT bridge from the Edge Tab Operator prototype. It connects to your local AGNT server, creates or selects the `Edge Tab Operator` agent, and executes `AGNT_EXEC` browser commands in the current tab.

## Features

- Floating **AGNT** button injected into all pages
- Opens a **Side Panel** chat UI
- Captures page URL/title and current text selection
- Talks to your local AGNT server (`http://localhost:3333` by default)
- User-triggered Threat Scan, Cyber Snapshot, Context Radar, Scan Report, and Extract IP Address surfaces

## Setup (Chrome)

1. Open: `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder:

`C:\\Users\\jacks\\OneDrive\\Desktop\\browser-pilot\\apps\\chrome-extension`

For the standalone BrowserPilot repo, select:

`C:\\Users\\jacks\\OneDrive\\Desktop\\browser-pilot\\apps\\chrome-extension`

5. Open the extension **Options** page and set:
   - AGNT Base URL
   - AGNT token (from AGNT web app: `localStorage.getItem('token')`)

## Notes

- This version uses a long-lived token pasted into Options. The planned hardening path is a short-lived local token broker.
- BrowserPilot keeps browser actions explicit through `AGNT_EXEC` and keeps safety findings evidence-bound. See `..\..\docs\security-model.md`, `..\..\docs\rcc-nexus.md`, and `..\..\docs\rehydration-protocol.md`.

## Mini README Surface

## S - Specification

Manifest V3 Chrome side panel adapter.

## H - Hooks

Inbound hooks:

- `apps/README.md`
- `README.md`
- `docs/failure-modes.md`

Outbound hooks:

- `background.js`
- `contentScript.js`
- `sidepanel.html`
- `sidepanel.js`

## A - Artifacts

Evidence / output surfaces:

- `dist/browser-pilot-chrome-extension.zip`
- Chrome extension reload/manual QA observations

## T - Theory / Basis

```text
Chrome tab -> content script -> side panel -> background worker -> AGNT/Hermes -> AGNT_EXEC
```

## I - Invariants

- Keep Chrome adapter behavior aligned with Edge unless divergence is declared.
- Keep Threat Scan, Cyber Snapshot, Context Radar, and Extract IP user-triggered.
- Keep browser actions explicit through `AGNT_EXEC`.

## E - Examples

```powershell
npm run validate
npm run package:chrome
```

## RCC Nexus Echo Location

Sphere Position:

- Shell: inner
- Meridian(s): browser-control, chrome, safety
- Sector: apps
- Version / TTL: BrowserPilot-RCC-N-v0.2 / 180 days
- Last Verified: 2026-07-02

Local Role:

- Chrome runtime adapter and operator side panel.

Validation Surface:

```powershell
npm run validate
```

Claim Boundary:

- This mini README does not prove Chrome runtime behavior after reload; manual Chrome verification remains required for browser-runtime claims.
