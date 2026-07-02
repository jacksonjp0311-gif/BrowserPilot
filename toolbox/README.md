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

## Mini README Surface

## S - Specification

Companion BrowserPilot skill/toolbox capability surface.

## H - Hooks

Inbound hooks:

- `README.md`
- `docs/command-protocol.md`

Outbound hooks:

- `toolbox/skills/dom-audit-probe`

## A - Artifacts

Evidence / output surfaces:

- DOM audit JSON-safe output
- AGNT telemetry graph inputs

## T - Theory / Basis

```text
user-approved command -> BrowserPilot tab execution -> bounded diagnostics -> telemetry evidence
```

## I - Invariants

- No stealth.
- No challenge solving.
- No cookie, token, local storage, session storage, or authorization-header extraction.
- Diagnostics are bounded and sanitized.

## E - Examples

```text
AGNT_EXEC: [{"kind":"domAudit","includeResources":true}]
```

## RCC Nexus Echo Location

Sphere Position:

- Shell: outer
- Meridian(s): toolbox, diagnostics, safety
- Sector: toolbox
- Version / TTL: BrowserPilot-RCC-N-v0.2 / 180 days
- Last Verified: 2026-07-02

Local Role:

- Companion capability pack for BrowserPilot-controlled browser diagnostics.

Validation Surface:

```powershell
npm run validate
```

Claim Boundary:

- This mini README does not prove challenge bypass, stealth ability, browser safety, or diagnostic completeness.
