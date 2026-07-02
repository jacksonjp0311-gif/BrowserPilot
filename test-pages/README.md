# Folder Purpose

## S - Specification

Local manual QA pages for BrowserPilot visible-page features.

## H - Hooks

Inbound hooks:

- `README.md`
- `docs/failure-modes.md`

Outbound hooks:

- `test-pages/context-radar-qa.html`

## A - Artifacts

Evidence / output surfaces:

- manual QA observations
- screenshots when captured by the operator

## T - Theory / Basis

QA basis:

```text
known local page -> extension reload -> user-triggered feature -> observed result
```

## I - Invariants

- Test pages are local QA helpers, not automated proof.
- Manual screenshots are evidence, not exhaustive validation.
- Keep test pages safe and static.

## E - Examples

Validation examples:

```text
Open test-pages/context-radar-qa.html in Edge or Chrome, reload the extension, and run Context Radar.
```

## RCC Nexus Echo Location

Sphere Position:

- Shell: outer
- Meridian(s): qa, browser-control
- Sector: test-pages
- Version / TTL: BrowserPilot-RCC-N-v0.2 / 180 days
- Last Verified: 2026-07-02

Local Role:

- Holds local manual QA surfaces for BrowserPilot browser features.

Evidence Surface:

- operator observations
- optional screenshots

Validation Surface:

- manual browser QA

Claim Boundary:

- This folder does not prove cross-site behavior, browser compatibility, security, or production readiness.

Non-Claim Locks:

- manual_qa_is_not_exhaustive_validation
- screenshot_is_not_runtime_proof
- validation_remains_required
