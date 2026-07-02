# Folder Purpose

## S - Specification

Repository Context Canon and RCC-N support surface for BrowserPilot.

## H - Hooks

Inbound hooks:

- `README.md`
- `README_90_SECONDS.md`
- `docs/README.md`
- `docs/rcc-nexus.md`
- `docs/rehydration-protocol.md`
- `docs/failure-modes.md`
- `rcc/nexus/route_map.json`

Outbound hooks:

- Browser adapter folders in `apps/`
- Legacy adapter in `extension/`
- Validation and packaging scripts in `scripts/`
- Evidence reports in `reports/rcc_nexus/`

## A - Artifacts

Evidence / output surfaces:

- `reports/rcc_nexus/`
- `dist/`
- validation command output

## T - Theory / Basis

Governed by BrowserPilot's lightweight RCC-N profile and RHP resume discipline.

RCC-N basis:

```text
Human README -> AI quick README -> RCC Nexus README -> route map -> Echo Location -> validation
```

RHP basis:

```text
anchor -> load origin -> measure drift -> rehydrate -> validate -> compound
```

## I - Invariants

- Preserve local-first defaults.
- Preserve human-triggered capture and reporting.
- Preserve Edge and Chrome parity unless divergence is declared.
- Preserve evidence-bound threat language.
- Preserve non-claim locks.
- Navigation is not validation.
- Context reconstruction is not correctness.

## E - Examples

Validation examples:

```powershell
npm run validate
npm run validate:rcc
```

## RCC Nexus Echo Location

Sphere Position:

- Shell: center
- Meridian(s): browser-control, documentation, safety, packaging
- Sector: rcc
- Version / TTL: BrowserPilot-RCC-N-v0.1 / 180 days
- Last Verified: 2026-07-02

Local Role:

- Repository context and route surface for BrowserPilot.

Evidence Surface:

- `reports/rcc_nexus/`
- `dist/`

Validation Surface:

```powershell
npm run validate:rcc
```

Claim Boundary:

- This folder improves navigation and agent orientation only. It does not prove code correctness, patch safety, extension runtime behavior, security, production readiness, or threat detection accuracy.

Non-Claim Locks:

- navigation_is_not_validation
- documentation_is_not_correctness
- context_reconstruction_is_not_code_quality
- threat_signal_is_not_malware_proof
- ip_indicator_is_not_attacker_identity
- validation_remains_required
