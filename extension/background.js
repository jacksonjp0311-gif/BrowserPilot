// BrowserPilot background service worker (MV3)

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

const TELEMETRY_ENDPOINT = '/api/telemetry/browserpilot';
async function recordTelemetry(eventType, data = {}) {
  try {
    await agntFetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      body: { eventType, adapter: 'legacy', data, ts: new Date().toISOString() }
    });
  } catch {
    // Telemetry is sensory only; it must never break browser control.
  }
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

      if (msg?.type === 'AGNT_OPEN_CHAT_AND_SEND') {
        sendResponse({ ok: true, tabId: null, disabled: true, reason: 'BrowserPilot side-panel chat no longer opens AGNT tabs automatically.' });
        return;
      }

      // Side panel UX: return an immediate agent response without opening AGNT tabs.
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
        await recordTelemetry('chat_send_started', {
          requestId: msg.requestId || null,
          agentId,
          agentName,
          backend: agentBackend,
          historyCount: history.length,
          messageChars: String(message).length,
          hasPageContext: Boolean(pageContext)
        });

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

          await recordTelemetry('chat_response_completed', {
            requestId: rid,
            backend: 'hermes',
            responseChars: String(response || '').length
          });
          sendResponse({ ok: true, response, chatTabId: null });
          return;
        }

        // Direct sidebar response only. Do not open AGNT /chat automatically:
        // tab creation can steal focus in some browsers even when active:false.
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

        await recordTelemetry('chat_response_completed', {
          requestId: rid,
          backend: 'agnt',
          responseChars: String(response || '').length
        });
        sendResponse({ ok: true, response, chatTabId: null, mirrored: false });
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

      if (msg?.type === 'AGNT_EXEC_ACTIVE_TAB') {
        const tabId = msg.tabId ?? await getActiveTabId();
        if (typeof tabId !== 'number') throw new Error('No active tab');

        const cmd = msg.command || {};
        const kind = cmd.kind;

        // Commands that are better handled by the extension (not the page) so they aren't blocked by popup rules.
        if (kind === 'navigate') {
          const url = String(cmd.url || '').trim();
          if (!url) throw new Error('navigate.url is required');
          await chrome.tabs.update(tabId, { url });
          await recordTelemetry('command_executed', { tabId, kind, url });
          sendResponse({ ok: true, result: 'navigated ' + url });
          return;
        }

        if (kind === 'openTab') {
          const url = String(cmd.url || '').trim();
          if (!url) throw new Error('openTab.url is required');
          const created = await chrome.tabs.create({ url, active: true, openerTabId: tabId });
          await recordTelemetry('command_executed', { tabId, kind, url, openedTabId: created?.id });
          sendResponse({ ok: true, result: 'opened tab ' + url, tabId: created?.id });
          return;
        }

        if (kind === 'closeTab') {
          await chrome.tabs.remove(tabId);
          await recordTelemetry('command_executed', { tabId, kind });
          sendResponse({ ok: true, result: 'closed active tab' });
          return;
        }

        const res = await chrome.tabs.sendMessage(tabId, { type: 'AGNT_EXEC', command: cmd });
        await recordTelemetry(res?.ok === false ? 'command_error' : 'command_executed', {
          tabId,
          kind,
          error: res?.ok === false ? res?.error : undefined
        });
        sendResponse(res);
        return;
      }

      if (msg?.type === 'AGNT_TELEMETRY') {
        await recordTelemetry(msg.eventType || 'generic', msg.data || {});
        sendResponse({ ok: true });
        return;
      }

      if (msg?.type === 'AGNT_ANALYZE_TELEMETRY') {
        const data = await agntFetch('/api/telemetry/browserpilot/analyze', {
          method: 'POST',
          body: { limit: msg.limit || 200, context: msg.context || {} }
        });
        sendResponse({ ok: true, data });
        return;
      }

      sendResponse({ ok: true, ignored: true });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e), details: e?.details, status: e?.status });
    }
  })();

  return true;
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
