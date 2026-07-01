# BrowserPilot 🧭

**Copilot is not enough for a browser. You have to let agents in — *but* keep the execution path inspectable.**

BrowserPilot is a **local-first browser-agent bridge** for **AGNT** and **Hermes Agent**:

- A side panel in **Edge** and **Chrome**
- Captures **bounded page context** (URL, title, selection, capped text)
- Chats with your AGNT agent (**`Edge Tab Operator`**) or Hermes through its API Server adapter
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

## New AGNT user checklist ✅ (distribution confidence)

Use this when someone installs BrowserPilot on a fresh machine.

1. **Run AGNT** (default: `http://localhost:3333`).
2. **Install SymTorch toolkit into AGNT** (Edge Copilot mode):

   Copy:

   ```text
   BrowserPilot/agnt-plugins/symtorch-toolkit
   →
   <agnt-evo>\backend\plugins\dev\symtorch-toolkit
   ```

   Then in AGNT:
   - restart AGNT, or
   - `POST /api/plugins/reload`

3. **Verify SymTorch tools are visible** (quick check):

   - Open AGNT → Workflows → tools list, or
   - run BrowserPilot smoke test: `npm run smoke:edgecopilot`

4. **Get token from AGNT UI**:

   In DevTools Console:

   ```js
   localStorage.getItem("token")
   ```

5. **Configure BrowserPilot Options**:
   - paste Base URL + token
   - click **Test connection** → **Save**

6. **Load the extension**:
   - Edge: `edge://extensions` → Load unpacked → `apps\edge-extension`
   - Chrome: `chrome://extensions` → Load unpacked → `apps\chrome-extension`

7. **Mint test**:
   - open any page → click floating **AGNT**
   - toggle **Edge Copilot: ON**
   - ask: “scroll down 600px” (should allow)
   - ask: “close this tab” (should block or require low-risk alternative)

---

## Quickstart ⚡

### 0) Requirements

- Edge or Chrome
- A running **AGNT** instance (default: `http://localhost:3333`)
- An AGNT bearer token

Optional:

- A running **Hermes Agent API Server** (default: `http://localhost:8642`)
- Hermes `API_SERVER_KEY`

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

### 6) Configure Hermes instead of AGNT

BrowserPilot can also use Hermes Agent directly:

1. Start Hermes with its API Server enabled.
2. Open BrowserPilot **Options**.
3. Set **Agent Backend** to **Hermes Agent**.
4. Set **Hermes API Server URL** to `http://localhost:8642`.
5. Paste the Hermes `API_SERVER_KEY`.
6. Click **Test connection** -> **Save**.

Hermes mode talks to `/v1/chat/completions` and uses `X-Hermes-Session-Key` so the BrowserPilot side-panel conversation stays in one Hermes session across restarts.

See [docs/hermes-adapter.md](docs/hermes-adapter.md).

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

Free Your Agents. Let them in The Web. 


### Troubleshooting

- **Edge Copilot blocks everything immediately**: ensure the SymTorch toolkit plugin is installed into AGNT and AGNT was restarted. Then run `npm run smoke:edgecopilot`.
- **SymTorch admission failed**: BrowserPilot defaults to `runAdmission: false` for local installs. Only enable admission when SymTorch secrets are configured.
