# BrowserPilot Codex Learning

BrowserPilot is the safety membrane between agents and the web.

Core thesis:

```text
Agents can enter the browser safely only when perception, consent, action, and evidence are separated by design.
```

## Breakthrough

BrowserPilot prevents contaminated perception from becoming unauthorized browser action.

Incorrect chain:

```text
Sense -> act
```

Correct chain:

```text
Sense -> interpret -> confirm -> allow/block -> record -> learn carefully
```

## Non-Negotiable Invariants

1. Local-first scan before escalation.
2. Page HUD warns; side panel consents.
3. High-risk acknowledge does not unlock action.
4. IPs are indicators, not attribution.
5. Sandbox review is human-approved, static, and wiped.
6. Rule candidates do not install themselves.
7. Threat memory must be balanced by tolerance memory.
8. Untrusted context must never directly cause privileged action.
9. Every significant decision must be logged.
10. No validation, no completion claim.

## Product Category

BrowserPilot should be understood as:

```text
Agentic Browser Safety Layer
Agentic Perception Firewall
Human-Governed Browser-Agent Membrane
Governed sensory bridge for agents entering the web
```

## Trust Boundary

```text
Page HUD = warning surface
Side panel = consent authority
```

High-risk decisions requested from page context must be confirmed in the side panel.

## Threat Lock

Threat Lock is the inhibitory circuit. It blocks risky movement until review, consent, and policy allow action.

Block risky actions when:

```text
threatLockActive is true
threatScan.risk.level is high
threatScan.recommendedAction is threat_lock
lifecycle indicates locked/high/likely threat
sandbox verdict is likely_threat
```

## Threat Model

Threat is not a thing; threat is a transition risk.

```text
Threat = suspicious signal + possible action path + insufficient consent
```

The scanner should not panic on volume alone. It should reason about what a signal can cause.

## IP / IOC Boundary

Never say "attacker IP."

Use:

```text
extractedIps = parsed from text/snapshot/report
observedIps = browser request metadata in future Network IOC mode
resolvedIps = explicit DNS enrichment in future approved mode
```

Default remains extracted-only, no network lookup, no scan, no ping, no DNS, no report, no attribution.

## Next Build Priority

v0.4.0 closes the real sandbox loop:

```text
Threat Scan
-> Red HUD
-> trusted side-panel confirmation
-> sandbox runner invocation
-> structured verdict
-> wipe certificate
-> Threat Lock update
-> rule candidates
-> ledger event
-> validation passes
```

After v0.4.0:

1. First-class confirmation cards.
2. Background-level Threat Lock enforcement.
3. AGNT_EXEC command schema validation.
4. Evidence and decision ledger.
5. Rule candidate display without auto-install.
6. Behavioral QA runner.
7. Network IOC Observer.
8. Immune Memory Rulebook.
9. DOM/Visual mismatch engine.
10. Tool supply-chain scanner.
11. Store-safe/lab build split.
12. Token broker.

