# Security Model 🔒

BrowserPilot is local-first browser control. It should be treated as powerful software.

## Current boundaries

- The extension talks to a user-configured AGNT server.
- AGNT auth is a bearer token stored in extension sync storage.
- Browser actions are limited to the command types implemented in `contentScript.js` and `background.js`.
- Page context capture is bounded:
  - selection is capped
  - page text is capped
  - screenshot capture is viewport-only
- The AGNT agent is instructed not to use backend browser automation tools.
- The side panel sends `enabledTools: []` for direct agent chat.

## Cyber Snapshot

- Cyber Snapshot is user-initiated.
- It captures visible selected page-region content.
- It inserts extracted text into the side-panel composer for human review.
- It does not auto-send.
- It does not capture browser chrome.
- It is not autonomous tab execution.

## Context Radar

- Context Radar is user-initiated.
- It highlights likely visible page context items with a semi-transparent HUD.
- It captures text only after the user chooses a highlighted target action.
- Available actions are Capture, Watch, Target, and Ignore.
- Watch arms the existing visible-region watcher for a user-selected target.
- Ignore stores a local preference to suppress repeated target types in future scans.
- It inserts captured target text and metadata into the composer for human review.
- It does not auto-send.
- It does not click, type, submit, or execute `AGNT_EXEC`.

## Threat Scan / Threat Radar

- Threat Scan is user-initiated and local-first.
- It performs a DOM-first static scan only.
- It does not execute untrusted page JavaScript.
- It does not fetch suspicious URLs.
- It does not auto-send raw page data to AGNT.
- Medium/high findings show a centered red HUD.
- Threat Screens can be opened from the red HUD to inspect per-finding evidence cards, risk/severity, redacted previews, element hints, nearest headings, visibility state, source rectangles, CSS paths, hashes, and local IP indicators.
- Threat Timeline and severity filters help navigate local findings without changing the underlying report or risk score.
- Report to Chat is explicit user-approved escalation. It sends a compact local evidence bundle to the selected AGNT chat and may include available Cyber Snapshot, Context Radar, page context, and viewport capture metadata. It does not send the screenshot image payload by default.
- Threat Lock can block risky agent commands while preserving safe observation commands.
- Findings are risk signals, not proof of malware.
- Threat Screens are evidence-navigation aids, not malware proof or IP attribution.

## Extract IP Address

- IP extraction is local parsing only.
- It supports IPv4, IPv6, multiple indicators, deduplication, and basic public/private/reserved classification.
- It does not ping, port scan, DNS enrich, attack, report, or attribute.
- IP addresses are infrastructure indicators, not proof of attacker identity.

## Threat Review Sandbox

- Threat Review requires explicit human approval.
- BrowserPilot can either insert a redacted review prompt into the composer or, when the user clicks Report to Chat, auto-send a compact review request to the selected AGNT chat.
- Container/disposable isolation is preferred.
- Python VENV fallback is not a security boundary.
- Static review must not fetch suspicious URLs or execute page code.
- Raw evidence is not retained by default.
- Wipe certificates verify directory absence only; they are not forensic secure erase.

## Authority Reports

- BrowserPilot does not auto-submit reports.
- BrowserPilot does not publicly post IP addresses.
- BrowserPilot does not provide attack, scan, retaliation, or doxxing actions.
- Authority packages are local/exportable evidence bundles for responsible disclosure.

## Modes (and what they mean)

BrowserPilot runs in one of three control modes:

1. **Control: OFF** — chat only (no `AGNT_EXEC` execution)
2. **Jarvis: ON** — executes `AGNT_EXEC` commands directly
3. **Edge Copilot: ON** — executes `AGNT_EXEC` only after SymTorch policy evaluation

Edge Copilot is implemented in `background.js`:

- `commandRiskScore()` computes a transparent risk score.
- BrowserPilot calls AGNT’s SymTorch tool endpoint.
- If SymTorch returns `allow(X)` → execute.
- If SymTorch returns `block(X)` → block.

Fail-closed behavior:

- If `symtorch-policy-bundle-evaluate` is not available in AGNT, Edge Copilot blocks execution.

## Current risks

- The extension has broad host access because it is designed to operate on arbitrary user-selected pages.
- The bearer-token setup is convenient but not ideal for distribution.
- Site-specific helpers (e.g. X composer helpers) can break when the target site changes its DOM.

## Recommended hardening

1. Add JSON schema validation for every `AGNT_EXEC` command before execution.
2. Add a confirmation / authorize flow for medium-risk actions.
3. Replace pasted bearer tokens with a short-lived local AGNT token broker.
4. Add a visible execution log that records command JSON + results + SymTorch trace snapshot.
5. Split broad optional permissions into task-specific prompts.
