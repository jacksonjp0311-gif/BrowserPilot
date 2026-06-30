# BrowserPilot for Chrome

This is a Manifest V3 Edge extension that gives you a **side panel agent chat** on every page.

BrowserPilot keeps the AGNT bridge from the Edge Tab Operator prototype. It connects to your local AGNT server, creates or selects the `Edge Tab Operator` agent, and executes `AGNT_EXEC` browser commands in the current tab.

## Features

- Floating **AGNT** button injected into all pages
- Opens a **Side Panel** chat UI
- Captures page URL/title and current text selection
- Talks to your local AGNT server (`http://localhost:3333` by default)

## Setup (Chrome)

1. Open: `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder:

`C:\\Users\\jacks\\OneDrive\\Desktop\\agnt-evo\\browser-agents-edge-extension`

For the standalone BrowserPilot repo, select:

`C:\\Users\\jacks\\OneDrive\\Desktop\\browser-pilot\\apps\\chrome-extension`

5. Open the extension **Options** page and set:
   - AGNT Base URL
   - AGNT token (from AGNT web app: `localStorage.getItem('token')`)

## Notes

- This first version uses a long-lived token pasted into Options. If you want, we can evolve it to a safer short-lived token broker flow.
- Next upgrade: bind execution to the originating tab id so commands cannot drift to a newly focused tab.
