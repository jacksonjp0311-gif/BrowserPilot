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

See the full details and examples in this file’s history and in the extension sources.

## Edge Copilot behavior

When **Edge Copilot: ON**, BrowserPilot evaluates each command via SymTorch policy before executing.

- allow → execute
- block → fail the command and stop the sequence

See:

- `docs/EDGE_COPILOT.md`
