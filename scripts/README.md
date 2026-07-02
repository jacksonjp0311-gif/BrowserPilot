# Folder Purpose

## S - Specification

Automation, validation, icon generation, packaging, smoke-test, and RCC utility scripts.

## H - Hooks

Inbound hooks:

- `README.md`
- `README_90_SECONDS.md`
- `package.json`
- `rcc/nexus/route_map.json`

Outbound hooks:

- `dist/`
- `reports/rcc_nexus/`
- extension adapter folders

## A - Artifacts

Evidence / output surfaces:

- validation output
- packaged extension zips
- RCC checker output

## T - Theory / Basis

Automation basis:

```text
source tree -> structural validation -> package build -> evidence output
```

RCC-N basis:

```text
route map -> checker -> findings -> repair -> validation
```

## I - Invariants

- Scripts should fail loudly on missing runtime-critical files.
- Packaging should use current source folders.
- RCC checks validate navigation surfaces only, not runtime correctness.
- Do not treat package creation as browser reload success.

## E - Examples

Validation examples:

```powershell
npm run validate
npm run validate:rcc
npm run package:edge
npm run package:chrome
```

## RCC Nexus Echo Location

Sphere Position:

- Shell: middle
- Meridian(s): validation, packaging, agent
- Sector: scripts
- Version / TTL: BrowserPilot-RCC-N-v0.2 / 180 days
- Last Verified: 2026-07-02

Local Role:

- Owns automation and validation commands used by BrowserPilot maintainers.

Evidence Surface:

- terminal validation output
- `dist/`

Validation Surface:

```powershell
npm run validate
npm run validate:rcc
```

Claim Boundary:

- This mini README improves automation routing. It does not prove extension runtime behavior, browser compatibility, security, or production readiness.

Non-Claim Locks:

- validation_is_not_runtime_reload_proof
- package_is_not_release_quality_proof
- documentation_is_not_correctness
