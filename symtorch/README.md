# Folder Purpose

## S - Specification

Versioned local policy-bundle surface used by BrowserPilot Edge Copilot mode.

## H - Hooks

Inbound hooks:

- `README.md`
- `docs/symtorch.md`
- `docs/EDGE_COPILOT.md`

Outbound hooks:

- `symtorch/policies`
- browser extension background policy evaluation

## A - Artifacts

Evidence / output surfaces:

- policy bundle JSON files
- Edge Copilot smoke-test output

## T - Theory / Basis

Policy basis:

```text
command proposal -> risk context -> policy bundle -> allow/block decision
```

## I - Invariants

- Keep policy bundles versioned.
- Policy decisions are guardrails, not proof of safety.
- Fail closed when policy tooling is unavailable in Edge Copilot mode.

## E - Examples

Validation examples:

```powershell
npm run smoke:edgecopilot
npm run validate
```

## RCC Nexus Echo Location

Sphere Position:

- Shell: middle
- Meridian(s): policy, safety
- Sector: symtorch
- Version / TTL: BrowserPilot-RCC-N-v0.2 / 180 days
- Last Verified: 2026-07-02

Local Role:

- Stores BrowserPilot policy bundles used by the SymTorch integration.

Evidence Surface:

- policy bundle files
- smoke-test output

Validation Surface:

```powershell
npm run smoke:edgecopilot
```

Claim Boundary:

- This folder does not prove safety, correctness, security, or policy completeness.

Non-Claim Locks:

- policy_is_not_safety_proof
- validation_remains_required
- route_map_is_not_runtime_proof
