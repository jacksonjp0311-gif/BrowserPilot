# Architecture 🔭

BrowserPilot is a **bridge** between a real user tab and your local AGNT agent stack.

## Components

### 1) Content Script (`contentScript.js`)

- Injects the floating **AGNT** button.
- Captures bounded page context (URL/title/selection/text cap).
- Executes page-local commands (click/type/scroll/etc.) via message passing.

### 2) Background Service Worker (`background.js`)

- Talks to AGNT over HTTP.
- Creates/selects the `Edge Tab Operator` agent.
- Streams SSE responses back to the side panel.
- Executes privileged commands (navigate/openTab/closeTab).
- **Edge Copilot**: calls SymTorch policy evaluation before executing commands.

### 3) Side Panel (`sidepanel.html` + `sidepanel.js`)

- The operator cockpit:
  - Select agent
  - Capture context
  - Toggle mode (OFF / Jarvis / Edge Copilot)
  - Display live streamed agent output
  - Parse and execute `AGNT_EXEC:` blocks

### 4) AGNT Agent (`Edge Tab Operator`)

- Lives in AGNT’s DB as an agent record.
- Has **no assigned tools** for this surface (`enabledTools: []`).
- Controls the tab only by emitting `AGNT_EXEC`.

## Dataflow

```text
Page → (context capture) → Side Panel → AGNT Agent → AGNT_EXEC JSON → Side Panel → Background → Tab
```

In Edge Copilot mode, the Background adds:

```text
AGNT_EXEC → SymTorch policy (AGNT tool) → allow/block → execute
```

## Why this design

- **No hidden actions**: commands are explicit JSON.
- **No separate Playwright browser**: the agent acts in the tab you already trust.
- **Policy-ready**: actions are bounded, observable, and can be evaluated.
