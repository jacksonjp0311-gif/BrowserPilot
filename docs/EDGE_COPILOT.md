# Edge Copilot (AGNT + SymTorch) 🛡️🧠

Edge Copilot is BrowserPilot’s **policy‑gated execution mode**.

When enabled:

1. The AGNT agent emits explicit `AGNT_EXEC:` JSON.
2. BrowserPilot computes a small **facts payload** (including a risk score).
3. BrowserPilot calls AGNT’s tool endpoint:

```text
POST /api/tools/symtorch-policy-bundle-evaluate/execute
```

Request body shape (per AGNT ToolsRoutes):

```json
{ "args": { "policyBundleJson": "{...}", "factsJson": "{...}" } }
```

4. If SymTorch returns `allow(X)` → BrowserPilot executes the command.
5. If SymTorch returns `block(X)` → BrowserPilot blocks and reports why.

## Local default: runAdmission=false

SymTorch policy admission can fail in local/dev environments if no signing secrets are configured.
BrowserPilot therefore calls the tool with:

- `runAdmission: false` (local default)

If you want strict admission in production, configure SymTorch admission secrets and set `runAdmission: true`.

## Default policy

The repo ships a minimal default bundle:

- `symtorch/policies/browserpilot-default.policy.json`

Rules:

```prolog
block(X) :- high_risk(X).
allow(X) :- not high_risk(X).
```

Predicate:

- `high_risk(X)` uses a threshold predicate on `facts.risk` with cutoff `0.7`.

## How BrowserPilot decides risk

Risk is intentionally simple (transparent + easy to tune). See:

- `apps/*-extension/background.js` → `commandRiskScore()`

Examples:

- `navigate` → low/medium
- `click`, `type` → medium
- `attachImage`, `closeTab`, `xCompose*` → high

## Important: fail-closed behavior

If the SymTorch tool is not present in AGNT, **Edge Copilot mode blocks execution**. This avoids a silent downgrade to “policyless execution”.

To enable the mode, install the plugin:

- `agnt-plugins/symtorch-toolkit/` → into your AGNT plugins directory → reload.
