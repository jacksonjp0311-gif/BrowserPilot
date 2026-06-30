# Contributing 🤝

## Philosophy

BrowserPilot is intentionally:

- **Local-first**
- **Explicit** (auditable `AGNT_EXEC` command surface)
- **Policy-ready** (Edge Copilot / SymTorch gating)

If a contribution makes behavior more opaque, it probably doesn’t belong.

## Dev quickstart

```powershell
npm run validate
npm run icons:gen
npm run package:all
```

## Guidelines

- Keep command surface small. Prefer adding *composable primitives*.
- Never add “hidden actions” that don’t appear in `AGNT_EXEC`.
- When adding a new command kind:
  - update `docs/command-protocol.md`
  - implement it in `background.js` or `contentScript.js`
  - add a risk heuristic in `background.js` for Edge Copilot

## Style

- Small functions.
- Strong defaults.
- Fail closed when policy is enabled.
