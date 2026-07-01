# BrowserPilot Toolbox

BrowserPilot Toolbox is a companion capability pack for BrowserPilot and AGNT.

It contains browser-agent skills that are designed to run through the BrowserPilot/Jarvis permission path:

```text
Agent proposes action -> BrowserPilot executes in approved tab -> telemetry graph records result
```

## Included Skills

- `dom-audit-probe` - user-approved DOM, browser, and challenge-surface diagnostics for the current tab.

## Safety Boundary

This toolbox does not include stealth, bot-protection bypass, automatic challenge solving, or cookie/token extraction. Skills collect bounded diagnostics and sanitized indicators only.

## AGNT_EXEC Example

```text
AGNT_EXEC: [{"kind":"domAudit","includeResources":true}]
```

The result can be sent to AGNT telemetry and used by the `browserpilot_telemetry_graph` tool during tool/skill selection.
