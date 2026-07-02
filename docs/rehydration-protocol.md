# Rehydration Protocol for BrowserPilot

The Rehydration Protocol (RHP) is BrowserPilot's resume-and-promote discipline. It prevents stale context from becoming durable repository state.

Public lock:

```text
The geometry must align before the output can compound.
```

BrowserPilot interpretation:

```text
The session must align to the current repository before it edits, packages, pushes, or claims a feature is working.
```

## Core Loop

```text
Anchor
-> Load Repository Origin
-> Extract Session Geometry
-> Measure Deviation
-> Detect Dehydration
-> Apply Rehydration
-> Validate Alignment
-> Issue Origin Certificate
-> Permit or Reject Compounding
-> Persist Evidence
-> Store Validated Delta
-> Prepare Next Session Origin
```

## BrowserPilot Version

### Anchor

Confirm repository, branch, and current status:

```powershell
git status --short --branch
git log -1 --oneline
```

### Load Repository Origin

Read:

```text
README.md
README_90_SECONDS.md
docs/README.md
docs/security-model.md
docs/rcc-nexus.md
rcc/README.md
rcc/nexus/README.md
rcc/nexus/route_map.json
```

### Extract Session Geometry

Identify which surface is being changed:

- Extension runtime: `apps/edge-extension`, `apps/chrome-extension`, `extension`
- Side panel operator flow: `sidepanel.html`, `sidepanel.js`
- Browser injection and HUDs: `contentScript.js`
- Service worker and side panel routing: `background.js`
- Safety model: `docs/security-model.md`, `sandbox/threat-review`
- Packaging and validation: `scripts`, `dist`
- Navigation layer: `README.md`, `README_90_SECONDS.md`, `docs/rcc-nexus.md`, `rcc`

### Measure Deviation

Look for mismatch between current claims and current files:

- README version differs from `package.json` or manifests.
- Edge and Chrome adapters diverge unintentionally.
- Docs mention removed buttons or old labels.
- Safety docs claim a gate that code does not enforce.
- Screenshots show controls not present in the extension.
- Route map points to missing files.

### Detect Dehydration

Treat the session as dehydrated if:

- It relies on another thread's memory without checking the repo.
- It assumes a previous push succeeded without checking `origin/main`.
- It edits one browser adapter but not the matching adapter.
- It changes a safety feature without updating failure modes.
- It claims validation without command output.

### Apply Rehydration

Repair stale context before editing:

- Re-read ownership docs.
- Re-run `rg` over affected feature names.
- Compare Edge, Chrome, and legacy adapters.
- Update docs and route maps together.
- Keep claim boundaries explicit.

### Validate Alignment

Run:

```powershell
npm run validate
npm run validate:rcc
```

Runtime certainty requires more than structural validation:

- Reload the extension in Edge or Chrome.
- Refresh the target http(s) page after reload.
- Confirm the AGNT floating button appears.
- Confirm Threat Scan, Cyber Snapshot, and Context Radar run on a normal page.
- Confirm browser-internal pages produce a clear non-injectable-page message.

For release work, also run:

```powershell
npm run package:edge
npm run package:chrome
```

### Origin Certificate

A BrowserPilot origin certificate is a short maintenance note containing:

- repo path
- branch and commit before edit
- changed surfaces
- validation commands run
- known unvalidated surfaces

It may live in a PR, commit message, release note, or local report under `reports/rcc_nexus/`.

## Compounding Gate

Durable mutation is allowed only after the session has aligned to the repo and validation passes.

Observation is allowed before alignment. Durable edits, release claims, package promotion, and push claims require alignment. No validation, no completion claim.

## Non-Claim Locks

- RHP does not prove code correctness.
- RHP does not prove security.
- RHP does not prove production readiness.
- RHP does not grant autonomous write authority.
- RHP does not replace extension reload testing.
- RHP does not replace manual browser QA for side panel behavior.
