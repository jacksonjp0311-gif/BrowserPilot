# Folder Purpose

## S - Specification

Human-approved threat-review sandbox and static review runner surface.

## H - Hooks

Inbound hooks:

- `README.md`
- `docs/security-model.md`
- `docs/failure-modes.md`

Outbound hooks:

- `sandbox/threat-review`
- optional local review reports

## A - Artifacts

Evidence / output surfaces:

- static review output
- wipe certificate text
- locally exported authority report packages

## T - Theory / Basis

Threat review basis:

```text
human approval -> redacted prompt -> static review -> local report -> wipe certificate
```

Runtime helper path:

```text
trusted side-panel confirmation -> local helper -> threat_review_runner.py -> structured result -> Threat Lock update -> ledger event
```

## I - Invariants

- No suspicious URL fetching by default.
- No page JavaScript execution.
- No auto-send to AGNT.
- Local helper binds to localhost only.
- Python VENV is not a security boundary.
- Static review is advisory, not malware proof.

## E - Examples

Validation examples:

```powershell
npm run sandbox:helper
python sandbox/threat-review/threat_review_runner.py .\approved-threat-review-request.json
```

## RCC Nexus Echo Location

Sphere Position:

- Shell: outer
- Meridian(s): safety, evidence, human-approval
- Sector: sandbox
- Version / TTL: BrowserPilot-RCC-N-v0.2 / 180 days
- Last Verified: 2026-07-02

Local Role:

- Holds local human-approved threat-review tooling.

Evidence Surface:

- local sandbox output
- authority report package artifacts when generated

Validation Surface:

```powershell
npm run sandbox:helper
python sandbox/threat-review/threat_review_runner.py .\approved-threat-review-request.json
```

Claim Boundary:

- This folder does not prove malware, security, attribution, forensic erasure, or production isolation.

Non-Claim Locks:

- static_review_is_not_malware_proof
- wipe_certificate_is_not_forensic_erasure
- ip_indicator_is_not_attacker_identity
- validation_remains_required
