# Folder Purpose

## S - Specification

Documentation shell for BrowserPilot architecture, install flow, command protocol, safety model, adapters, RCC Nexus, rehydration, and failure modes.

## H - Hooks

Inbound hooks:

- `README.md`
- `README_90_SECONDS.md`
- `rcc/nexus/route_map.json`

Outbound hooks:

- `docs/install.md`
- `docs/ARCHITECTURE.md`
- `docs/security-model.md`
- `docs/rcc-nexus.md`
- `docs/rehydration-protocol.md`
- `docs/failure-modes.md`

## A - Artifacts

Evidence / output surfaces:

- docs index
- screenshots in `docs/images`
- validation output from `npm run validate:rcc`

## T - Theory / Basis

Documentation basis:

```text
operator need -> docs route -> safety boundary -> validation command -> evidence surface
```

RCC-N basis:

```text
Human README -> RCC Nexus README -> AI Agent README -> route map -> Echo Location -> validation
```

## I - Invariants

- Preserve human-readable install and safety docs.
- Preserve evidence-bound language for threat and IP findings.
- Do not treat documentation as correctness.
- Do not let docs claim a runtime feature that code no longer exposes.
- Keep README visuals tied to real BrowserPilot surfaces.

## E - Examples

Read this file before editing documentation.

Validation examples:

```powershell
npm run validate:rcc
```

## RCC Nexus Echo Location

Sphere Position:

- Shell: outer
- Meridian(s): documentation, safety, agent
- Sector: docs
- Version / TTL: BrowserPilot-RCC-N-v0.2 / 180 days
- Last Verified: 2026-07-02

Local Role:

- Documentation shell for BrowserPilot architecture, protocols, safety boundaries, and navigation.

Evidence Surface:

- `docs/images/`
- `reports/rcc_nexus/`

Validation Surface:

```powershell
npm run validate:rcc
```

Claim Boundary:

- This mini README improves local navigation and documentation orientation. It does not prove code correctness, patch safety, extension runtime behavior, security, production readiness, threat accuracy, or IP attribution.

Non-Claim Locks:

- documentation_is_not_correctness
- navigation_is_not_validation
- route_map_is_not_runtime_proof
- threat_signal_is_not_malware_proof
- ip_indicator_is_not_attacker_identity
- validation_remains_required

## Local Documentation Index

- `install.md` - install + run
- `ARCHITECTURE.md` - how the pieces connect
- `agnt-bridge.md` - AGNT endpoints + agent creation
- `command-protocol.md` - `AGNT_EXEC` contract
- `security-model.md` - boundaries + hardening
- `symtorch.md` - SymTorch integration details
- `EDGE_COPILOT.md` - policy-gated execution mode
- `rcc-nexus.md` - BrowserPilot repository route map and non-claim locks
- `rehydration-protocol.md` - resume protocol before durable edits, packaging, or push claims
- `failure-modes.md` - runtime, directory, docs, and safety drift risks
