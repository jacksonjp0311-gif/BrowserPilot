# Install BrowserPilot ⚡

## Requirements

- Microsoft Edge or Google Chrome
- A running AGNT instance
- An AGNT auth token

Optional (for **Edge Copilot** mode):

- SymTorch checkout built locally (packages/*/dist)
- SymTorch toolkit plugin installed into AGNT

## Start AGNT

In the AGNT repo:

```powershell
npm start
```

Default backend:

```text
http://localhost:3333
```

## (Optional) Enable Edge Copilot (AGNT + SymTorch)

1) Copy the vendored plugin into your AGNT plugins directory:

```text
browser-pilot\agnt-plugins\symtorch-toolkit
→
<agnt-evo>\backend\plugins\dev\symtorch-toolkit
```

2) Reload plugins in AGNT.

3) In BrowserPilot, toggle control mode to **Edge Copilot: ON**.

> Edge Copilot is fail‑closed: if SymTorch tools are missing in AGNT, it blocks execution.

## Load the Edge extension

1. Open Edge.
2. Go to `edge://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select:

```text
browser-pilot\apps\edge-extension
```

## Load the Chrome extension

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select:

```text
browser-pilot\apps\chrome-extension
```

## Configure AGNT

1. Open the BrowserPilot extension Options page.
2. Set **AGNT Base URL** to your AGNT instance.
3. Paste an AGNT bearer token.

Get the token from AGNT in DevTools:

```js
localStorage.getItem("token")
```

4. Click **Test connection**.
5. Click **Save**.

## Use it

1. Open any webpage.
2. Click the floating **AGNT** button.
3. The BrowserPilot side panel opens and captures page context.
4. Ask the `Edge Tab Operator` agent what you want done.
5. Toggle:
   - **Control: OFF** (chat only)
   - **Jarvis: ON** (executes `AGNT_EXEC`)
   - **Edge Copilot: ON** (executes only if SymTorch allows)

## Package for another user

From this repo:

```powershell
npm run package:all
```

Artifacts:

```text
dist\browser-pilot-edge-extension.zip
dist\browser-pilot-chrome-extension.zip
```


---

## Distribution confidence ✅

If you’re handing this to another AGNT user, have them run:

```powershell
npm run validate
npm run smoke:edgecopilot
npm run package:all
```

If the smoke test fails, the most common causes are:

- AGNT not restarted after installing the SymTorch toolkit
- incorrect token pasted into extension Options
