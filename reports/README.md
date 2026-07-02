# Folder Purpose

## S - Specification

Local report and evidence-output surface for BrowserPilot RCC and optional review packages.

## H - Hooks

Inbound hooks:

- `README.md`
- `docs/rcc-nexus.md`
- `docs/rehydration-protocol.md`

Outbound hooks:

- `reports/rcc_nexus`

## A - Artifacts

Evidence / output surfaces:

- RCC Nexus validation notes
- optional local authority report package summaries

## T - Theory / Basis

Evidence basis:

```text
validated action -> local evidence -> bounded report -> human export decision
```

## I - Invariants

- Reports are local/export surfaces unless the human submits them.
- Do not auto-submit reports.
- Do not dox, retaliate, scan, or attribute IP ownership as attacker identity.

## E - Examples

Validation examples:

```powershell
npm run validate:rcc
```

## RCC Nexus Echo Location

Sphere Position:

- Shell: outer
- Meridian(s): evidence, safety, documentation
- Sector: reports
- Version / TTL: BrowserPilot-RCC-N-v0.2 / 180 days
- Last Verified: 2026-07-02

Local Role:

- Stores local evidence and RCC report placeholders.

Evidence Surface:

- `reports/rcc_nexus/`

Validation Surface:

```powershell
npm run validate:rcc
```

Claim Boundary:

- This folder does not prove correctness, threat attribution, report acceptance, or security impact.

Non-Claim Locks:

- report_is_not_attribution
- evidence_is_not_proof_without_validation
- human_authority_remains_required
