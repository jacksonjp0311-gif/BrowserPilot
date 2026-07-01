# Browser Adapters

BrowserPilot ships browser-specific adapters while keeping one AGNT bridge contract.

BrowserPilot can target either AGNT (`http://localhost:3333`) or Hermes Agent API Server (`http://localhost:8642`). Both backends receive the same browser-control protocol; AGNT can mirror into AGNT `/chat`, while Hermes uses `/v1/chat/completions` with a stable `X-Hermes-Session-Key`.

See:

```text
docs\hermes-adapter.md
```

## Edge

Path:

```text
apps\edge-extension
```

Load in:

```text
edge://extensions
```

The Edge adapter is the direct continuation of the original AGNT Edge Tab Operator prototype.

## Chrome

Path:

```text
apps\chrome-extension
```

Load in:

```text
chrome://extensions
```

The Chrome adapter uses the same Manifest V3 side panel pattern and the same AGNT bridge:

- `Edge Tab Operator` agent
- `/api/agents/:id/chat`
- `AGNT_EXTENSION_SEND`
- `agnt-browser-agents`
- `AGNT_EXEC:`

Chrome requires Side Panel support. The manifest sets:

```json
{
  "minimum_chrome_version": "114"
}
```

## Legacy Adapter

Path:

```text
extension
```

This remains available so the originally loaded Edge extension path keeps working. Prefer `apps\edge-extension` and `apps\chrome-extension` for new packaging.

## Packaging

```powershell
npm run package:edge
npm run package:chrome
```

Outputs:

```text
dist\browser-pilot-edge-extension.zip
dist\browser-pilot-chrome-extension.zip
```

