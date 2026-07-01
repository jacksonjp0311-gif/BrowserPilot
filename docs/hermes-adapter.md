# Hermes Adapter

BrowserPilot can target Hermes Agent through the Hermes API Server adapter.

Hermes exposes an OpenAI-compatible API server, normally at:

```text
http://localhost:8642
```

BrowserPilot sends side-panel chat to:

```text
POST /v1/chat/completions
```

with:

```text
Authorization: Bearer <API_SERVER_KEY>
X-Hermes-Session-Key: browserpilot-edge-tab-operator
```

The stable `X-Hermes-Session-Key` keeps BrowserPilot in one Hermes session across browser and Hermes restarts.

## Hermes Setup

Install and configure Hermes first:

```powershell
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
hermes setup
```

Enable the API server platform in Hermes and set a strong `API_SERVER_KEY`.
Hermes defaults the API server to port `8642`.

Then open BrowserPilot Options:

1. Set **Agent Backend** to **Hermes Agent**.
2. Set **Hermes API Server URL** to `http://localhost:8642`.
3. Paste the same `API_SERVER_KEY`.
4. Click **Test connection**.
5. Save and reload the extension.

## Browser Control Contract

Hermes receives the same browser-control contract as AGNT:

```text
AGNT_EXEC: [{"kind":"navigate","url":"https://example.com"}]
```

BrowserPilot parses that line and executes commands against the active tab.

Hermes mode does not open or mirror into AGNT `/chat`; it keeps continuity through Hermes session headers and the extension's local chat history.
