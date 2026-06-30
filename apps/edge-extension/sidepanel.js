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
  stopRow: document.getElementById('stopRow'),
  stopBtn: document.getElementById('stopBtn')
};

const STATE_KEY = 'agnt_sidepanel_state_v1';

const pending = new Map(); // requestId -> { wrap, body, idx }

let chatLog = []; // persisted
let jarvisMode = true; // persisted
let edgeCopilotMode = false; // persisted
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
        edgeCopilotMode,
        pageContext,
        targetTabId,
        chatLog: chatLog.slice(-200) // keep it light
      }
    }).catch(() => {});
  }, 150);
}

function renderJarvisBtn() {
  if (!els.actBtn) return;

  let label = 'Control: OFF';
  let title = 'When OFF, the agent can chat but BrowserPilot will not execute AGNT_EXEC commands.';
  let cls = 'btnModeOff';

  if (jarvisMode && !edgeCopilotMode) {
    label = 'Jarvis: ON';
    title = 'When ON, the agent can emit AGNT_EXEC commands to operate the current tab.';
    cls = 'btnModeOn';
  }

  if (jarvisMode && edgeCopilotMode) {
    label = 'Edge Copilot: ON';
    title = 'SymTorch-gated execution: commands are evaluated before running.';
    cls = 'btnAccent';
  }

  els.actBtn.textContent = label;
  els.actBtn.title = title;
  els.actBtn.classList.remove('btnModeOn', 'btnModeOff', 'btnAccent');
  els.actBtn.classList.add(cls);
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
  els.msgs.scrollTop = els.msgs.scrollHeight;

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

  els.msgs.scrollTop = els.msgs.scrollHeight;
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

function syncStopUI() {
  const hasPending = pending.size > 0;
  if (els.stopRow) els.stopRow.style.display = hasPending ? 'grid' : 'none';
  if (els.stopBtn) els.stopBtn.disabled = !hasPending;

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

  // Only auto-execute on final frame.
  if (done && jarvisMode) {
    maybeExecuteJarvisFromText(String(content ?? '')).catch(() => {});
  }
}

async function bg(msg) {
  return await chrome.runtime.sendMessage(msg);
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
      'For X.com posting: use navigate to https://x.com/compose/post then use xComposeFocus/xComposeType; then screenshot+attachImage; then click tweetButtonInline.',
      'Screenshot limitation: the extension can capture the visible webpage viewport (not OS-level browser chrome).',
      'Edge Copilot mode: if enabled, your commands will be evaluated by SymTorch policy. Keep risk low and prefer reversible actions.'
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

    const res = await bg({ type: 'AGNT_EXEC_ACTIVE_TAB', tabId: targetTabId, command: cmd, edgeCopilot: edgeCopilotMode, pageContext });
    if (!res?.ok) {
      const pol = res?.policy;
      const polLine = pol ? `\n[policy] ${pol.action || ''} (risk=${pol.risk ?? 'n/a'}, reason=${pol.reason ?? ''})` : '';
      pushMsg('assistant', `[tab] command failed: ${res?.error || 'unknown error'}${polLine}\n${JSON.stringify(cmd)}`);
      return;
    }

    if (edgeCopilotMode && res?.policy?.action) {
      pushMsg('assistant', `[policy] ${res.policy.action} (risk=${res.policy.risk ?? 'n/a'}, reason=${res.policy.reason ?? ''})`);
    }
  }

  pushMsg('assistant', '[tab] done.');
}

async function maybeExecuteJarvisFromText(text) {
  const parsed = extractJSONAfterMarker(text, 'AGNT_EXEC:');
  if (!parsed) return;
  const commands = Array.isArray(parsed) ? parsed : (parsed?.commands || parsed?.agntExec || null);
  if (!Array.isArray(commands) || !commands.length) return;
  await execCommandsOnActiveTab(commands);
}

async function sendMessage(text) {
  if (!selectedAgentId) throw new Error('No agent selected.');

  // User bubble
  pushMsg('user', text);

  // Assistant placeholder bubble: Syncing + glow
  const requestId = newRequestId();
  const ph = pushMsg('assistant', 'Syncing', 'syncing', { requestId, streaming: true });
  pending.set(requestId, ph);
  activeRequestId = requestId;
  setHeaderStatus('syncing');
  syncStopUI();

  const context = { pageContext, jarvisMode, edgeCopilotMode, tabControl: jarvisMode ? tabControlProtocol() : null };

  // This call does TWO things:
  // 1) returns an immediate agent response for the sidebar bubble
  // 2) mirrors the same user message into the real AGNT /chat for persistence + identical UI
  const res = await bg({
    type: 'AGNT_SEND_AND_MIRROR',
    requestId,
    message: text,
    agentId: selectedAgentId,
    agentName: selectedAgentName,
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
}

async function stopCurrent() {
  if (!activeRequestId) return;
  const rid = activeRequestId;

  // Best-effort: ask the background worker to abort the streaming fetch.
  await bg({ type: 'AGNT_ABORT_REQUEST', requestId: rid }).catch(() => {});

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

async function getSuggestions() {
  if (!selectedAgentId) throw new Error('No agent selected.');

  const ctx = pageContext
    ? `page: ${pageContext.page?.title || ''} ${pageContext.page?.url || ''}\nselection: ${(pageContext.selection || '').slice(0, 800)}`
    : (els.input.value || '').slice(0, 800);

  const res = await bg({ type: 'AGNT_SUGGESTIONS', agentId: selectedAgentId, context: ctx });
  if (!res.ok) {
    const detail = res?.details ? `\n\nDetails: ${JSON.stringify(res.details).slice(0, 800)}` : '';
    throw new Error((res.error || 'Suggestions failed') + detail);
  }

  const suggestions = res.data?.suggestions || [];
  pushMsg('assistant', suggestions.length ? ('Suggestions:\n- ' + suggestions.join('\n- ')) : '(no suggestions returned)');
}

async function captureActiveTab() {
  const res = await bg({ type: 'AGNT_CAPTURE_ACTIVE_TAB', tabId: targetTabId });
  if (!res?.ok) throw new Error(res?.error || 'Capture failed');
  pageContext = res.context;
  targetTabId = typeof res.tabId === 'number' ? res.tabId : (pageContext?.browserPilot?.tabId ?? targetTabId);
  renderContextHint();
  queueSaveState();
  pushMsg('assistant', '[context] captured page text + selection (bounded)');
}

async function openAgntChat() {
  const settings = await bg({ type: 'AGNT_GET_SETTINGS' });
  const base = settings?.settings?.agntBaseUrl || 'http://localhost:3333';
  chrome.tabs.create({ url: base.replace(/\/$/, '') + '/chat' });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'AGNT_PAGE_CONTEXT') {
    pageContext = msg.context;
    targetTabId = typeof pageContext?.browserPilot?.tabId === 'number' ? pageContext.browserPilot.tabId : targetTabId;
    renderContextHint();
    queueSaveState();
  }

  // Echo/stream from AGNT /chat back into the sidebar placeholder.
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
  // Cycle: OFF -> Jarvis -> Edge Copilot -> OFF
  if (!jarvisMode) {
    jarvisMode = true;
    edgeCopilotMode = false;
  } else if (jarvisMode && !edgeCopilotMode) {
    edgeCopilotMode = true;
  } else {
    jarvisMode = false;
    edgeCopilotMode = false;
  }
  renderJarvisBtn();
  queueSaveState();
});
els.openAgntBtn.addEventListener('click', () => openAgntChat().catch(e => setError(e.message)));

els.sendBtn.addEventListener('click', () => {
  const text = els.input.value.trim();
  if (!text) return;
  els.input.value = '';
  sendMessage(text).catch(e => setError(e.message));
});

els.suggestBtn.addEventListener('click', () => getSuggestions().catch(e => setError(e.message)));
if (els.stopBtn) els.stopBtn.addEventListener('click', () => stopCurrent().catch(e => setError(e.message)));

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
      edgeCopilotMode = Boolean(saved.edgeCopilotMode);
      pageContext = saved.pageContext || null;
      targetTabId = typeof saved.targetTabId === 'number' ? saved.targetTabId : (pageContext?.browserPilot?.tabId ?? null);
      chatLog = Array.isArray(saved.chatLog) ? saved.chatLog : [];
      rebuildFromChatLog();
      renderContextHint();
    }

    renderJarvisBtn();

    await ensureAndLoadAgents();
    setError(null);
    syncStopUI();

    // Persist when closing the panel.
    window.addEventListener('beforeunload', () => queueSaveState());
  } catch (e) {
    setError(e.message + '\n\nOpen Options → Test connection to validate base URL + token.');
    setHeaderStatus('auth');
  }
})();
