# Folder Purpose

## S - Specification

Vendored AGNT plugin support surface for BrowserPilot policy evaluation.

## H - Hooks

Inbound hooks:

- `README.md`
- `docs/symtorch.md`
- `docs/EDGE_COPILOT.md`

Outbound hooks:

- `agnt-plugins/symtorch-toolkit`
- AGNT plugin install path in the user's AGNT repository

## A - Artifacts

Evidence / output surfaces:

- `npm run smoke:edgecopilot`
- AGNT plugin reload output

## T - Theory / Basis

BrowserPilot policy basis:

```text
AGNT_EXEC -> BrowserPilot risk score -> SymTorch policy bundle -> allow/block -> audited action
```

## I - Invariants

- SymTorch remains a separate upstream concept; BrowserPilot vendors only the AGNT toolkit integration and policy bundle surface.
- Edge Copilot mode fails closed when the SymTorch tool is unavailable.
- Policy evaluation is a guardrail, not proof of safety.

## E - Examples

Validation examples:

```powershell
npm run smoke:edgecopilot
```

## RCC Nexus Echo Location

Sphere Position:

- Shell: middle
- Meridian(s): policy, agent, safety
- Sector: plugins
- Version / TTL: BrowserPilot-RCC-N-v0.2 / 180 days
- Last Verified: 2026-07-02

Local Role:

- Provides the vendored AGNT plugin bridge used by Edge Copilot mode.

Evidence Surface:

- smoke-test output
- AGNT plugin list after reload

Validation Surface:

```powershell
npm run smoke:edgecopilot
```

Claim Boundary:

- This folder does not prove command safety, AGNT correctness, SymTorch correctness, or browser runtime behavior.

Non-Claim Locks:

- policy_is_not_safety_proof
- validation_remains_required
- documentation_is_not_correctness
