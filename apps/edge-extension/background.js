// BrowserPilot background service worker (MV3)


import { BROWSER_PILOT_DEFAULT_POLICY_BUNDLE } from './policyBundles.js';

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

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }

  if (!res.ok) {
    const err = new Error(json?.error || json?.details || json?._raw || `HTTP ${res.status}`);
    err.status = res.status;
    err.details = json;
    throw err;
  }

  return json;
}

// --- Edge Copilot (AGNT + SymTorch) policy gate ---
function commandRiskScore(cmd = {}, pageContext = null) {
  const kind = String(cmd.kind || '').trim();
  const url = String(cmd.url || '').trim();
  const css = String(cmd.css || '').trim();

  let risk = 0.3;
  let reason = 'default';

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

  // Heuristics for "posting" actions (prototype X helpers)
  if (kind.startsWith('xCompose')) { risk = Math.max(risk, 0.9); reason = reason + '+xCompose'; }
  if (kind === 'click' && /tweetButton|post|submit/i.test(css)) { risk = Math.max(risk, 0.9); reason = reason + '+postClick'; }
  if (kind === 'type' && /password|passcode|otp/i.test(css)) { risk = Math.max(risk, 0.9); reason = reason + '+sensitiveField'; }

  // If agent tries to navigate to unknown domains, bump slightly (still bounded)
  const ctxUrl = String(pageContext?.page?.url || '').trim();
  if (kind === 'navigate' && url && ctxUrl) {
    try {
      const a = new URL(ctxUrl);
      const b = new URL(url);
      if (a.hostname !== b.hostname) {
        risk = Math.max(risk, 0.5);
        reason = reason + '+crossDomain';
      }
    } catch {
      // ignore
    }
  }

  return { risk, reason };
}

async function evaluateEdgeCopilotPolicy(cmd, pageContext = null) {
  const { risk, reason } = commandRiskScore(cmd, pageContext);

  // Facts are intentionally small + JSON-safe
  const facts = {
    risk,
    kind: String(cmd?.kind || ''),
    url: cmd?.url ? String(cmd.url) : undefined,
    css: cmd?.css ? String(cmd.css) : undefined,
    reason
  };

  // Call AGNT tool (requires symtorch-toolkit plugin installed)
  let out;
  try {
    out = await agntFetch('/api/tools/symtorch-policy-bundle-evaluate/execute', {
      method: 'POST',
      body: {
        args: {
          policyBundleJson: JSON.stringify(BROWSER_PILOT_DEFAULT_POLICY_BUNDLE),
          factsJson: JSON.stringify(facts),
          entityId: 'browserpilot-cmd-' + Date.now(),
          threshold: 0.5,
          runAdmission: false
        }
      }
    });
  } catch (e) {
    return { ok: false, error: 'SymTorch policy call failed: ' + (e?.message || String(e)), risk, reason };
  }

  // Tool execution wrapper may be either {success,result} or raw tool output.
  const inner = out?.result ?? out?.details ?? out;
  if (!inner || inner.success !== true) {
    const err = inner?.error || out?.error || 'SymTorch tool missing or failed';
    return { ok: false, error: err, risk, reason, raw: out };
  }

  const decision = inner?.decision;
  const action = String(decision?.action || '').trim();

  const allow = action.toLowerCase().startsWith('allow');
  if (!allow) {
    return {
      ok: false,
      error: 'Blocked by SymTorch policy: ' + (action || 'unknown_action'),
      risk,
      reason,
      action,
      decision,
      bundleMeta: inner?.bundleMeta
    };
  }

  return {
    ok: true,
    risk,
    reason,
    action,
    decision,
    bundleMeta: inner?.bundleMeta
  };
}

// --- Abort / Stop support ---
const abortControllers = new Map(); // requestId -> AbortController

// --- Agent chat SSE helpers ---
function parseSSEAssistantFromText(raw) {
  if (!raw || typeof raw !== 'string') return '';
  // Split on blank line boundaries (\n\n or \r\n\r\n)
  const frames = raw.split(/\r?\n\r?\n/).map(s => s.trim()).filter(Boolean);
  let lastAccumulated = '';
  for (const frame of frames) {
    let ev = '';
    const dataLines = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith('event:')) ev = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) continue;
    const dataStr = dataLines.join('\n');
    let payload = null;
    try { payload = JSON.parse(dataStr); } catch { payload = null; }

    if (ev === 'content_delta' && payload?.accumulated != null) {
      lastAccumulated = String(payload.accumulated);
    }
    if (ev === 'assistant_message' && payload?.content) {
      // Some backends may emit final content here (non-delta mode)
      lastAccumulated = String(payload.content);
    }
  }
  return lastAccumulated;
}

async function agntAgentChat(agentId, { message, context = {}, history = [] }, { requestId, streamToExtension = false, signal } = {}) {
  const { agntBaseUrl, agntToken } = await getSettings();
  const url = agntBaseUrl.replace(/\/$/, '') + `/api/agents/${encodeURIComponent(agentId)}/chat`;

  const headers = { 'Content-Type': 'application/json' };
  if (agntToken) headers['Authorization'] = 'Bearer ' + agntToken;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      // Fail-closed tool scoping for the Edge side panel:
      // we do NOT want the backend to ever expose browser automation tools
      // (ai-browser-use) to this chat surface. The side panel drives the active
      // Edge tab via AGNT_EXEC instead.
      body: JSON.stringify({ message, history, context, enabledTools: [] }),
      signal
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      // Stopped before the request was established.
      if (streamToExtension && requestId) {
        chrome.runtime.sendMessage({ type: 'AGNT_EXTENSION_RESPONSE', requestId, content: '[stopped]', done: true }).catch(() => {});
      }
      return '';
    }
    throw e;
  }

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `HTTP ${res.status}`);
  }

  const ctype = (res.headers.get('content-type') || '').toLowerCase();
  const looksLikeSSE = ctype.includes('text/event-stream');

  // Stream parse (preferred) so the side panel can update live and we can extract the final assistant content.
  if (looksLikeSSE && res.body) {
    const reader = res.body.getReader();
    const dec = new TextDecoder('utf-8');
    let buf = '';
    let lastAccumulated = '';

    const emit = (content, done = false) => {
      if (!streamToExtension || !requestId) return;
      chrome.runtime.sendMessage({
        type: 'AGNT_EXTENSION_RESPONSE',
        requestId,
        content,
        done
      }).catch(() => {});
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buf += dec.decode(value, { stream: true });

        // Process complete frames in buffer
        // Find blank-line separator; handle both \n\n and \r\n\r\n.
        while (true) {
          let idx = buf.indexOf('\n\n');
          const idx2 = buf.indexOf('\r\n\r\n');
          if (idx === -1 || (idx2 !== -1 && idx2 < idx)) idx = idx2;
          if (idx === -1) break;

          const frame = buf.slice(0, idx).trim();
          buf = buf.slice(idx + (idx === idx2 ? 4 : 2));
          if (!frame) continue;

          let ev = '';
          const dataLines = [];
          for (const line of frame.split(/\r?\n/)) {
            if (line.startsWith('event:')) ev = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
          }
          if (!dataLines.length) continue;

          const dataStr = dataLines.join('\n');
          let payload = null;
          try { payload = JSON.parse(dataStr); } catch { payload = null; }

          if (ev === 'content_delta' && payload?.accumulated != null) {
            lastAccumulated = String(payload.accumulated);
            emit(lastAccumulated, false);
          }
          if (ev === 'assistant_message' && payload?.content) {
            lastAccumulated = String(payload.content);
            emit(lastAccumulated, false);
          }
        }
      }
    } catch (e) {
      if (e?.name === 'AbortError') {
        // Stopped mid-stream.
        emit(lastAccumulated ? (lastAccumulated + "\n\n[stopped]") : '[stopped]', true);
        return lastAccumulated || '';
      }
      throw e;
    }

    // Final flush: parse any residual buffered SSE text
    const tail = parseSSEAssistantFromText(buf);
    if (tail) lastAccumulated = tail;

    emit(lastAccumulated, true);
    return lastAccumulated;
  }

  // Non-SSE fallback: parse text as JSON or as SSE-like payload.
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (typeof json?.response === 'string') return json.response;
    if (typeof json?.result === 'string') return json.result;
    if (typeof json?.raw === 'string') return parseSSEAssistantFromText(json.raw) || json.raw;
    if (typeof json?._raw === 'string') return parseSSEAssistantFromText(json._raw) || json._raw;
    return typeof json === 'string' ? json : JSON.stringify(json, null, 2);
  } catch {
    if (text.trim().startsWith('event:')) return parseSSEAssistantFromText(text) || text;
    return text;
  }
}

function browserPilotSystemPrompt(context = {}) {
  return [
    'You are BrowserPilot, a browser operator running inside a Chromium Side Panel.',
    'You help the user understand and operate the current browser tab through bounded, inspectable commands.',
    'When the user asks you to control the ACTIVE TAB, output exactly one line starting with AGNT_EXEC: followed by valid JSON.',
    'The JSON must be an array of command objects, for example:',
    'AGNT_EXEC: [{"kind":"navigate","url":"https://example.com"},{"kind":"click","css":"button#login"}]',
    'Prefer kind="navigate" in the same tab unless the user explicitly asks for a new tab.',
    'Do not wrap AGNT_EXEC JSON in markdown fences.',
    context?.edgeCopilotMode
      ? 'Edge Copilot mode is enabled: keep actions low-risk because commands may be policy-gated.'
      : 'If Jarvis/control mode is off, answer normally and do not emit AGNT_EXEC unless asked to plan.'
  ].join('\n');
}

function buildHermesMessages({ message, history = [], context = {} }) {
  const page = context?.pageContext?.page || {};
  const selection = context?.pageContext?.selection || '';
  const pageText = context?.pageContext?.pageText || '';
  const contextBlock = [
    page?.url ? `Current URL: ${page.url}` : '',
    page?.title ? `Current title: ${page.title}` : '',
    selection ? `Selection: ${String(selection).slice(0, 2000)}` : '',
    pageText ? `Page text excerpt: ${String(pageText).slice(0, 6000)}` : ''
  ].filter(Boolean).join('\n');

  const messages = [{ role: 'system', content: browserPilotSystemPrompt(context) }];
  for (const item of Array.isArray(history) ? history.slice(-40) : []) {
    const role = item?.role === 'assistant' ? 'assistant' : 'user';
    const content = String(item?.content || '').trim();
    if (content) messages.push({ role, content });
  }
  messages.push({
    role: 'user',
    content: contextBlock ? `${contextBlock}\n\nUser request: ${message}` : String(message || '')
  });
  return messages;
}

function parseOpenAIStyleSSE(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let out = '';
  for (const frame of raw.split(/\r?\n\r?\n/)) {
    for (const line of frame.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        out += json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || json?.output_text || '';
      } catch {
        // ignore malformed keepalive/event frames
      }
    }
  }
  return out;
}

async function hermesAgentChat({ message, history = [], context = {}, bridgeConversationKey = 'browserpilot-hermes' }, { requestId, streamToExtension = false, signal } = {}) {
  const { hermesBaseUrl, hermesApiKey } = await getSettings();
  const base = (hermesBaseUrl || 'http://localhost:8642').replace(/\/$/, '');
  const url = base + '/v1/chat/completions';
  const headers = {
    'Content-Type': 'application/json',
    'X-Hermes-Session-Key': bridgeConversationKey
  };
  if (hermesApiKey) headers.Authorization = 'Bearer ' + hermesApiKey;

  const emit = (content, done = false) => {
    if (!streamToExtension || !requestId) return;
    chrome.runtime.sendMessage({ type: 'AGNT_EXTENSION_RESPONSE', requestId, content, done }).catch(() => {});
  };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'hermes-agent',
        messages: buildHermesMessages({ message, history, context }),
        stream: true
      }),
      signal
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      emit('[stopped]', true);
      return '';
    }
    throw e;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Hermes HTTP ${res.status}`);
  }

  const ctype = (res.headers.get('content-type') || '').toLowerCase();
  if (ctype.includes('text/event-stream') && res.body) {
    const reader = res.body.getReader();
    const dec = new TextDecoder('utf-8');
    let buf = '';
    let content = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        while (true) {
          let idx = buf.indexOf('\n\n');
          const idx2 = buf.indexOf('\r\n\r\n');
          if (idx === -1 || (idx2 !== -1 && idx2 < idx)) idx = idx2;
          if (idx === -1) break;
          const frame = buf.slice(0, idx + (idx === idx2 ? 4 : 2));
          buf = buf.slice(idx + (idx === idx2 ? 4 : 2));
          content += parseOpenAIStyleSSE(frame);
          emit(content, false);
        }
      }
    } catch (e) {
      if (e?.name === 'AbortError') {
        emit(content ? `${content}\n\n[stopped]` : '[stopped]', true);
        return content;
      }
      throw e;
    }
    content += parseOpenAIStyleSSE(buf);
    emit(content, true);
    return content;
  }

  const text = await res.text();
  try {
    const json = JSON.parse(text);
    const content = json?.choices?.[0]?.message?.content || json?.choices?.[0]?.delta?.content || json?.output_text || JSON.stringify(json, null, 2);
    emit(content, true);
    return content;
  } catch {
    const content = parseOpenAIStyleSSE(text) || text;
    emit(content, true);
    return content;
  }
}

chrome.runtime.onInstalled?.addListener(async () => {
  try {
    if (chrome.sidePanel?.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  } catch {
    // ignore
  }
});

async function openPanelForTab(tabId) {
  if (chrome.sidePanel?.open) {
    await chrome.sidePanel.open({ tabId });
    return { ok: true, mode: 'sidePanel', tabId };
  }

  const url = chrome.runtime.getURL('sidepanel.html');
  await chrome.tabs.create({ url });
  return { ok: true, mode: 'tabFallback', tabId };
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function listAgents() {
  const { agentBackend, hermesBaseUrl } = await getSettings();
  if (agentBackend === 'hermes') {
    return [{
      id: 'hermes-browser-pilot',
      name: 'Hermes Browser Pilot',
      description: `Hermes API Server adapter (${(hermesBaseUrl || 'http://localhost:8642').replace(/\/$/, '')})`,
      assignedTools: []
    }];
  }

  const data = await agntFetch('/api/agents/');
  return data.agents || [];
}

async function ensureDefaultAgent() {
  const { agentBackend } = await getSettings();
  if (agentBackend === 'hermes') {
    return { created: false, agents: await listAgents() };
  }

  const agents = await listAgents();

  // We intentionally DO NOT default to ai-browser-use here.
  // The user wants the sidepanel agent to control the *current Edge tab* via AGNT_EXEC,
  // not to launch Playwright/Chromium windows.
  const desiredName = 'Edge Tab Operator';
  const existing = agents.find(a => a?.name === desiredName);
  if (existing) return { created: false, agents };

  // Preflight: ensure user settings exist (provider/model) under this token.
  // If this fails, we are almost certainly pointed at the wrong AGNT instance or using the wrong token.
  await agntFetch('/api/users/settings');

  const agent = {
    name: desiredName,
    description: 'Sidepanel agent for Microsoft Edge that drives the ACTIVE TAB via AGNT_EXEC commands (no Playwright, no spawning browsers).',
    status: 'active',
    icon: '🧠',
    category: 'browser_sidepanel',
    creditLimit: 1000,
    creditsUsed: 0,
    assignedTools: [],
    systemPrompt: [
      'You are a browser operator running inside the Microsoft Edge Side Panel.',
      'You are the BrowserPilot agent bridge: the user wants agents let all the way into the live browser, with bounded, inspectable actions.',
      'Use a SymTorch-compatible operating style: state the intended action, emit only explicit command JSON, and keep actions observable and reversible when possible.',
      'If edgeCopilotMode is true in context, your commands will be SymTorch-gated. Keep risk low and prefer reversible actions.',
      'CRITICAL: Do NOT use ai-browser-use or any external browser automation tools.',
      'You control the user\'s CURRENT ACTIVE TAB by emitting one line that starts with: AGNT_EXEC: followed by valid JSON.',
      'The JSON must be an array of command objects, e.g.:',
      'AGNT_EXEC: [{"kind":"navigate","url":"https://example.com"},{"kind":"click","css":"button#login"}]',
      'Prefer kind="navigate" (same tab) unless the user explicitly asks for a new tab.',
      'After emitting AGNT_EXEC, also describe briefly what you did.'
    ].join('\n')
  };

  // IMPORTANT: AGNT expects { agent } payload.
  await agntFetch('/api/agents/save', { method: 'POST', body: { agent } });

  const next = await listAgents();
  return { created: true, agents: next };
}

async function openOrFocusAgntChatTab({ activate = false } = {}) {
  const { agntBaseUrl } = await getSettings();
  const base = (agntBaseUrl || 'http://localhost:3333').replace(/\/$/, '');
  const chatUrl = base + '/chat';

  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((t) => typeof t.url === 'string' && t.url.startsWith(chatUrl));

  if (existing?.id) {
    if (activate) {
      await chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true });
    }
    return existing.id;
  }

  const created = await chrome.tabs.create({ url: chatUrl, active: activate });
  return created.id;
}

function waitForTabComplete(tabId, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timeout waiting for AGNT chat tab to load'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    }

    async function onUpdated(id, info) {
      if (id !== tabId) return;
      if (info.status === 'complete') {
        cleanup();
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(onUpdated);

    // Fast path: if already complete.
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return;
      if (tab?.status === 'complete') {
        cleanup();
        resolve();
      }
    });
  });
}

async function postMessageIntoAgntChat(tabId, payload) {
  // Wait until the AGNT Chat screen has mounted the bridge listener.
  for (let i = 0; i < 24; i++) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => Boolean(window.__agntExtensionBridgeReady),
      });
      if (result) break;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    args: [payload],
    func: (data) => {
      window.postMessage(data, '*');
    },
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'AGNT_GET_SETTINGS') {
        sendResponse({ ok: true, settings: await getSettings() });
        return;
      }

      if (msg?.type === 'AGNT_SET_SETTINGS') {
        await chrome.storage.sync.set(msg.settings || {});
        sendResponse({ ok: true });
        return;
      }

      if (msg?.type === 'AGNT_LIST_AGENTS') {
        const data = await listAgents();
        sendResponse({ ok: true, agents: data });
        return;
      }

      if (msg?.type === 'AGNT_ENSURE_DEFAULT_AGENT') {
        const out = await ensureDefaultAgent();
        sendResponse({ ok: true, ...out });
        return;
      }

      if (msg?.type === 'AGNT_CHAT') {
        const { agentId, message, context } = msg;
        const { agentBackend } = await getSettings();
        if (agentBackend === 'hermes') {
          const response = await hermesAgentChat({ message, context: context || {}, bridgeConversationKey: msg.bridgeConversationKey || 'browserpilot-hermes' });
          sendResponse({ ok: true, data: { response } });
          return;
        }
        const response = await agntAgentChat(agentId, { message, context: context || {} });
        sendResponse({ ok: true, data: { response } });
        return;
      }

      if (msg?.type === 'AGNT_SUGGESTIONS') {
        const { agentBackend } = await getSettings();
        if (agentBackend === 'hermes') {
          sendResponse({ ok: true, data: { suggestions: ['Summarize this page', 'Find the next useful action', 'Navigate to the relevant account page'] } });
          return;
        }
        const { agentId, context } = msg;
        const data = await agntFetch(`/api/agents/${encodeURIComponent(agentId)}/suggestions`, {
          method: 'POST',
          body: { context: context || '' }
        });
        sendResponse({ ok: true, data });
        return;
      }

      if (msg?.type === 'AGNT_OPEN_SIDEPANEL') {
        const tabId = sender?.tab?.id;
        if (typeof tabId !== 'number') {
          sendResponse({ ok: false, error: 'No sender tab context.' });
          return;
        }
        sendResponse(await openPanelForTab(tabId));
        return;
      }

      // Canonical bridge: open/focus the real AGNT /chat UI and postMessage a send request into it.
      // This makes the sidebar "feel" like the same chat surface (same renderer, same theme, same
      // persistent conversation/memory) instead of duplicating chat logic in the extension.
      if (msg?.type === 'AGNT_OPEN_CHAT_AND_SEND') {
        const chatTabId = await openOrFocusAgntChatTab({ activate: Boolean(msg.activate) });
        if (typeof chatTabId !== 'number') throw new Error('Unable to open AGNT chat tab');
        await waitForTabComplete(chatTabId);

        const payload = {
          type: 'AGNT_EXTENSION_SEND',
          source: 'agnt-browser-agents',
          requestId: msg.requestId || null,
          message: msg.message,
          agentId: msg.agentId || null,
          agentName: msg.agentName || null,
          bridgeConversationKey: msg.bridgeConversationKey || (msg.agentId ? `browserpilot-agent-${msg.agentId}` : 'browserpilot-default'),
          bridgeConversationTitle: msg.bridgeConversationTitle || 'BrowserPilot',
          pageContext: msg.pageContext || null,
          at: new Date().toISOString(),
        };

        // Post twice with a small delay to avoid the "Vue mounted after tab complete" race.
        await postMessageIntoAgntChat(chatTabId, payload);
        setTimeout(() => { postMessageIntoAgntChat(chatTabId, payload).catch(() => {}); }, 600);

        sendResponse({ ok: true, tabId: chatTabId });
        return;
      }

      // Side panel UX: return an immediate agent response for the sidebar,
      // while also mirroring the same user message into the canonical AGNT /chat.
      if (msg?.type === 'AGNT_SEND_AND_MIRROR') {
        const agentId = msg.agentId;
        const message = msg.message;
        const context = msg.context || {};
        const history = Array.isArray(msg.history) ? msg.history : [];
        const pageContext = msg.pageContext || null;
        const agentName = msg.agentName || null;
        const bridgeConversationKey = msg.bridgeConversationKey || `browserpilot-agent-${agentId}`;
        const bridgeConversationTitle = msg.bridgeConversationTitle || `BrowserPilot - ${agentName || 'Edge Tab Operator'}`;
        const { agentBackend } = await getSettings();

        if (!agentId) throw new Error('agentId is required');
        if (!message || !String(message).trim()) throw new Error('message is required');

        if (agentBackend === 'hermes') {
          const rid = msg.requestId || null;
          const controller = rid ? new AbortController() : null;
          if (rid && controller) abortControllers.set(rid, controller);

          let response;
          try {
            response = await hermesAgentChat(
              { message, history, context, bridgeConversationKey },
              { requestId: rid, streamToExtension: true, signal: controller?.signal }
            );
          } finally {
            if (rid) abortControllers.delete(rid);
          }

          sendResponse({ ok: true, response, chatTabId: null });
          return;
        }

        // Mirror best-effort (do not block agent response on this)
        const mirrorPromise = (async () => {
          try {
            const chatTabId = await openOrFocusAgntChatTab({ activate: false });
            if (typeof chatTabId !== 'number') return null;
            await waitForTabComplete(chatTabId);

            const payload = {
              type: 'AGNT_EXTENSION_SEND',
              source: 'agnt-browser-agents',
              requestId: msg.requestId || null,
              message,
              agentId,
              agentName,
              bridgeConversationKey,
              bridgeConversationTitle,
              pageContext,
              at: new Date().toISOString(),
            };

            await postMessageIntoAgntChat(chatTabId, payload);
            setTimeout(() => { postMessageIntoAgntChat(chatTabId, payload).catch(() => {}); }, 600);
            return chatTabId;
          } catch {
            return null;
          }
        })();

        // Sidebar response (SSE-streamed; we forward deltas into the side panel so it matches AGNT app behavior)
        const rid = msg.requestId || null;
        const controller = rid ? new AbortController() : null;
        if (rid && controller) abortControllers.set(rid, controller);

        let response;
        try {
          response = await agntAgentChat(
            agentId,
            { message, history, context },
            { requestId: rid, streamToExtension: true, signal: controller?.signal }
          );
        } finally {
          if (rid) abortControllers.delete(rid);
        }

        const chatTabId = await mirrorPromise;
        sendResponse({ ok: true, response, chatTabId });
        return;
      }

      if (msg?.type === 'AGNT_CAPTURE_VISIBLE_TAB') {
        // Capture a screenshot of the visible viewport of the active tab.
        // Note: sidepanel pages don't have sender.tab, so we fall back to getActiveTabId().
        let tabId = msg.tabId ?? sender?.tab?.id;
        if (typeof tabId !== 'number') tabId = await getActiveTabId();
        if (typeof tabId !== 'number') {
          sendResponse({ ok: false, error: 'No active tabId for screenshot capture.' });
          return;
        }

        const tab = await chrome.tabs.get(tabId);
        const windowId = tab?.windowId;
        if (typeof windowId !== 'number') {
          sendResponse({ ok: false, error: 'No windowId for screenshot capture.' });
          return;
        }

        try {
          const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
          sendResponse({ ok: true, dataUrl });
        } catch (e) {
          sendResponse({ ok: false, error: e?.message || String(e) });
        }
        return;
      }

      if (msg?.type === 'AGNT_ABORT_REQUEST') {
        const rid = msg.requestId;
        if (rid) {
          const c = abortControllers.get(rid);
          if (c) {
            c.abort();
            abortControllers.delete(rid);
          }
          sendResponse({ ok: true, aborted: Boolean(c), requestId: rid });
          return;
        }

        // Abort everything
        let n = 0;
        for (const [id, c] of abortControllers.entries()) {
          try { c.abort(); } catch {}
          abortControllers.delete(id);
          n++;
        }
        sendResponse({ ok: true, abortedAll: n });
        return;
      }

      if (msg?.type === 'AGNT_CAPTURE_ACTIVE_TAB') {
        const tabId = msg.tabId ?? await getActiveTabId();
        if (typeof tabId !== 'number') throw new Error('No active tab');
        const res = await chrome.tabs.sendMessage(tabId, { type: 'AGNT_CAPTURE_CONTEXT' });
        sendResponse({ ok: true, tabId, context: res?.context || null });
        return;
      }

      if (msg?.type === 'AGNT_EXEC_ACTIVE_TAB') {
        const tabId = msg.tabId ?? await getActiveTabId();
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
            sendResponse({ ok: false, error: policy?.error || 'Blocked by policy', policy });
            return;
          }
        }

        // Commands that are better handled by the extension (not the page) so they aren't blocked by popup rules.
        if (kind === 'navigate') {
          const url = String(cmd.url || '').trim();
          if (!url) throw new Error('navigate.url is required');
          await chrome.tabs.update(tabId, { url });
          sendResponse({ ok: true, result: 'navigated ' + url, policy });
          return;
        }

        if (kind === 'openTab') {
          const url = String(cmd.url || '').trim();
          if (!url) throw new Error('openTab.url is required');
          const created = await chrome.tabs.create({ url, active: true, openerTabId: tabId });
          sendResponse({ ok: true, result: 'opened tab ' + url, tabId: created?.id, policy });
          return;
        }

        if (kind === 'closeTab') {
          await chrome.tabs.remove(tabId);
          sendResponse({ ok: true, result: 'closed active tab', policy });
          return;
        }

        const res = await chrome.tabs.sendMessage(tabId, { type: 'AGNT_EXEC', command: cmd });
        sendResponse({ ...(res || {}), policy });
        return;
      }

      sendResponse({ ok: true, ignored: true });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e), details: e?.details, status: e?.status });
    }
  })();

  return true;
});
