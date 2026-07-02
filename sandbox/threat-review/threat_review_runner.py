#!/usr/bin/env python3
"""BrowserPilot Threat Review Runner.

Static analysis only. This runner must not fetch URLs, execute page JavaScript,
scan hosts, or touch files outside its ephemeral run directory.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_request(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if data.get("schemaVersion") != "browserpilot.threatReviewRequest.v1":
        raise ValueError("invalid schemaVersion")
    if data.get("humanApproved") is not True:
        raise ValueError("humanApproved must be true")
    options = data.get("options") or {}
    if options.get("allowNetwork") is True:
        raise ValueError("network is disabled by default")
    report = data.get("report") or {}
    if report.get("privacy", {}).get("apiReviewRequiresHumanApproval") is not True:
        raise ValueError("report must require human approval")
    return data


def classify(report: dict) -> dict:
    findings = report.get("findings") or []
    counts = report.get("counts") or {}
    ips = report.get("ipIndicators") or []
    cats = {str(f.get("category", "")) for f in findings}
    hidden = [f for f in findings if f.get("category") == "hidden_prompt"]
    overlay = [f for f in findings if f.get("category") == "overlay"]
    credentials = [f for f in findings if f.get("category") == "credential_form"]
    link_mismatch = [f for f in findings if f.get("category") == "link_mismatch"]
    iframe = [f for f in findings if f.get("category") == "iframe"]
    handlers = [f for f in findings if f.get("category") == "inline_handler"]

    verdict = "benign"
    confidence = 0.25
    summary = "No medium/high correlated threat pattern found in the redacted report."
    if hidden and credentials:
      verdict, confidence, summary = "likely_threat", 0.86, "Hidden agent-facing instruction text appears with credential/payment form risk."
    elif overlay:
      verdict, confidence, summary = "likely_threat", 0.82, "Transparent or near-transparent interactive overlay may misdirect user or agent actions."
    elif hidden:
      verdict, confidence, summary = "suspicious", 0.74, "Hidden prompt-like content may attempt browser-agent prompt injection."
    elif link_mismatch and (credentials or any("credential" in str(f.get("reason", "")).lower() for f in findings)):
      verdict, confidence, summary = "suspicious", 0.72, "Link mismatch appears near credential/payment language."
    elif iframe and credentials:
      verdict, confidence, summary = "suspicious", 0.68, "Third-party or hidden iframe appears near credential/payment context."
    elif handlers:
      verdict, confidence, summary = "suspicious", 0.45, "Inline keyboard/clipboard/event handlers require caution but are not conclusive alone."
    elif counts.get("findings", 0):
      verdict, confidence, summary = "inconclusive", 0.38, "Signals exist but are not conclusive in the redacted report."

    threat_types = []
    mapping = {
        "hidden_prompt": "hidden_prompt_injection",
        "overlay": "transparent_overlay",
        "link_mismatch": "link_mismatch",
        "credential_form": "credential_risk",
        "iframe": "suspicious_iframe",
        "inline_handler": "event_interception",
    }
    for cat, name in mapping.items():
        if cat in cats:
            threat_types.append(name)
    if ips:
        threat_types.append("network_ioc_indicator")

    policy_action = "continue"
    if verdict == "likely_threat":
        policy_action = "threat_lock"
    elif verdict == "suspicious":
        policy_action = "require_confirmation"
    elif verdict == "inconclusive":
        policy_action = "warn"

    return {
        "verdict": verdict,
        "confidence": confidence,
        "threatTypes": threat_types,
        "summary": summary,
        "policyAction": policy_action,
    }


def build_result(request: dict, run_id: str) -> dict:
    report = request["report"]
    cls = classify(report)
    return {
        "schemaVersion": "browserpilot.threatReviewResult.v1",
        "runId": run_id,
        "reviewedAt": iso_now(),
        "isolation": {
            "mode": "venv_fallback",
            "network": "disabled",
            "executedUntrustedCode": False,
            "fetchedExternalUrls": False,
            "isolationLevel": "venv_fallback_not_security_boundary",
        },
        "classification": {
            "verdict": cls["verdict"],
            "confidence": cls["confidence"],
            "threatTypes": cls["threatTypes"],
            "summary": cls["summary"],
        },
        "mechanism": {
            "whatItIs": "Static review of redacted BrowserPilot DOM threat signals.",
            "howItCouldAffectAgent": "Hidden instructions, overlays, and mismatched links can influence browser-agent perception or actions.",
            "howItCouldAffectHuman": "The same signals can misdirect clicks, credential entry, or trust decisions.",
            "whyItMayBeBenign": "Some overlays, iframes, handlers, and IPs are normal web infrastructure.",
            "evidenceLimits": report.get("limitations", []),
        },
        "recommendedPolicy": {
            "action": cls["policyAction"],
            "blockedCommands": ["click", "type", "navigate", "openTab", "attachImage", "xComposeType"] if cls["policyAction"] == "threat_lock" else [],
            "allowedCommands": ["wait", "screenshot", "domAudit", "threatScan", "contextRadar", "cyberSnapshot", "extractIp", "exportReport"],
            "userMessage": cls["summary"],
        },
        "networkIndicators": {
            "ips": report.get("ipIndicators", []),
            "domains": [],
            "urls": [],
            "confidence": "extracted_from_report",
        },
        "ruleCandidates": [
            {
                "name": f"Review {name}",
                "category": name,
                "confidence": cls["confidence"],
                "triggerSummary": cls["summary"],
                "proposedAction": cls["policyAction"],
                "requiresHumanApproval": True,
            }
            for name in cls["threatTypes"]
        ],
        "report": {"redacted": True, "rawEvidenceRetained": False},
        "wipe": {
            "attempted": True,
            "deleted": False,
            "remainingFiles": None,
            "completedAt": None,
            "note": "Ephemeral deletion verified by directory absence check; not forensic secure erase.",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_json", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    request = load_request(args.input_json)
    run_id = f"thr-review-{int(time.time())}"
    run_dir = Path(tempfile.gettempdir()) / "BrowserPilotThreatReview" / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    try:
        bundle_path = run_dir / "approved_redacted_bundle.json"
        bundle_path.write_text(json.dumps(request, indent=2), encoding="utf-8")
        result = build_result(request, run_id)
        final_path = args.output or (args.input_json.parent / f"{run_id}.result.json")
        final_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    finally:
        shutil.rmtree(run_dir, ignore_errors=True)

    deleted = not run_dir.exists()
    result["wipe"]["deleted"] = deleted
    result["wipe"]["remainingFiles"] = 0 if deleted else sum(1 for _ in run_dir.rglob("*"))
    result["wipe"]["completedAt"] = iso_now()
    final_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return 0 if deleted else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"BrowserPilot threat review failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
