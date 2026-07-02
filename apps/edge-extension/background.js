// BrowserPilot background service worker (MV3)
// Silent AGNT integration + telemetry

import { BROWSER_PILOT_DEFAULT_POLICY_BUNDLE } from './policyBundles.js';

// --- Settings ---
async function getSettings() {
  const { agentBackend, agntBaseUrl, agntToken, hermesBaseUrl, hermesApiKey, selectedAgentId } = await chrome.storage.sync.get([
    'agentBackend',
    'agntBaseUrl',
    'agntToken',
    'hermesBaseUrl',
    'hermesApiKey',
    'selectedAgentId'
  ]);
  return {
    agentBackend: agentBackend || 'agnt',
    agntBaseUrl: agntBaseUrl || 'http://localhost:3333',
    agntToken: agntToken || '',
    hermesBaseUrl: hermesBaseUrl || 'http://localhost:8642',
    hermesApiKey: hermesApiKey || '',
    selectedAgentId: selectedAgentId || ''
  };
}

async function agntFetch(path, { method = 'GET', body } = {}) {
  const { agntBaseUrl, agntToken } = await getSettings();
  const url = agntBaseUrl.replace(/\/$/, '') + path;
  const headers = { 'Content-Type': 'application/json', 'X-AGNT-Client': 'edge-sidepanel' };
  if (agntToken) headers['Authorization'] = 'Bearer ' + agntToken;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  if (!res.ok) { const err = new Error(json?.error || json?.details || json?._raw || `HTTP ${res.status}`); err.status = res.status; err.details = json; throw err; }
  return json;
}

// --- Edge Copilot Policy Gate ---
function commandRiskScore(cmd = {}, pageContext = null) {
  const kind = String(cmd.kind || '').trim();
  let risk = 0.3, reason = 'default';
  if (kind === 'wait') return { risk: 0.0, reason: 'wait' };
  if (kind === 'screenshot') return { risk: 0.1, reason: 'screenshot' };
  if (kind === 'navigate') { risk = 0.35; reason = 'navigate'; }
  if (kind === 'openTab') { risk = 0.45; reason = 'openTab'; }
  if (kind === 'scroll') { risk = 0.15; reason = 'scroll'; }
  if (kind === 'click') { risk = 0.45; reason = 'click'; }
  if (kind === 'type') { risk = 0.55; reason = 'type'; }
  if (kind === 'pressKey') { risk = 0.4; reason = 'pressKey'; }
  if (kind === 'attachImage') { risk = 0.75; reason = 'attachImage'; }
  if (kind === 'closeTab') { risk = 0.85; reason = 'closeTab'; }
  const threatLevel = String(pageContext?.threatScan?.risk?.level || pageContext?.threatScan?.riskLevel || '').toLowerCase();
  if (threatLevel === 'high' && !['wait', 'screenshot', 'domAudit'].includes(kind)) {
    risk = Math.max(risk, 0.9);
    reason = `${reason}+active_threat_scan_high`;
  } else if (threatLevel === 'medium' && ['click', 'type', 'navigate', 'openTab', 'attachImage'].includes(kind)) {
    risk = Math.max(risk, 0.7);
    reason = `${reason}+active_threat_scan_medium`;
  }
  return { risk, reason };
}

async function evaluateEdgeCopilotPolicy(cmd, pageContext = null) {
  const { risk, reason } = commandRiskScore(cmd, pageContext);
  const facts = { risk, kind: String(cmd?.kind || ''), url: cmd?.url, css: cmd?.css, reason };
  let out;
  try {
    out = await agntFetch('/api/tools/symtorch-policy-bundle-evaluate/execute', {
      method: 'POST',
      body: { args: { policyBundleJson: JSON.stringify(BROWSER_PILOT_DEFAULT_POLICY_BUNDLE), factsJson: JSON.stringify(facts), entityId: 'bp-' + Date.now(), threshold: 0.5, runAdmission: false } }
    });
  } catch (e) {
    return { ok: false, error: 'SymTorch policy call failed: ' + (e?.message || String(e)), risk, reason };
  }
  const inner = out?.result ?? out?.details ?? out;
  if (!inner || inner.success !== true) return { ok: false, error: inner?.error || out?.error || 'SymTorch tool missing or failed', risk, reason };
  const decision = inner?.decision;
  const action = String(decision?.action || '').trim();
  return action.toLowerCase().startsWith('allow') ? { ok: true, risk, reason, action, decision, bundleMeta: inner?.bundleMeta } : { ok: false, error: 'Blocked by SymTorch policy: ' + (action || 'unknown_action'), risk, reason, action, decision, bundleMeta: inner?.bundleMeta };
}

// --- Telemetry ---
const TELEMETRY_ENDPOINT = '/api/telemetry/browserpilot';
async function recordTelemetry(eventType, data = {}) {
  try {
    await agntFetch(TELEMETRY_ENDPOINT, { method: 'POST', body: { eventType, adapter: 'edge', data, ts: new Date().toISOString() } });
  } catch { /* silent fail - telemetry should never break UX */ }
}

function tabSnapshot(tab = {}) {
  return {
    tabId: tab.id,
    windowId: tab.windowId,
    status: tab.status,
    active: Boolean(tab.active),
    url: tab.url,
    title: tab.title
  };
}

const tabTelemetryLast = new Map();
async function recordTabTelemetry(eventType, tab) {
  if (!tab?.id) return;
  const key = `${eventType}:${tab.id}:${tab.url || ''}:${tab.status || ''}`;
  const now = Date.now();
  if ((tabTelemetryLast.get(key) || 0) + 1500 > now) return;
  tabTelemetryLast.set(key, now);
  await recordTelemetry(eventType, tabSnapshot(tab));
}

// --- Silent AGNT Messaging (no new tabs) ---
const CHAT_FETCH_TIMEOUT_MS = 85000;

async function agntAgentChat(agentId, { message, context = {}, history = [] }) {
  const { agntBaseUrl, agntToken } = await getSettings();
  const url = agntBaseUrl.replace(/\/$/, '') + `/api/agents/${encodeURIComponent(agentId)}/chat`;
  const headers = { 'Content-Type': 'application/json' };
  if (agntToken) headers['Authorization'] = 'Bearer ' + agntToken;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHAT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ message, history, context, enabledTools: [] }), signal: controller.signal });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { _raw: text }; }
    if (!res.ok) throw new Error(json?.error || json?.details || json?._raw || `HTTP ${res.status}`);
    return json?.response || json?.result || text;
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('BrowserPilot sync timed out while waiting for AGNT.');
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- Command Execution with Telemetry ---
async function execCommandWithTelemetry(cmd, pageContext = null, edgeCopilotMode = false) {
  const kind = cmd?.kind || '';
  const start = Date.now();

  let policy = null;
  if (edgeCopilotMode) {
    policy = await evaluateEdgeCopilotPolicy(cmd, pageContext);
    if (!policy?.ok) {
      await recordTelemetry('command_blocked', { kind, reason: policy?.reason || 'policy', risk: policy?.risk });
      return { ok: false, error: policy?.error || 'Blocked by policy', policy };
    }
  }

  let result;
  try {
    if (kind === 'navigate') { result = await navigateTab(cmd.url); }
    else if (kind === 'openTab') { result = await openNewTab(cmd.url); }
    else if (kind === 'closeTab') { result = await closeCurrentTab(); }
    else if (kind === 'screenshot') { result = await captureTab(); }
    else { result = await sendContentMessage({ type: 'AGNT_EXEC', command: cmd }); }
  } catch (e) {
    await recordTelemetry('command_error', { kind, error: e?.message || String(e) });
    return { ok: false, error: e?.message || String(e), policy };
  }

  await recordTelemetry('command_executed', { kind, durationMs: Date.now() - start, policy: policy?.ok || false });
  return { ok: true, result, policy };
}

// --- Helper Commands ---
async function navigateTab(url) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab');
  await chrome.tabs.update(tab.id, { url: url.trim() });
  return { navigated: true };
}

async function openNewTab(url) {
  const tab = await chrome.tabs.create({ url: url.trim(), active: true });
  return { openedTabId: tab.id };
}

async function enableSidePanelAction() {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

async function openPanelForTab(tabId) {
  if (chrome.sidePanel?.open && typeof tabId === 'number') {
    try {
      await chrome.sidePanel.open({ tabId });
      return { ok: true, mode: 'sidePanel', tabId };
    } catch (e) {
      const message = e?.message || String(e);
      if (!/user gesture/i.test(message)) throw e;
      const url = chrome.runtime.getURL('sidepanel.html');
      const tab = await chrome.tabs.create({ url, active: true });
      return { ok: true, mode: 'tabFallback', tabId: tab?.id ?? null, sidePanelError: message };
    }
  }

  const url = chrome.runtime.getURL('sidepanel.html');
  const tab = await chrome.tabs.create({ url, active: true });
  return { ok: true, mode: 'tabFallback', tabId: tab?.id ?? null };
}

async function refreshContentScriptsInOpenTabs() {
  if (!chrome.scripting?.executeScript) return;
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map(async (tab) => {
    if (typeof tab?.id !== 'number') return;
    if (!/^https?:\/\//i.test(tab.url || '')) return;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['contentScript.js']
    });
  }));
}

async function closeCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab');
  await chrome.tabs.remove(tab.id);
  return { closed: true };
}

async function captureTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab?.windowId) throw new Error('No active tab/window');
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  return { dataUrl };
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function resolveLiveTabId(preferredTabId) {
  if (typeof preferredTabId === 'number') {
    try {
      await chrome.tabs.get(preferredTabId);
      return preferredTabId;
    } catch {
      // The side panel can keep a tab id after Edge closes/replaces that tab.
    }
  }
  return await getActiveTabId();
}

async function sendContentMessage(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab');
  return sendTabMessage(tab.id, msg);
}

async function ensureContentScript(tabId) {
  if (typeof tabId !== 'number') throw new Error('No tabId for content script injection.');
  if (!chrome.scripting?.executeScript) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['contentScript.js']
    });
  } catch (e) {
    throw new Error('Could not inject page tools into this Edge tab: ' + (e?.message || String(e)));
  }
}

async function sendTabMessage(tabId, msg) {
  try {
    return await chrome.tabs.sendMessage(tabId, msg);
  } catch (e) {
    const message = e?.message || String(e);
    if (!/Receiving end does not exist|Could not establish connection/i.test(message)) throw e;
    await ensureContentScript(tabId);
    return await chrome.tabs.sendMessage(tabId, msg);
  }
}

// --- AGNT Agent Creation (silent - no auto-open) ---
async function ensureDefaultAgent() {
  const agents = await agntFetch('/api/agents/');
  const desiredName = 'Edge Tab Operator';
  const existing = agents.agents?.find(a => a?.name === desiredName);
  if (existing) return { created: false, agents };

  await agntFetch('/api/users/settings'); // preflight
  const agent = {
    name: desiredName,
    description: 'Sidepanel agent for Edge that drives the ACTIVE TAB via AGNT_EXEC (no Playwright).',
    status: 'active',
    icon: '🧠',
    category: 'browser_sidepanel',
    creditLimit: 1000,
    creditsUsed: 0,
    assignedTools: [],
    systemPrompt: [
      'You are the BrowserPilot agent running inside the Edge Side Panel.',
      'Control the CURRENT ACTIVE TAB by emitting: AGNT_EXEC: [JSON array of commands].',
      'For page probing or browser diagnostics, use AGNT_EXEC: [{"kind":"domAudit","includeResources":true}]. This is diagnostic only; never bypass challenges or extract cookies/tokens.',
      'If edgeCopilotMode is true, commands may be policy-gated.',
      'Do NOT spawn browsers or use ai-browser-use.'
    ].join('\n')
  };
  await agntFetch('/api/agents/save', { method: 'POST', body: { agent } });
  return { created: true, agents: await agntFetch('/api/agents/') };
}

// --- Exposed via chrome.runtime.onMessage ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'AGNT_GET_SETTINGS') { sendResponse({ ok: true, settings: await getSettings() }); return; }
      if (msg?.type === 'AGNT_SET_SETTINGS') { await chrome.storage.sync.set(msg.settings || {}); sendResponse({ ok: true }); return; }
      if (msg?.type === 'AGNT_LIST_AGENTS') { const data = await agntFetch('/api/agents/'); sendResponse({ ok: true, agents: data.agents || [] }); return; }
      if (msg?.type === 'AGNT_ENSURE_DEFAULT_AGENT') { const out = await ensureDefaultAgent(); sendResponse({ ok: true, ...out }); return; }
      if (msg?.type === 'AGNT_CHAT') { const { agentId, message, context } = msg; const resp = await agntAgentChat(agentId, { message, context }); sendResponse({ ok: true, data: { response: resp } }); return; }
      if (msg?.type === 'AGNT_OPEN_SIDEPANEL' || msg?.type === 'BROWSERPILOT_OPEN_SIDEPANEL') {
        const tabId = typeof sender?.tab?.id === 'number'
          ? sender.tab.id
          : await resolveLiveTabId(msg.tabId);
        if (typeof tabId !== 'number') { sendResponse({ ok: false, error: 'No tab context for side panel.' }); return; }
        sendResponse(await openPanelForTab(tabId));
        return;
      }
      if (msg?.type === 'AGNT_OPEN_CHAT_AND_SEND') {
        sendResponse({ ok: true, tabId: null, disabled: true, reason: 'BrowserPilot side-panel chat is sidepanel-only; no AGNT tabs will be opened.' });
        return;
      }

      if (msg?.type === 'AGNT_SEND_AND_MIRROR') {
        const { agentId, message } = msg;
        if (!agentId) throw new Error('agentId is required');
        if (!message || !String(message).trim()) throw new Error('message is required');
        const response = await agntAgentChat(agentId, {
          message,
          history: Array.isArray(msg.history) ? msg.history : [],
          context: msg.context || {}
        });
        sendResponse({ ok: true, response, chatTabId: null, mirrored: false });
        return;
      }
      if (msg?.type === 'AGNT_ABORT_REQUEST') { sendResponse({ ok: true, aborted: false, requestId: msg.requestId || null }); return; }
      if (msg?.type === 'AGNT_EXEC_COMMAND') { const { command, pageContext, edgeCopilot } = msg; const r = await execCommandWithTelemetry(command, pageContext, Boolean(edgeCopilot)); sendResponse(r); return; }

      if (msg?.type === 'AGNT_CAPTURE_VISIBLE_TAB' || msg?.type === 'BROWSERPILOT_CAPTURE_VISIBLE_TAB') {
        const tabId = await resolveLiveTabId(msg.tabId ?? sender?.tab?.id);
        if (typeof tabId !== 'number') { sendResponse({ ok: false, error: 'No active tabId for screenshot capture.' }); return; }
        const tab = await chrome.tabs.get(tabId);
        if (typeof tab?.windowId !== 'number') { sendResponse({ ok: false, error: 'No windowId for screenshot capture.' }); return; }
        try {
          const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
          sendResponse({ ok: true, dataUrl, tabId });
        } catch (e) {
          sendResponse({ ok: false, error: e?.message || String(e) });
        }
        return;
      }

      if (msg?.type === 'AGNT_CAPTURE_ACTIVE_TAB') {
        const tabId = await resolveLiveTabId(msg.tabId);
        if (typeof tabId !== 'number') throw new Error('No active tab');
        const res = await sendTabMessage(tabId, { type: 'AGNT_CAPTURE_CONTEXT' });
        await recordTelemetry('context_captured', {
          tabId,
          url: res?.context?.page?.url,
          title: res?.context?.page?.title,
          selectionChars: String(res?.context?.selection || '').length,
          pageTextChars: String(res?.context?.pageText || '').length
        });
        sendResponse({ ok: true, tabId, context: res?.context || null });
        return;
      }

      if (msg?.type === 'AGNT_START_CYBER_SNAPSHOT' || msg?.type === 'BROWSERPILOT_START_CYBER_SNAPSHOT') {
        const tabId = await resolveLiveTabId(msg.tabId);
        if (typeof tabId !== 'number') throw new Error('No active tab');
        const res = await sendTabMessage(tabId, { type: 'AGNT_START_CYBER_SNAPSHOT' });
        await recordTelemetry(res?.ok ? 'cyber_snapshot_started' : 'cyber_snapshot_failed', {
          tabId,
          ok: Boolean(res?.ok),
          error: res?.ok ? null : res?.error
        });
        sendResponse({ ...(res || {}), tabId });
        return;
      }

      if (msg?.type === 'AGNT_START_REGION_WATCH' || msg?.type === 'BROWSERPILOT_START_REGION_WATCH') {
        const tabId = await resolveLiveTabId(msg.tabId);
        if (typeof tabId !== 'number') throw new Error('No active tab');
        const res = await sendTabMessage(tabId, {
          type: 'AGNT_START_REGION_WATCH',
          rect: msg.rect,
          previousText: msg.previousText || '',
          page: msg.page || null
        });
        await recordTelemetry(res?.ok ? 'cyber_region_watch_started' : 'cyber_region_watch_failed', {
          tabId,
          rect: msg.rect || null,
          ok: Boolean(res?.ok),
          error: res?.ok ? null : res?.error
        });
        sendResponse({ ...(res || {}), tabId });
        return;
      }

      if (msg?.type === 'AGNT_STOP_REGION_WATCH' || msg?.type === 'BROWSERPILOT_STOP_REGION_WATCH') {
        const tabId = await resolveLiveTabId(msg.tabId);
        if (typeof tabId !== 'number') throw new Error('No active tab');
        const res = await sendTabMessage(tabId, { type: 'AGNT_STOP_REGION_WATCH' });
        await recordTelemetry('cyber_region_watch_stopped', { tabId, ok: Boolean(res?.ok) });
        sendResponse({ ...(res || {}), tabId });
        return;
      }

      if (msg?.type === 'BROWSERPILOT_START_CONTEXT_RADAR') {
        const tabId = await resolveLiveTabId(msg.tabId);
        if (typeof tabId !== 'number') throw new Error('No active tab');
        const res = await sendTabMessage(tabId, { type: 'BROWSERPILOT_START_CONTEXT_RADAR' });
        await recordTelemetry(res?.ok ? 'context_radar_started' : 'context_radar_failed', {
          tabId,
          ok: Boolean(res?.ok),
          error: res?.ok ? null : res?.error
        });
        sendResponse({ ...(res || {}), tabId });
        return;
      }

      if (msg?.type === 'BROWSERPILOT_START_THREAT_SCAN') {
        const tabId = await resolveLiveTabId(msg.tabId);
        if (typeof tabId !== 'number') throw new Error('No active tab');
        await recordTelemetry('threat_scan_started', { tabId });
        const res = await sendTabMessage(tabId, { type: 'BROWSERPILOT_START_THREAT_SCAN' });
        await recordTelemetry(res?.ok ? 'threat_scan_completed' : 'threat_scan_failed', {
          tabId,
          ok: Boolean(res?.ok),
          risk: res?.report?.risk || null,
          counts: res?.report?.counts || null,
          error: res?.ok ? null : res?.error
        });
        sendResponse({ ...(res || {}), tabId });
        return;
      }

      if (msg?.type === 'AGNT_EXEC_ACTIVE_TAB') {
        const tabId = await resolveLiveTabId(msg.tabId);
        if (typeof tabId !== 'number') throw new Error('No active tab');

        const cmd = msg.command || {};
        const kind = cmd.kind;
        const edgeCopilot = Boolean(msg.edgeCopilot);
        const policyBypass = Boolean(msg.policyBypass);
        const pageCtx = msg.pageContext || null;

        let policy = null;
        if (edgeCopilot && !policyBypass) {
          policy = await evaluateEdgeCopilotPolicy(cmd, pageCtx);
          if (!policy?.ok) {
            await recordTelemetry('command_blocked', { tabId, kind, reason: policy?.reason || 'policy', risk: policy?.risk });
            sendResponse({ ok: false, error: policy?.error || 'Blocked by policy', policy });
            return;
          }
        }

        if (kind === 'navigate') {
          const url = String(cmd.url || '').trim();
          if (!url) throw new Error('navigate.url is required');
          await chrome.tabs.update(tabId, { url });
          await recordTelemetry('command_executed', { tabId, kind, url, policy: Boolean(policy?.ok) });
          sendResponse({ ok: true, result: 'navigated ' + url, policy });
          return;
        }

        if (kind === 'openTab') {
          const url = String(cmd.url || '').trim();
          if (!url) throw new Error('openTab.url is required');
          const created = await chrome.tabs.create({ url, active: true, openerTabId: tabId });
          await recordTelemetry('command_executed', { tabId, kind, url, openedTabId: created?.id, policy: Boolean(policy?.ok) });
          sendResponse({ ok: true, result: 'opened tab ' + url, tabId: created?.id, policy });
          return;
        }

        if (kind === 'closeTab') {
          await chrome.tabs.remove(tabId);
          await recordTelemetry('command_executed', { tabId, kind, policy: Boolean(policy?.ok) });
          sendResponse({ ok: true, result: 'closed active tab', policy });
          return;
        }

        const res = await sendTabMessage(tabId, { type: 'AGNT_EXEC', command: cmd });
        await recordTelemetry(res?.ok === false ? 'command_error' : 'command_executed', {
          tabId,
          kind,
          error: res?.ok === false ? res?.error : undefined,
          policy: Boolean(policy?.ok)
        });
        sendResponse({ ...(res || {}), policy });
        return;
      }

      if (msg?.type === 'AGNT_TELEMETRY') { await recordTelemetry(msg.eventType || 'generic', msg.data || {}); sendResponse({ ok: true }); return; }
      if (msg?.type === 'AGNT_ANALYZE_TELEMETRY') { const data = await agntFetch('/api/telemetry/browserpilot/analyze', { method: 'POST', body: { limit: msg.limit || 200, context: msg.context || {} } }); sendResponse({ ok: true, data }); return; }
      sendResponse({ ok: true, ignored: true });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();
  return true;
});

// --- Init ---
chrome.runtime.onInstalled.addListener(() => {
  enableSidePanelAction().catch(() => {});
  refreshContentScriptsInOpenTabs().catch(() => {});
});
chrome.runtime.onStartup?.addListener(() => {
  enableSidePanelAction().catch(() => {});
  refreshContentScriptsInOpenTabs().catch(() => {});
});
enableSidePanelAction().catch(() => {});
refreshContentScriptsInOpenTabs().catch(() => {});

chrome.action?.onClicked?.addListener(async (tab) => {
  try {
    await openPanelForTab(tab?.id);
  } catch (e) {
    const url = chrome.runtime.getURL('sidepanel.html');
    await chrome.tabs.create({ url, active: true });
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await recordTabTelemetry('tab_activated', tab);
  } catch {}
});
chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== 'complete') return;
  try { await recordTabTelemetry('tab_updated', tab); } catch {}
});
