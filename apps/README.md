# Folder Purpose

## S - Specification

Browser extension adapter surface for Edge and Chrome.

## H - Hooks

Inbound hooks:

- `README.md`
- `README_90_SECONDS.md`
- `docs/rcc-nexus.md`
- `rcc/nexus/route_map.json`

Outbound hooks:

- `apps/edge-extension`
- `apps/chrome-extension`
- package outputs in `dist/`

## A - Artifacts

Evidence / output surfaces:

- `dist/browser-pilot-edge-extension.zip`
- `dist/browser-pilot-chrome-extension.zip`
- validation output from `npm run validate`

## T - Theory / Basis

Governed by BrowserPilot-RCC-N-v0.2 and the local-first browser-agent bridge model.

BrowserPilot basis:

```text
human tab -> side panel -> AGNT/Hermes -> AGNT_EXEC -> policy/safety gate -> browser action
```

RCC-N basis:

```text
Human README -> RCC Nexus README -> AI Agent README -> route map -> Echo Location -> validation
```

## I - Invariants

- Preserve Edge and Chrome parity unless divergence is declared.
- Preserve Manifest V3 service worker boundaries.
- Preserve human-triggered capture and report surfaces.
- Preserve local-first defaults.
- Navigation is not validation.
- Extension reload behavior must be runtime-checked for browser certainty claims.

## E - Examples

Validation examples:

```powershell
npm run validate
npm run package:edge
npm run package:chrome
```

## RCC Nexus Echo Location

Sphere Position:

- Shell: middle
- Meridian(s): browser-control, runtime, safety
- Sector: apps
- Version / TTL: BrowserPilot-RCC-N-v0.2 / 180 days
- Last Verified: 2026-07-02

Local Role:

- Owns the current Edge and Chrome browser extension adapters.

Evidence Surface:

- `dist/`
- validation command output

Validation Surface:

```powershell
npm run validate
```

Claim Boundary:

- This mini README improves local navigation and adapter orientation. It does not prove extension runtime behavior, browser compatibility, code correctness, patch safety, or security.

Non-Claim Locks:

- navigation_is_not_validation
- documentation_is_not_correctness
- route_map_is_not_runtime_proof
- validation_remains_required
