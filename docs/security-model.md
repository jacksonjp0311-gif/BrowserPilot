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
- It captures text only after the user clicks a highlighted target.
- It inserts captured target text and metadata into the composer for human review.
- It does not auto-send.
- It does not click, type, submit, or execute `AGNT_EXEC`.

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
