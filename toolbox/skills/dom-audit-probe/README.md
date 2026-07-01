# DOM Audit Probe

The DOM Audit Probe runs inside the user-approved active tab through BrowserPilot.

It collects:

- page URL, title, origin, timestamp
- browser runtime diagnostics such as language, timezone, screen size, hardware concurrency, and WebDriver flag
- canvas/WebGL diagnostic hashes and renderer metadata when exposed by the browser
- loaded font families visible through `document.fonts`
- challenge-surface indicators for Cloudflare and Turnstile
- sanitized resource URLs from `performance.getEntriesByType("resource")`

It does not:

- bypass or solve challenges
- extract `cf_clearance`, `__cfduid`, cookies, local/session storage, tokens, or authorization headers
- modify the page
- hide automation or spoof fingerprints

## Command

```json
{"kind":"domAudit","includeResources":true}
```

## Output

The command returns a JSON-safe audit report. Network/resource URLs are stripped to origin + pathname so query strings and tokens are not captured.
