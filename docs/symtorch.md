# SymTorch Integration 🧠🛡️

BrowserPilot is designed to fit the **SymTorch direction already present in AGNT**: policy‑gated, explicit actions with explainable traces.

## What this repo includes

### 1) Vendored AGNT plugin: `symtorch-toolkit`

BrowserPilot vendors the AGNT-side SymTorch tools here:

```text
agnt-plugins/symtorch-toolkit/
```

Tools:

- `symtorch-rule-evaluate`
- `symtorch-policy-bundle-evaluate`

This plugin loads SymTorch runtime from a local SymTorch checkout (by default:
`C:\\Users\\jacks\\OneDrive\\Desktop\\SymTorch`).

### 2) Policy bundles

Default BrowserPilot policy bundles live here:

```text
symtorch/policies/
```

The default one used by **Edge Copilot mode** is:

- `symtorch/policies/browserpilot-default.policy.json`

## What “integrated” means

BrowserPilot does **not** embed SymTorch itself into the extension.

Instead:

- BrowserPilot provides the **actuator**:

```text
AGNT_EXEC command -> live browser tab -> observable result
```

- SymTorch (via AGNT plugin) provides the **evaluator**:

```text
intent/facts + policy bundle -> allow/block + trace snapshot
```

## Edge Copilot mode

See: `docs/EDGE_COPILOT.md`.

In this mode, BrowserPilot evaluates every command via:

```text
POST /api/tools/symtorch-policy-bundle-evaluate/execute
```

If the tool is missing, BrowserPilot **blocks** (fail‑closed) so policy can’t be bypassed silently.


## Admission note

BrowserPilot defaults to `runAdmission: false` when calling `symtorch-policy-bundle-evaluate` so local installs work without signing secrets. Enable admission only when you have SymTorch signature secrets configured.
