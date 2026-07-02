# DOM Audit Probe

The DOM Audit Probe runs inside the user-approved active tab through BrowserPilot.

It collects:

- page URL, title, origin, timestamp
- browser runtime diagnostics such as language, timezone, screen size, hardware concurrency, and WebDriver flag
- canvas/WebGL diagnostic hashes and renderer metadata when exposed by the browser
- loaded font families visible through `document.fonts`
- challenge-surface indicators for Cloudflare and Turnstile
- sanitized resource URLs from `performance.getEntriesByType("resource")`

It does not:

- bypass or solve challenges
- extract `cf_clearance`, `__cfduid`, cookies, local/session storage, tokens, or authorization headers
- modify the page
- hide automation or spoof fingerprints

## Command

```json
{"kind":"domAudit","includeResources":true}
```

## Output

The command returns a JSON-safe audit report. Network/resource URLs are stripped to origin + pathname so query strings and tokens are not captured.

## Mini README Surface

## S - Specification

User-approved DOM and browser diagnostic probe for the current BrowserPilot tab.

## H - Hooks

Inbound hooks:

- `toolbox/README.md`
- `docs/command-protocol.md`

Outbound hooks:

- `probe.js`
- AGNT telemetry graph inputs

## A - Artifacts

Evidence / output surfaces:

- JSON-safe DOM audit report

## T - Theory / Basis

```text
approved domAudit command -> page-local probe -> sanitized diagnostic report
```

## I - Invariants

- Do not bypass or solve challenges.
- Do not extract cookies, tokens, storage, or authorization headers.
- Do not modify the page.
- Do not spoof fingerprints.

## E - Examples

```json
{"kind":"domAudit","includeResources":true}
```

## RCC Nexus Echo Location

Sphere Position:

- Shell: inner
- Meridian(s): diagnostics, browser-control, safety
- Sector: toolbox
- Version / TTL: BrowserPilot-RCC-N-v0.2 / 180 days
- Last Verified: 2026-07-02

Local Role:

- Bounded DOM diagnostic skill.

Validation Surface:

- BrowserPilot command-path validation and manual inspection.

Claim Boundary:

- This mini README does not prove site compatibility, bot bypass, stealth, security, or diagnostic completeness.
