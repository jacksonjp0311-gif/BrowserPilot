# BrowserPilot 🧭

**Copilot is not enough for a browser. You have to let agents in — *but* keep the execution path inspectable.**

BrowserPilot is a **local-first browser-agent bridge** for **AGNT**:

- A side panel in **Edge** and **Chrome**
- Captures **bounded page context** (URL, title, selection, capped text)
- Chats with your AGNT agent (**`Edge Tab Operator`**)
- Executes explicit, auditable tab commands via a single protocol line:

```text
AGNT_EXEC: [{"kind":"navigate","url":"https://example.com"},{"kind":"click","css":"button#login"}]
```

## ✨ New: Edge Copilot (AGNT + SymTorch) 🛡️🧠

BrowserPilot now supports a **3‑state control mode**:

1) **Control: OFF** — chat only, no tab actions
2) **Jarvis: ON** — executes `AGNT_EXEC` commands
3) **Edge Copilot: ON** — executes `AGNT_EXEC` **only after SymTorch policy evaluation**

That means:

> **Agent proposes commands → SymTorch evaluates risk → BrowserPilot executes (or blocks) → traceable result**

The repo includes:

- ✅ **SymTorch AGNT plugin** (vendored): `agnt-plugins/symtorch-toolkit/`
- ✅ **Default policy bundle**: `symtorch/policies/browserpilot-default.policy.json`

> Option (1) implemented: BrowserPilot vendors the **AGNT SymTorch toolkit plugin + policy bundles**. SymTorch itself remains a separate repo (recommended).

---

## Quickstart ⚡

### 0) Requirements

- Edge or Chrome
- A running **AGNT** instance (default: `http://localhost:3333`)
- An AGNT bearer token

### 1) Start AGNT

```powershell
npm start
```

### 2) Install the SymTorch toolkit into AGNT (for Edge Copilot)

BrowserPilot vendors the plugin here:

```text
agnt-plugins/symtorch-toolkit/
```

Install it into your AGNT instance by copying it into:

```text
<agnt-evo>\backend\plugins\dev\symtorch-toolkit
```

…then reload plugins in AGNT.

> If the SymTorch toolkit is not installed in AGNT, **Edge Copilot mode will block** (fail-closed) so policy can’t be bypassed silently.

### 3) Load the extension (Edge)

1. Open `edge://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select:

```text
apps\edge-extension
```

### 4) Load the extension (Chrome)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select:

```text
apps\chrome-extension
```

### 5) Configure BrowserPilot (token + operator)

1. In **AGNT**, open your web UI (e.g. `http://localhost:3333/chat`).
2. Open DevTools Console and run:

```js
localStorage.getItem("token")
```

3. Copy the token.
4. Open the extension’s **Options** page:
   - Edge: `edge://extensions` → **BrowserPilot for Edge** → **Details** → **Extension options**
   - Chrome: `chrome://extensions` → **BrowserPilot for Chrome** → **Details** → **Extension options**
5. Set:
   - **AGNT Base URL** (usually `http://localhost:3333`)
   - **AGNT token** (paste)
6. Click **Test connection** → **Save**.

On first run, BrowserPilot automatically creates/selects the AGNT agent named **`Edge Tab Operator`** (the operator).

---

## Repo layout 🗺️

```text
browser-pilot/
  apps/
    edge-extension/            MV3 Edge side panel adapter
    chrome-extension/          MV3 Chrome side panel adapter
  extension/                   Legacy adapter kept for backwards compatibility

  agnt-plugins/
    symtorch-toolkit/          Vendored AGNT plugin: symtorch-rule-evaluate + symtorch-policy-bundle-evaluate

  symtorch/
    policies/                  Versioned policy bundles (symtorch.policyBundle.v1)

  docs/                        Protocol + architecture + security
  scripts/                     packaging + validation + icon gen
  dist/                        prebuilt zip artifacts
```

---

## Architecture (one-glance) 🔭

```text
┌───────────────────────────┐
│  You (Edge/Chrome tab)     │
└─────────────┬─────────────┘
              │ (bounded context)
              ▼
┌───────────────────────────┐
│ BrowserPilot Side Panel    │
│  - chat + mode toggle      │
│  - parses AGNT_EXEC JSON   │
└─────────────┬─────────────┘
              │ POST /api/agents/:id/chat
              ▼
┌───────────────────────────┐
│ AGNT Agent: Edge Tab Op    │
└─────────────┬─────────────┘
              │ emits AGNT_EXEC
              ▼
┌───────────────────────────┐
│ (Edge Copilot ON)          │
│ SymTorch policy evaluation │
│ via AGNT tool endpoint     │
└─────────────┬─────────────┘
              │ allow / block
              ▼
┌───────────────────────────┐
│ Extension executes command │
│  - background.js           │
│  - contentScript.js        │
└───────────────────────────┘
```

---

## Packaging 📦

```powershell
npm run validate
npm run icons:gen
npm run package:all
# or individually:
# npm run package:edge
# npm run package:chrome
# npm run package:legacy
```

Outputs:

```text
dist\browser-pilot-edge-extension.zip
dist\browser-pilot-chrome-extension.zip
```

---

## Notes on safety 🔒

BrowserPilot is powerful:

- It has broad host permissions so it can operate on arbitrary user-selected pages.
- The control path is **explicit** (`AGNT_EXEC`) and bounded by implemented commands.
- **Edge Copilot** adds an additional guardrail: **policy evaluation**.

See: `docs/security-model.md`.

---

## Roadmap 🌌

- Confirm/Authorize flows for medium-risk actions
- Token broker (replace long-lived pasted tokens)
- Better trace export → `symtorch.decisionTraceSnapshot.v1` log + AGNT execution linking
- DOM stability helpers (site layout changes)

---

If you want, I can also:
- add a visual execution timeline panel,
- add policy bundle switching,
- or ship a “safe-by-default distribution mode” (no broad host perms until enabled).
