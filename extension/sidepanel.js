const els = {
  agentSearch: document.getElementById('agentSearch'),
  agentList: document.getElementById('agentList'),
  refreshBtn: document.getElementById('refreshBtn'),
  msgs: document.getElementById('msgs'),
  input: document.getElementById('input'),
  sendBtn: document.getElementById('sendBtn'),
  suggestBtn: document.getElementById('suggestBtn'),
  connPill: document.getElementById('connPill'),
  connText: document.getElementById('connText'),
  errorBox: document.getElementById('errorBox'),
  contextHint: document.getElementById('contextHint'),
  captureBtn: document.getElementById('captureBtn'),
  actBtn: document.getElementById('actBtn'),
  openAgntBtn: document.getElementById('openAgntBtn'),
  syncIndicatorBtn: document.getElementById('syncIndicatorBtn'),
  cleanSlateBtn: document.getElementById('cleanSlateBtn'),
  stopRow: document.getElementById('stopRow'),
  stopBtn: document.getElementById('stopBtn')
};

const STATE_KEY = 'agnt_sidepanel_state_v1';
const DEFAULT_BRIDGE_CONVERSATION_KEY = 'browserpilot-edge-tab-operator';

const pending = new Map(); // requestId -> { wrap, body, idx }

let chatLog = []; // persisted
let jarvisMode = true; // persisted
let bridgeConversationKey = DEFAULT_BRIDGE_CONVERSATION_KEY; // persisted
let _saveTimer = null;

let agents = [];
let filteredAgents = [];
let selectedAgentId = '';
let selectedAgentName = '';
let pageContext = null;
let targetTabId = null;
let activeRequestId = null;

function timeLabel(ts = Date.now()) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function queueSaveState() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    chrome.storage.local.set({
      [STATE_KEY]: {
        v: 1,
        jarvisMode,
        pageContext,
        targetTabId,
        bridgeConversationKey,
        chatLog: chatLog.slice(-200) // keep it light
      }
    }).catch(() => {});
  }, 150);
}

function renderJarvisBtn() {
  if (!els.actBtn) return;
  els.actBtn.textContent = jarvisMode ? 'Jarvis: ON' : 'Jarvis: OFF';
  els.actBtn.classList.toggle('btnModeOn', jarvisMode);
  els.actBtn.classList.toggle('btnModeOff', !jarvisMode);
}

function setError(msg) {
  if (!msg) {
    els.errorBox.style.display = 'none';
    els.errorBox.textContent = '';
    return;
  }
  els.errorBox.style.display = 'block';
  els.errorBox.textContent = msg;
}

function scrollMessagesToBottom() {
  const scroll = () => {
    const last = els.msgs?.lastElementChild;
    if (last?.scrollIntoView) {
      last.scrollIntoView({ block: 'end', inline: 'nearest' });
    } else if (els.msgs) {
      els.msgs.scrollTop = els.msgs.scrollHeight;
    }
  };
  requestAnimationFrame(scroll);
  setTimeout(scroll, 80);
}

function pushMsg(role, content, extraClass = '', metaInfo = {}) {
  const item = {
    id: metaInfo.id || `m-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content: String(content ?? ''),
    at: typeof metaInfo.at === 'number' ? metaInfo.at : Date.now(),
    extraClass: extraClass || '',
    requestId: metaInfo.requestId || null,
    streaming: Boolean(metaInfo.streaming)
  };

  chatLog.push(item);
  const idx = chatLog.length - 1;

  const wrap = document.createElement('div');
  wrap.className = 'msg ' + role + (extraClass ? ' ' + extraClass : '');

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = `<span>${role === 'user' ? 'you' : 'agent'}</span><span>${timeLabel(item.at)}</span>`;

  const body = document.createElement('div');
  body.textContent = content;

  wrap.dataset.idx = String(idx);

  wrap.appendChild(meta);
  wrap.appendChild(body);
  els.msgs.appendChild(wrap);
  scrollMessagesToBottom();

  queueSaveState();
  return { wrap, body, idx };
}

function rebuildFromChatLog() {
  els.msgs.innerHTML = '';
  pending.clear();

  // Render and mark any streaming messages as interrupted (side panel close kills streams)
  chatLog = (chatLog || []).slice(-200);
  for (let i = 0; i < chatLog.length; i++) {
    const m = chatLog[i];
    const extra = m.extraClass || '';
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + m.role + (extra ? ' ' + extra : '');

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<span>${m.role === 'user' ? 'you' : 'agent'}</span><span>${timeLabel(m.at)}</span>`;

    const body = document.createElement('div');
    let content = String(m.content || '');
    if (m.streaming) content = (content || 'Syncing') + "\n\n[interrupted]";
    body.textContent = content;

    wrap.dataset.idx = String(i);
    wrap.appendChild(meta);
    wrap.appendChild(body);
    els.msgs.appendChild(wrap);

    if (m.streaming) {
      m.streaming = false;
      m.extraClass = '';
    }
  }

  scrollMessagesToBottom();
  queueSaveState();
}

function setHeaderStatus(mode) {
  // mode: 'linked' | 'syncing' | 'auth' | 'idle'
  els.connPill.classList.remove('linked', 'syncing');    if (mode === 'linked') {
    els.connPill.classList.add('linked');
    if (els.connText) els.connText.textContent = 'interlinked';
  } else if (mode === 'syncing') {
    els.connPill.classList.add('syncing');
    if (els.connText) els.connText.textContent = 'syncing';

  } else if (mode === 'auth') {
    if (els.connText) els.connText.textContent = 'auth needed';
  } else {
    if (els.connText) els.connText.textContent = 'ready';
  }
}

function setCommunicationState(active) {
  if (!els.syncIndicatorBtn) return;
  els.syncIndicatorBtn.textContent = active ? 'Backend live' : 'Backend idle';
  els.syncIndicatorBtn.classList.toggle('communicating', Boolean(active));
}

function syncStopUI() {
  const hasPending = pending.size > 0;
  if (els.stopRow) els.stopRow.style.display = 'grid';
  if (els.stopBtn) els.stopBtn.disabled = !hasPending;
  setCommunicationState(hasPending);

  if (!hasPending) {
    activeRequestId = null;
    return;
  }

  // If active was cleared, pick the most recent pending request.
  if (!activeRequestId || !pending.has(activeRequestId)) {
    activeRequestId = Array.from(pending.keys()).slice(-1)[0] || null;
  }
}

function updatePending(requestId, content, done = false) {
  const entry = pending.get(requestId);
  if (!entry) return;
  entry.body.textContent = content;

  if (typeof entry.idx === 'number' && chatLog[entry.idx]) {
    chatLog[entry.idx].content = String(content ?? '');
    chatLog[entry.idx].streaming = !done;
  }
  if (done) {
    entry.wrap.classList.remove('syncing');
    if (typeof entry.idx === 'number' && chatLog[entry.idx]) {
      chatLog[entry.idx].streaming = false;
      chatLog[entry.idx].extraClass = '';
    }
    pending.delete(requestId);
  }

  queueSaveState();
  syncStopUI();
  scrollMessagesToBottom();

  // Only auto-execute on final frame.
  if (done && jarvisMode) {
    maybeExecuteJarvisFromText(String(content ?? '')).catch(() => {});
  }
}

async function bg(msg) {
  return await chrome.runtime.sendMessage(msg);
}

function pageContextStats(ctx = pageContext) {
  return {
    tabId: targetTabId,
    url: ctx?.page?.url || '',
    title: ctx?.page?.title || '',
    selectionChars: String(ctx?.selection || '').length,
    pageTextChars: String(ctx?.pageText || '').length
  };
}

async function telemetry(eventType, data = {}) {
  await bg({
    type: 'AGNT_TELEMETRY',
    eventType,
    data: {
      surface: 'sidepanel',
      agentId: selectedAgentId || null,
      agentName: selectedAgentName || null,
      jarvisMode,
      ...data
    }
  }).catch(() => {});
}

function renderContextHint() {
  if (!pageContext) return;
  const url = pageContext?.page?.url || '';
  const sel = pageContext?.selection || '';
  const hasText = !!(pageContext?.pageText || '').trim();
  els.contextHint.textContent = `Context: ${url}${sel ? ` • selection: ${sel.slice(0, 60)}${sel.length > 60 ? '…' : ''}` : ''}${hasText ? ' • page text captured' : ''}`;
}

function openList() { els.agentList.classList.add('open'); }
function closeList() { els.agentList.classList.remove('open'); }

function setSelectedAgent(agent) {
  selectedAgentId = agent?.id || '';
  selectedAgentName = agent?.name || '';
  els.agentSearch.value = agent ? agent.name : '';
  bg({ type: 'AGNT_SET_SETTINGS', settings: { selectedAgentId } }).catch(() => {});
  closeList();
}

function renderAgentList() {
  const q = (els.agentSearch.value || '').trim().toLowerCase();
  filteredAgents = !q
    ? agents.slice(0, 200)
    : agents.filter(a => {
        const hay = `${a.name || ''} ${a.description || ''} ${a.provider || ''} ${a.model || ''}`.toLowerCase();
        return hay.includes(q);
      }).slice(0, 200);

  els.agentList.innerHTML = '';

  if (!filteredAgents.length) {
    const empty = document.createElement('div');
    empty.className = 'comboEmpty';
    empty.textContent = agents.length ? 'No matches' : 'No agents yet — creating a default agent…';
    els.agentList.appendChild(empty);
    return;
  }

  for (const a of filteredAgents) {
    const item = document.createElement('div');
    item.className = 'comboItem';

    const title = document.createElement('div');
    title.className = 'comboItemTitle';
    title.textContent = a.name || '(unnamed agent)';

    const sub = document.createElement('div');
    sub.className = 'comboItemSub';
    const pm = `${a.provider || ''} ${a.model || ''}`.trim();
    sub.textContent = (a.description || pm || '').slice(0, 110);

    item.appendChild(title);
    item.appendChild(sub);

    item.addEventListener('click', () => setSelectedAgent(a));
    els.agentList.appendChild(item);
  }
}

async function ensureAndLoadAgents() {
  setError(null);
  if (els.connText) els.connText.textContent = 'connecting…';

  const res = await bg({ type: 'AGNT_ENSURE_DEFAULT_AGENT' });
  if (!res?.ok) {
    const detail = res?.details ? `\n\nDetails: ${JSON.stringify(res.details).slice(0, 800)}` : '';
    throw new Error((res?.error || 'Failed to load agents') + detail);
  }

  agents = res.agents || [];

  const s = await bg({ type: 'AGNT_GET_SETTINGS' });
  const saved = s?.settings?.selectedAgentId;
  const foundSaved = saved && agents.some(a => a.id === saved);

  const desiredName = 'Edge Tab Operator';
  const preferred = agents.find(a => a?.name === desiredName);

  let selected = foundSaved ? agents.find(a => a.id === saved) : (preferred || agents[0]);

  // HARD GUARD: if the saved/selected agent is capable of launching Playwright automation
  // (ai-browser-use / ai_browser_use), ignore it and fall back to the safe tab-driving agent.
  const dangerous = new Set(['ai-browser-use', 'ai_browser_use']);
  const selTools = Array.isArray(selected?.assignedTools) ? selected.assignedTools : [];
  const isDangerous = selTools.some(t => dangerous.has(String(t)));

  if (isDangerous) {
    selected = preferred || agents.find(a => a?.name === desiredName) || agents[0];
    // Persist the safe selection so it doesn't keep re-selecting the dangerous agent.
    await bg({ type: 'AGNT_SET_SETTINGS', settings: { selectedAgentId: selected?.id || '' } }).catch(() => {});
    pushMsg('assistant', `[safety] Your saved agent could launch automation browsers (ai-browser-use). Switched to "${selected?.name || 'Edge Tab Operator'}" to keep everything in the current Edge tab.`);
  }

  setSelectedAgent(selected);

  renderAgentList();
  setHeaderStatus(agents.length ? 'linked' : 'idle');

  if (res.created) pushMsg('assistant', '[setup] Created a default agent so the browser panel is seamless.');
}

function newRequestId() {
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function tabControlProtocol() {
  return {
    marker: 'AGNT_EXEC:',
    commands: [
      { kind: 'navigate', url: 'https://x.com/compose/post' },
      { kind: 'domAudit', includeResources: true },
      { kind: 'xComposeFocus' },
      { kind: 'xComposeType', text: 'Hello from Edge Tab Operator' },
      { kind: 'screenshot', mode: 'viewport', storeAs: 'lastScreenshot' },
      { kind: 'attachImage', css: 'input[type="file"]', dataUrl: '$lastScreenshot', filename: 'edge.png' },
      { kind: 'click', css: 'button[data-testid="tweetButtonInline"], div[data-testid="tweetButtonInline"]' },
      { kind: 'wait', ms: 750 }
    ],
    rules: [
      'If you want to control the ACTIVE TAB, output exactly ONE line that starts with AGNT_EXEC: followed by valid JSON.',
      'The JSON must be an array of command objects. Do NOT wrap JSON in backticks.',
      'Prefer kind="navigate" (same tab) unless the user explicitly asks for a new tab.',
      'For "probe current page" or browser diagnostics, use kind="domAudit"; this is diagnostic only and must not bypass challenges or extract cookies/tokens.',
      'For X.com posting: use navigate to https://x.com/compose/post then use xComposeFocus/xComposeType; then screenshot+attachImage; then click tweetButtonInline.',
      'Screenshot limitation: the extension can capture the visible webpage viewport (not OS-level browser chrome).'
    ]
  };
}

function extractJSONAfterMarker(text, marker = 'AGNT_EXEC:') {
  const idx = text.indexOf(marker);
  if (idx === -1) return null;
  const tail = text.slice(idx + marker.length).trim();
  if (!tail) return null;

  // Find first '[' or '{'
  const start = Math.min(
    ...[tail.indexOf('['), tail.indexOf('{')].filter(n => n >= 0)
  );
  if (!Number.isFinite(start) || start < 0) return null;

  const s = tail.slice(start);
  const open = s[0];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === open) depth++;
    if (ch === close) {
      depth--;
      if (depth === 0) {
        const jsonText = s.slice(0, i + 1);
        try { return JSON.parse(jsonText); } catch { return null; }
      }
    }
  }
  return null;
}

async function execCommandsOnActiveTab(commands) {
  if (!Array.isArray(commands) || !commands.length) return;

  pushMsg('assistant', `[tab] executing ${commands.length} command(s)…`);

  const vars = { lastScreenshot: null };

  for (const rawCmd of commands) {
    if (!rawCmd || typeof rawCmd !== 'object') continue;

    // Shallow variable substitution (e.g. dataUrl: "$lastScreenshot")
    const cmd = JSON.parse(JSON.stringify(rawCmd));
    if (cmd.dataUrl === '$lastScreenshot') cmd.dataUrl = vars.lastScreenshot;

    if (cmd.kind === 'wait') {
      const ms = Math.max(0, Number(cmd.ms || 0));
      await new Promise(r => setTimeout(r, ms));
      continue;
    }

    if (cmd.kind === 'screenshot') {
      // mode 'window' is treated as viewport (browser chrome cannot be captured by extensions)
      const cap = await bg({ type: 'AGNT_CAPTURE_VISIBLE_TAB', tabId: targetTabId }).catch(e => ({ ok: false, error: e?.message }));
      if (!cap?.ok || !cap?.dataUrl) {
        pushMsg('assistant', `[tab] screenshot failed: ${cap?.error || 'unknown error'}`);
        return;
      }
      vars.lastScreenshot = cap.dataUrl;
      pushMsg('assistant', '[tab] screenshot captured (viewport).');
      continue;
    }

    const res = await bg({ type: 'AGNT_EXEC_ACTIVE_TAB', tabId: targetTabId, command: cmd });
    if (!res?.ok) {
      pushMsg('assistant', `[tab] command failed: ${res?.error || 'unknown error'}\n${JSON.stringify(cmd)}`);
      return;
    }
  }

  pushMsg('assistant', '[tab] done.');
}

async function maybeExecuteJarvisFromText(text) {
  const parsed = extractJSONAfterMarker(text, 'AGNT_EXEC:');
  if (!parsed) return;
  const commands = Array.isArray(parsed) ? parsed : (parsed?.commands || parsed?.agntExec || null);
  if (!Array.isArray(commands) || !commands.length) return;
  await telemetry('command_batch_detected', {
    commandCount: commands.length,
    commandKinds: commands.map((cmd) => String(cmd?.kind || 'unknown')).slice(0, 25)
  });
  await execCommandsOnActiveTab(commands);
}

async function sendMessage(text) {
  if (!selectedAgentId) throw new Error('No agent selected.');

  const history = chatLog
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && !m.streaming)
    .map((m) => ({ role: m.role, content: String(m.content || '') }))
    .slice(-40);

  // User bubble
  pushMsg('user', text);

  // Assistant placeholder bubble: Syncing + glow
  const requestId = newRequestId();
  const ph = pushMsg('assistant', 'Syncing', 'syncing', { requestId, streaming: true });
  pending.set(requestId, ph);
  activeRequestId = requestId;
  setHeaderStatus('syncing');
  syncStopUI();

  const context = { pageContext, jarvisMode, tabControl: jarvisMode ? tabControlProtocol() : null };
  const startedAt = Date.now();
  await telemetry('sidepanel_chat_send', {
    requestId,
    messageChars: String(text || '').length,
    historyCount: history.length,
    hasPageContext: Boolean(pageContext),
    ...pageContextStats()
  });

  // Side-panel chat call:
  // - returns an immediate agent response for the sidebar bubble
  // - does NOT open/focus any AGNT /chat tabs
  const res = await bg({
    type: 'AGNT_SEND_AND_MIRROR',
    requestId,
    message: text,
    history,
    agentId: selectedAgentId,
    agentName: selectedAgentName,
    bridgeConversationKey,
    bridgeConversationTitle: 'BrowserPilot - Edge Tab Operator',
    context,
    pageContext,
  });

  if (!res?.ok) {
    setHeaderStatus('linked');
    const detail = res?.details ? `\n\nDetails: ${JSON.stringify(res.details).slice(0, 800)}` : '';
    updatePending(requestId, 'Sync failed' + detail, true);
    return;
  }

  const responseText = (typeof res.response === 'string')
    ? res.response
    : JSON.stringify(res.response, null, 2);

  setHeaderStatus('linked');
  updatePending(requestId, responseText, true);
  await telemetry('sidepanel_chat_done', {
    requestId,
    durationMs: Date.now() - startedAt,
    responseChars: responseText.length
  });
}

async function stopCurrent() {
  if (!activeRequestId) return;
  const rid = activeRequestId;

  // Best-effort: ask the background worker to abort the streaming fetch.
  await bg({ type: 'AGNT_ABORT_REQUEST', requestId: rid }).catch(() => {});
  await telemetry('sidepanel_stop_requested', { requestId: rid });

  // Immediate UX: mark the bubble as stopped (background may still emit a final frame).
  const entry = pending.get(rid);
  if (entry) {
    const current = entry.body.textContent || '';
    const suffix = current.trim().length ? "\n\n[stopped]" : "[stopped]";
    updatePending(rid, current + suffix, true);
  }

  setHeaderStatus('linked');
  syncStopUI();
}

async function analyzeTelemetry() {
  const context = {
    page: pageContextStats(),
    agentId: selectedAgentId || null,
    agentName: selectedAgentName || null,
    jarvisMode,
  };
  await telemetry('telemetry_analysis_requested', context);
  const res = await bg({ type: 'AGNT_ANALYZE_TELEMETRY', limit: 250, context });
  if (!res?.ok) {
    const detail = res?.details ? `\n\nDetails: ${JSON.stringify(res.details).slice(0, 800)}` : '';
    throw new Error((res?.error || 'Telemetry analysis failed') + detail);
  }
  const analysis = res.data?.analysis || {};
  const summary = analysis.summary || {};
  const graphStats = analysis.graphStats || {};
  const topCommands = (analysis.topCommands || []).map(([name, count]) => `${name} (${count})`).join(', ') || 'none yet';
  const topEvents = (analysis.topEvents || []).map(([name, count]) => `${name} (${count})`).join(', ') || 'none yet';
  const hints = (analysis.toolHints || []).length ? ('\nTool hints:\n- ' + analysis.toolHints.join('\n- ')) : '';
  pushMsg('assistant', [
    '[telemetry] graph updated',
    `Events: ${summary.windowSize || 0} | nodes: ${graphStats.nodes || 0} | edges: ${graphStats.edges || 0}`,
    `Top events: ${topEvents}`,
    `Top commands: ${topCommands}`,
    summary.lastTab?.url ? `Last tab: ${summary.lastTab.url}` : '',
    hints
  ].filter(Boolean).join('\n'));
}

async function captureActiveTab() {
  const res = await bg({ type: 'AGNT_CAPTURE_ACTIVE_TAB', tabId: targetTabId });
  if (!res?.ok) throw new Error(res?.error || 'Capture failed');
  pageContext = res.context;
  targetTabId = typeof res.tabId === 'number' ? res.tabId : (pageContext?.browserPilot?.tabId ?? targetTabId);
  renderContextHint();
  queueSaveState();
  pushMsg('assistant', '[context] captured page text + selection (bounded)');
  await telemetry('sidepanel_context_captured', pageContextStats());
}

async function openAgntChat() {
  // Sidepanel-only mode:
  // - Never open/focus/create any AGNT (/chat) tabs
  // - Conversation persistence is handled via backend API/session keys
  // If you want a detached AGNT UI, open it manually in a normal tab/window.
  try {
    pushMsg('assistant', '[ui] "Open AGNT Chat" is disabled in side-panel mode — no tab will be opened.');
  } catch {}
  try {
    await telemetry('open_agnt_chat_disabled', { reason: "sidepanel_only" });
  } catch {}
}

function cleanSlate() {
  for (const requestId of pending.keys()) {
    bg({ type: 'AGNT_ABORT_REQUEST', requestId }).catch(() => {});
  }
  pending.clear();
  activeRequestId = null;
  chatLog = [];
  bridgeConversationKey = `${DEFAULT_BRIDGE_CONVERSATION_KEY}-${Date.now()}`;
  rebuildFromChatLog();
  setHeaderStatus(agents.length ? 'linked' : 'idle');
  syncStopUI();
  queueSaveState();
  telemetry('sidepanel_clean_slate', { bridgeConversationKey }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'AGNT_PAGE_CONTEXT') {
    pageContext = msg.context;
    targetTabId = typeof pageContext?.browserPilot?.tabId === 'number' ? pageContext.browserPilot.tabId : targetTabId;
    renderContextHint();
    queueSaveState();
  }

  // Echo/stream from AGNT agent chat (SSE) back into the sidebar placeholder.
  // Background will send {done:false} updates during SSE streaming, and a final {done:true}.
  if (msg?.type === 'AGNT_EXTENSION_RESPONSE') {
    const { requestId, content, error, done } = msg;
    if (!requestId) return;

    if (error) {
      setHeaderStatus('linked');
      updatePending(requestId, `Sync failed: ${error}`, true);
      return;
    }

    if (typeof content === 'string') {
      if (done) setHeaderStatus('linked');
      else setHeaderStatus('syncing');
      updatePending(requestId, content, Boolean(done));
    }
  }
});

els.refreshBtn.addEventListener('click', () => ensureAndLoadAgents().catch(e => setError(e.message)));
els.captureBtn.addEventListener('click', () => captureActiveTab().catch(e => setError(e.message)));
if (els.actBtn) els.actBtn.addEventListener('click', () => {
  jarvisMode = !jarvisMode;
  renderJarvisBtn();
  queueSaveState();
  telemetry('sidepanel_control_mode_changed', { mode: jarvisMode ? 'jarvis' : 'off' }).catch(() => {});
});
els.openAgntBtn.addEventListener('click', () => openAgntChat().catch(e => setError(e.message)));

els.sendBtn.addEventListener('click', () => {
  const text = els.input.value.trim();
  if (!text) return;
  els.input.value = '';
  sendMessage(text).catch(e => setError(e.message));
});

els.suggestBtn.addEventListener('click', () => analyzeTelemetry().catch(e => setError(e.message)));
if (els.stopBtn) els.stopBtn.addEventListener('click', () => stopCurrent().catch(e => setError(e.message)));
if (els.cleanSlateBtn) els.cleanSlateBtn.addEventListener('click', () => cleanSlate());

els.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); els.sendBtn.click(); }
});

els.agentSearch.addEventListener('focus', () => { openList(); renderAgentList(); });
els.agentSearch.addEventListener('input', () => { openList(); renderAgentList(); });
document.addEventListener('click', (e) => { if (!e.target.closest('.combo')) closeList(); });

(async function init() {
  try {
    const st = await chrome.storage.local.get(STATE_KEY).catch(() => ({}));
    const saved = st?.[STATE_KEY];
    if (saved) {
      jarvisMode = saved.jarvisMode !== false;
      pageContext = saved.pageContext || null;
      targetTabId = typeof saved.targetTabId === 'number' ? saved.targetTabId : (pageContext?.browserPilot?.tabId ?? null);
      bridgeConversationKey = saved.bridgeConversationKey || DEFAULT_BRIDGE_CONVERSATION_KEY;
      chatLog = Array.isArray(saved.chatLog) ? saved.chatLog : [];
      rebuildFromChatLog();
      renderContextHint();
    }

    renderJarvisBtn();

    await ensureAndLoadAgents();
    setError(null);
    syncStopUI();
    telemetry('sidepanel_ready', { restoredMessages: chatLog.length, ...pageContextStats() }).catch(() => {});

    // Persist when closing the panel.
    window.addEventListener('beforeunload', () => queueSaveState());
  } catch (e) {
    setError(e.message + '\n\nOpen Options → Test connection to validate base URL + token.');
    setHeaderStatus('auth');
  }
})();
