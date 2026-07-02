# BrowserPilot Failure Modes

This file records the failure modes that matter most for BrowserPilot's current architecture. It is an operator and maintainer surface, not proof that the extension is safe.

## Directory Risk Map

| Surface | Directory | Main risk | Required check |
| --- | --- | --- | --- |
| Edge adapter | `apps/edge-extension` | Edge side panel and MV3 service worker behavior diverges from Chrome | `npm run validate`, reload in Edge for runtime changes |
| Chrome adapter | `apps/chrome-extension` | Chrome parity breaks while Edge still works | `npm run validate`, reload in Chrome for runtime changes |
| Legacy adapter | `extension` | Stale fallback drifts from current docs | `npm run validate` |
| Side panel UI | `sidepanel.html`, `sidepanel.js` | Buttons exist but messages are not routed or helpers are missing | `npm run validate`, manual click path |
| Content script | `contentScript.js` | HUD injection fails, tab context invalidates, or page tools are missing | `npm run validate`, reload extension |
| Background worker | `background.js` | Side panel opens outside user gesture, tab ID drifts, policy route fails closed unexpectedly | `npm run validate`, inspect extension service worker |
| Safety docs | `docs/security-model.md` | Docs overclaim safety or omit current risk | docs review plus `npm run validate:rcc` |
| RCC navigation | `rcc`, `docs/rcc-nexus.md` | Route map goes stale and agents edit the wrong surface | `npm run validate:rcc` |
| Packaging | `scripts`, `dist` | Built zip does not match current source | `npm run package:edge`, `npm run package:chrome` |

## Runtime Failure Modes

### Side Panel Open Failure

Symptoms:

- Floating AGNT button shows `sidePanel.open()` user gesture error.
- Edge extension errors show `Extension context invalidated`.
- Side panel opens from extension page but not from page button.

Likely causes:

- Reloaded extension invalidated old content script.
- `sidePanel.open()` was called outside a direct user gesture.
- Active tab ID changed or went stale.

Mitigation:

- Reload the extension.
- Refresh the page tab to reinject the content script.
- Keep the content-script button path as the user-gesture entry point.
- Preserve fallback messaging that asks the user to click the extension action if Edge denies side panel open.

### Receiving End Does Not Exist

Symptoms:

- Side panel says `Could not establish connection. Receiving end does not exist.`
- Threat Scan, Cyber Snapshot, or Context Radar cancels.

Likely causes:

- Content script was not injected into the active tab.
- The tab is an internal browser page or otherwise not injectable.
- Tab ID was stale.

Mitigation:

- Re-inject page tools before page-local actions.
- Re-resolve active tab before sending page messages.
- Show a clear local error for non-injectable pages.

### Agent List Shape Drift

Symptoms:

- Side panel reports `agents.slice is not a function`, `agents.filter is not a function`, or the default agent is missing.
- Agent search is blank even though AGNT has agents.

Likely causes:

- AGNT changed the `/api/agents/` response shape from an array to an object envelope such as `{ agents }`, `{ data }`, `{ items }`, or a paginated result.

Mitigation:

- Normalize agent-list responses in the background worker and side panel.
- Ensure the default `Edge Tab Operator` path returns an array after create or lookup.
- Keep `npm run validate` checking for response normalization helpers.

### Floating Button Is Not Persistent

Symptoms:

- The AGNT floating button appears on some normal pages but disappears after site navigation or DOM rewrites.
- Threat Scan, Cyber Snapshot, and Context Radar only work on pages where the content script is currently alive.

Likely causes:

- Browser-internal pages cannot run extension content scripts.
- A site rewrote the document root or removed injected elements.
- The extension reloaded and the old page still has stale injected DOM.

Mitigation:

- The content script should replace stale buttons on load and periodically remount the current runtime button.
- Refresh normal http(s) tabs after extension reload.
- Treat `chrome://`, `edge://`, extension pages, and store pages as non-injectable by design.

### Threat Signal Confusion

Symptoms:

- User sees `Threat Signal Detected` and assumes confirmed malware.

Likely causes:

- Local DOM indicators are being read as attribution or proof.

Mitigation:

- Keep copy as "risk signals" and "findings."
- Preserve non-claim language in Threat Radar and reports.
- Do not fetch suspicious URLs or execute page scripts.

### IP Attribution Drift

Symptoms:

- Extracted IP addresses are treated as attacker identity.

Likely causes:

- Public/private/reserved classification is mistaken for enrichment or attribution.

Mitigation:

- Keep extraction local-only.
- Say IPs are indicators, not identity.
- Do not auto-report, scan, ping, or enrich.

### Cross-Adapter Drift

Symptoms:

- Edge has a feature that Chrome lacks, or the legacy adapter carries stale text.

Likely causes:

- Manual edits were applied to only one adapter.

Mitigation:

- Search all adapters with `rg`.
- Update Edge and Chrome together unless divergence is intentional.
- Run `npm run validate`.

### Documentation Dehydration

Symptoms:

- README, screenshots, manifests, and packaged zips disagree.

Likely causes:

- Work resumed from memory or another repo without rehydrating current state.

Mitigation:

- Follow `docs/rehydration-protocol.md`.
- Run `npm run validate:rcc`.
- Rebuild packages after runtime changes.

## Promotion Rule

Do not claim a BrowserPilot change is shipped until:

- The repo status and latest commit are known.
- The affected runtime surfaces have been inspected.
- `npm run validate` passes.
- `npm run validate:rcc` passes.
- Packages are rebuilt for release-facing changes.
