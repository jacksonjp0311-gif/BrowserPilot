# BrowserPilot Telemetry

BrowserPilot includes a lightweight sensory bus for AGNT.

The goal is not heavy analytics. The goal is agent awareness: enough realtime signal for AGNT to understand what the browser bridge is doing, how commands move, where risk decisions happen, and whether the side panel is healthy.

## AGNT Endpoints

BrowserPilot sends events to:

```text
POST /api/telemetry/browserpilot
```

AGNT exposes:

```text
GET /api/telemetry/browserpilot/recent?limit=100
GET /api/telemetry/browserpilot/summary?limit=200
GET /api/telemetry/browserpilot/graph
POST /api/telemetry/browserpilot/analyze
DELETE /api/telemetry/browserpilot
DELETE /api/telemetry/browserpilot/graph
```

The legacy execution endpoint is also accepted:

```text
POST /api/telemetry/execution
```

## What BrowserPilot Reports

- Side panel lifecycle: ready, clean slate, stop requested
- Browser connection state: tab activated, tab updated
- Context capture metadata: URL, title, selection length, page text length
- Chat flow: send started, response completed, duration, response length
- Command flow: command batch detected, command executed, command blocked, command error
- SymTorch policy metadata: risk, reason, allow/block state when available

## What BrowserPilot Avoids

- No raw page text in telemetry
- No raw chat message content in telemetry
- No passwords, tokens, cookies, API keys, or authorization headers
- No hidden browser automation window telemetry

The extension reports counts, timings, command kinds, bounded URL/title metadata, and policy summaries. AGNT also redacts sensitive field names server-side before keeping events.

## Storage Model

AGNT keeps an in-memory ring buffer for the latest BrowserPilot events and appends JSONL locally at:

```text
backend/data/browserpilot-telemetry.jsonl
```

AGNT also keeps a persistent graph at:

```text
backend/data/browserpilot-telemetry-graph.json
```

The side panel's **Analyze telemetry** button calls the analyzer endpoint, updates this graph, and returns a compact report with top events, top commands, pages, and tool-selection hints.

Telemetry failures are silent in the extension. Browser control and chat should continue even if telemetry is unavailable.
