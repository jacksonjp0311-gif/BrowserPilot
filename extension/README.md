# BrowserPilot for Edge

This is a Manifest V3 Edge extension that gives you a **side panel agent chat** on every page.

BrowserPilot keeps the AGNT bridge from the Edge Tab Operator prototype. It connects to your local AGNT server, creates or selects the `Edge Tab Operator` agent, and executes `AGNT_EXEC` browser commands in the current tab.

## Features

- Floating **AGNT** button injected into all pages
- Opens a **Side Panel** chat UI
- Captures page URL/title and current text selection
- Talks to your local AGNT server (`http://localhost:3333` by default)
- Legacy compatibility surface. Current Threat Scan, Cyber Snapshot, Context Radar, and Extract IP Address docs are centered on `apps\edge-extension` and `apps\chrome-extension`.

## Setup (Edge)

1. Open: `edge://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder:

`C:\\Users\\jacks\\OneDrive\\Desktop\\agnt-evo\\browser-agents-edge-extension`

For the standalone BrowserPilot repo, select:

`C:\\Users\\jacks\\OneDrive\\Desktop\\browser-pilot\\apps\\edge-extension`

5. Open the extension **Options** page and set:
   - AGNT Base URL
   - AGNT token (from AGNT web app: `localStorage.getItem('token')`)

## Notes

- This version uses a long-lived token pasted into Options. The planned hardening path is a short-lived local token broker.
- BrowserPilot keeps browser actions explicit through `AGNT_EXEC` and keeps safety findings evidence-bound. See `..\docs\security-model.md`, `..\docs\rcc-nexus.md`, and `..\docs\rehydration-protocol.md`.

## Mini README Surface

## S - Specification

Legacy BrowserPilot extension adapter kept for backwards compatibility.

## H - Hooks

Inbound hooks:

- `README.md`
- `docs/failure-modes.md`

Outbound hooks:

- `background.js`
- `contentScript.js`
- `sidepanel.html`
- `sidepanel.js`

## A - Artifacts

Evidence / output surfaces:

- `dist/browser-pilot-legacy-extension.zip`
- validation output from `npm run validate`

## T - Theory / Basis

```text
legacy adapter -> bounded context -> explicit AGNT_EXEC -> browser action
```

## I - Invariants

- Keep legacy adapter structurally valid.
- Do not present legacy-only state as current Edge/Chrome feature parity.
- Current feature docs center on `apps/edge-extension` and `apps/chrome-extension`.

## E - Examples

```powershell
npm run validate
npm run package:legacy
```

## RCC Nexus Echo Location

Sphere Position:

- Shell: outer
- Meridian(s): compatibility, browser-control
- Sector: extension
- Version / TTL: BrowserPilot-RCC-N-v0.2 / 180 days
- Last Verified: 2026-07-02

Local Role:

- Legacy compatibility adapter.

Validation Surface:

```powershell
npm run validate
```

Claim Boundary:

- This mini README does not prove current feature parity or browser runtime behavior.
