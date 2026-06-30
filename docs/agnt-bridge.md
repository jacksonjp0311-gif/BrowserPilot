# AGNT Bridge 🌉

BrowserPilot keeps the AGNT bridge from the original Edge Tab Operator prototype.

## Local server

Default:

```text
http://localhost:3333
```

Users can override this in the extension Options page.

## Auth

Current install flow uses an AGNT bearer token pasted into Options.

```text
Authorization: Bearer <token>
```

## Agent selection

On startup, the extension lists AGNT agents:

```text
GET /api/agents/
```

It creates/selects the agent named:

```text
Edge Tab Operator
```

Creation:

```text
POST /api/agents/save
```

The saved agent has **no assigned backend tools** and is prompted to control the current browser tab by emitting `AGNT_EXEC` JSON.

## Chat

The side panel sends chat to:

```text
POST /api/agents/:id/chat
```

Request:

```json
{
  "message": "user request",
  "context": {
    "pageContext": {},
    "jarvisMode": true,
    "edgeCopilotMode": false,
    "tabControl": {}
  },
  "enabledTools": []
}
```

`enabledTools: []` is intentional: BrowserPilot wants the agent to emit tab commands rather than launching backend browser automation.

## Canonical AGNT chat mirror

BrowserPilot also opens/focuses AGNT `/chat` and posts:

```js
window.postMessage({
  type: "AGNT_EXTENSION_SEND",
  source: "agnt-browser-agents",
  message,
  agentId,
  agentName,
  pageContext
}, "*");
```

AGNT’s chat screen listens and submits through the normal chat path.
