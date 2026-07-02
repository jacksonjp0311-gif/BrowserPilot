# RCC Nexus for BrowserPilot

RCC Nexus is the repository navigation layer for BrowserPilot. It does not replace tests, extension reloads, manual QA, or package validation. It gives humans and agents a shared route map so work can resume without guessing which surface owns which responsibility.

## Public Core

RCC tells the agent what the repository means.
RCC Nexus tells the agent where it is.
Validation tells the agent whether reality agreed.

BrowserPilot adopts a lightweight RCC-N profile:

- Profile: Lite / Standard hybrid
- Scope: repository navigation, docs orientation, safety boundaries, feature ownership
- Validation: `npm run validate` and `npm run validate:rcc`
- Non-claim lock: navigation is not validation

## README Surfaces

### Human README

The root `README.md` is the primary human surface. It explains what BrowserPilot is, how to install it, how the side panel works, and where Threat Scan, Cyber Snapshot, Context Radar, Extract IP Address, AGNT, Hermes, and SymTorch fit.

### AI Agent README

`README_90_SECONDS.md` is the quick rehydration surface for agents and returning maintainers. It lists the read order, validation commands, and durable-change boundary.

### RCC Nexus README

`rcc/README.md`, `rcc/nexus/README.md`, and `rcc/nexus/route_map.json` define the repository map, inbound hooks, outbound hooks, evidence surfaces, and claim boundaries.

### Rehydration README

`docs/rehydration-protocol.md` defines the resume protocol for stale sessions, cross-repo syncs, release promotion, and agent-assisted edits.

## BrowserPilot Echo Location

Sphere Position:

- Shell: middle
- Meridians: browser-control, safety, documentation, packaging
- Sector: extension
- Version / TTL: BrowserPilot-RCC-N-v0.1 / 180 days
- Last Verified: 2026-07-02

Local Role:

- Route humans and agents across extension adapters, safety docs, packaging scripts, and evidence surfaces.

Inbound Hooks:

- `README.md`
- `README_90_SECONDS.md`
- `docs/README.md`
- `docs/security-model.md`
- `docs/rehydration-protocol.md`

Outbound Hooks:

- `apps/edge-extension`
- `apps/chrome-extension`
- `extension`
- `scripts`
- `sandbox/threat-review`
- `reports/rcc_nexus`

Evidence Surface:

- `reports/rcc_nexus/`
- `dist/`
- command output from `npm run validate`
- command output from `npm run validate:rcc`

Validation Surface:

```powershell
npm run validate
npm run validate:rcc
```

## Invariants

- Preserve user-triggered control for Threat Scan, Cyber Snapshot, Context Radar, Extract IP Address, and report generation.
- Preserve local-first defaults.
- Preserve AGNT/Hermes adapter boundaries.
- Preserve evidence-bound language for threat findings.
- Do not claim malware proof from local DOM signals.
- Do not claim IP attribution from extracted indicators.
- Do not claim documentation, route maps, or RCC adoption prove code correctness.
- Do not promote a change without validation.

## Non-Claim Locks

- navigation_is_not_validation
- documentation_is_not_correctness
- route_map_is_not_runtime_proof
- context_reconstruction_is_not_code_quality
- threat_signal_is_not_malware_proof
- ip_indicator_is_not_attacker_identity
- validation_remains_required
- human_authority_remains_required

## Done Criteria

A BrowserPilot RCC-N change is done only when:

- Root README links the affected surface.
- Mini README or route map updates match the changed ownership boundary.
- Failure modes are documented if the change touches browser control, safety, reporting, or agent execution.
- `npm run validate` passes.
- `npm run validate:rcc` passes.
