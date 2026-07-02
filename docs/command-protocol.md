# Command Protocol 🧾

BrowserPilot executes commands when an AGNT agent emits one line beginning with:

```text
AGNT_EXEC:
```

The text after the marker must be valid JSON. Preferred shape is an array:

```json
[
  { "kind": "navigate", "url": "https://example.com" },
  { "kind": "click", "css": "button[type='submit']" }
]
```

## Supported commands

The supported command surface is intentionally small.

- `navigate` (background)
- `openTab` (background)
- `closeTab` (background)
- `click` (content script)
- `type` (content script)
- `scroll` (content script)
- `waitForSelector` (content script)
- `pressKey` (content script; Ctrl+V intentionally rejected)
- `screenshot` (background captureVisibleTab, viewport only)
- `attachImage` (content script file input)
- `wait` (sidepanel local delay)

## Page tool control messages

The side panel can stop page-local tools without changing the saved chat or threat report state:

```json
{ "type": "BROWSERPILOT_STOP_PAGE_TOOLS" }
```

This clears Cyber Snapshot overlays, Context Radar overlays, transient Threat Radar HUDs, and Region Watch timers. It does not bypass Threat Lock, execute page JavaScript outside the content-script surfaces, or erase retained local report state.

See the full details and examples in this file’s history and in the extension sources.

## Edge Copilot behavior

When **Edge Copilot: ON**, BrowserPilot evaluates each command via SymTorch policy before executing.

- allow → execute
- block → fail the command and stop the sequence

See:

- `docs/EDGE_COPILOT.md`
