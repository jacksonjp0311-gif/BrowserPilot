# BrowserPilot in 90 Seconds

BrowserPilot is a local-first browser-agent bridge for Edge and Chrome. It lets a local AGNT or Hermes agent operate the tab the user is already using through explicit `AGNT_EXEC` commands, while the side panel keeps the human in the loop.

## Start Here

1. Read `README.md` for the human overview and install path.
2. Read `docs/rcc-nexus.md` for the repository route map and integration boundaries.
3. Read `docs/rehydration-protocol.md` before resuming stale work, copying between repos, or promoting a release.
4. Read `docs/failure-modes.md` before changing extension control, threat scan, Cyber Snapshot, Context Radar, or reporting flows.
5. Validate before claiming done:

```powershell
npm run validate
npm run validate:rcc
```

## Human Surface

Use the side panel. Threat Scan, Cyber Snapshot, Context Radar, Scan Report, Extract IP Address, and AGNT Chat are user-triggered. BrowserPilot should not silently scrape, report, attribute, or execute risky actions.

## AI Surface

Read order for agent work:

```text
README.md -> README_90_SECONDS.md -> docs/README.md -> docs/rcc-nexus.md -> docs/rehydration-protocol.md -> docs/failure-modes.md -> rcc/README.md -> rcc/nexus/README.md
```

Do not treat navigation as validation. Do not treat a clean README as proof that the extension works. Run the validation commands and inspect changed extension files.

## Nexus Surface

RCC Nexus tells the agent where it is in this repository:

- Browser adapters live in `apps/edge-extension`, `apps/chrome-extension`, and `extension`.
- Security and operator boundaries live in `docs/security-model.md`.
- Route metadata lives in `rcc/nexus/route_map.json`.
- Evidence reports may be placed under `reports/rcc_nexus/`.

## Rehydration Surface

Before durable changes, align the session to the repo origin:

```text
anchor -> load repo origin -> inspect changed files -> detect drift -> repair stale context -> validate -> commit/push
```

No origin alignment, no durable mutation. No validation, no completion claim.
