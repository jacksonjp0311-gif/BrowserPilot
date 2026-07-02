# Folder Purpose

## S - Specification

RCC root shell for BrowserPilot Nexus routing and navigation.

## H - Hooks

Inbound hooks:

- `README.md`
- `README_90_SECONDS.md`
- `rcc/README.md`
- `docs/rcc-nexus.md`

Outbound hooks:

- `rcc/nexus/route_map.json`
- `reports/rcc_nexus/`

## A - Artifacts

Evidence / output surfaces:

- `reports/rcc_nexus/`
- command output from `npm run validate:rcc`

## T - Theory / Basis

Governed by BrowserPilot-RCC-N-v0.1 and RHP-v1.0-adapted.

BrowserPilot RCC-N basis:

```text
Human README -> AI quick README -> RCC Nexus README -> route map -> Echo Location -> validation
```

BrowserPilot RHP basis:

```text
repository origin -> active session -> deviation check -> rehydration -> validation -> durable change
```

## I - Invariants

- Preserve local-first defaults.
- Preserve user authority over capture, reporting, and risky actions.
- Preserve AGNT/Hermes adapter boundaries.
- Preserve Edge and Chrome parity unless declared.
- Preserve non-claim locks.
- Navigation is not validation.
- Context is not correctness.

## E - Examples

Validation examples:

```powershell
npm run validate:rcc
```

## RCC Nexus Echo Location

Sphere Position:

- Shell: middle
- Meridian(s): agent, browser-control, documentation, safety
- Sector: rcc
- Version / TTL: BrowserPilot-RCC-N-v0.1 / 180 days
- Last Verified: 2026-07-02

Local Role:

- RCC root shell for BrowserPilot route map and navigation.

Inbound Hooks:

- `README.md`
- `README_90_SECONDS.md`

Outbound Hooks:

- `rcc/nexus/route_map.json`
- `docs/rcc-nexus.md`
- `docs/rehydration-protocol.md`
- `docs/failure-modes.md`

Evidence Surface:

- `reports/rcc_nexus/`

Validation Surface:

```powershell
npm run validate:rcc
```

Claim Boundary:

- This folder improves implementation, evidence, documentation, or navigation only within its declared scope.
- It does not prove code correctness, patch safety, security, production readiness, AGI, autonomous authority, threat accuracy, or extension runtime behavior.

Non-Claim Locks:

- navigation_is_not_validation
- documentation_is_not_correctness
- route_map_is_not_runtime_proof
- context_reconstruction_is_not_correctness_proof
- threat_signal_is_not_malware_proof
- ip_indicator_is_not_attacker_identity
- validation_remains_required

Agent Route:

- Read root README, `README_90_SECONDS.md`, docs index, route map, then this README before editing.

Update Obligation:

- Update this README and RCC/Nexus records if folder purpose, hooks, evidence surfaces, validation commands, or claim boundaries change.
