const baseUrlEl = document.getElementById('baseUrl');
const tokenEl = document.getElementById('token');
const backendEl = document.getElementById('backend');
const hermesBaseUrlEl = document.getElementById('hermesBaseUrl');
const hermesApiKeyEl = document.getElementById('hermesApiKey');
const saveBtn = document.getElementById('saveBtn');
const detectBtn = document.getElementById('detectBtn');
const testBtn = document.getElementById('testBtn');
const statusEl = document.getElementById('status');
const errEl = document.getElementById('err');

// Permissions UI
const permRequestCoreBtn = document.getElementById('permRequestCore');
const permRefreshBtn = document.getElementById('permRefresh');
const permStatusEl = document.getElementById('permStatus');
const permBoxEl = document.getElementById('permBox');

const JARVIS_OPTIONAL_PERMISSIONS = [
  { perm: 'notifications', group: 'operator feedback', risk: 'low', purpose: 'show local Jarvis status and completion alerts' },
  { perm: 'alarms', group: 'operator feedback', risk: 'low', purpose: 'schedule bounded local reminders and expiry checks' },
  { perm: 'clipboardRead', group: 'clipboard', risk: 'medium', purpose: 'read clipboard only after explicit paste/review action' },
  { perm: 'clipboardWrite', group: 'clipboard', risk: 'medium', purpose: 'copy reports, commands, or evidence snippets after user action' },
  { perm: 'downloads', group: 'files', risk: 'medium', purpose: 'export local reports, snapshots, and evidence bundles' },
  { perm: 'pageCapture', group: 'files', risk: 'medium', purpose: 'save approved page snapshots as local artifacts' },
  { perm: 'history', group: 'workflow memory', risk: 'high', purpose: 'explicit recent-page recovery only' },
  { perm: 'topSites', group: 'workflow memory', risk: 'high', purpose: 'optional browser workflow recall surface' },
  { perm: 'sessions', group: 'workflow memory', risk: 'high', purpose: 'recover recently closed tabs/windows after user request' },
  { perm: 'bookmarks', group: 'research trails', risk: 'medium', purpose: 'save or retrieve user-approved evidence trails' },
  { perm: 'tabGroups', group: 'research trails', risk: 'medium', purpose: 'organize investigation tabs into named groups' },
  { perm: 'declarativeNetRequest', group: 'threat lock', risk: 'high', purpose: 'future reversible local block rules', labOnly: true },
  { perm: 'declarativeNetRequestWithHostAccess', group: 'threat lock', risk: 'high', purpose: 'future host-aware local block rules', labOnly: true },
  { perm: 'webRequest', group: 'network evidence', risk: 'high', purpose: 'metadata-only request observation; no content capture' },
  { perm: 'cookies', group: 'sensitive diagnostics', risk: 'very high', purpose: 'redacted login-state diagnostics only; no cookie value extraction' },
  { perm: 'debugger', group: 'browser lab', risk: 'very high', purpose: 'deep inspection only after explicit advanced approval', labOnly: true },
  { perm: 'nativeMessaging', group: 'local bridge', risk: 'very high', purpose: 'future companion-app/sandbox bridge; separate setup required' },
  { perm: 'identity', group: 'account bridge', risk: 'high', purpose: 'future account/login bridge; not needed for local mode' },
  { perm: 'management', group: 'environment diagnostics', risk: 'high', purpose: 'inspect extension environment for support/debug flows' },
  { perm: 'browsingData', group: 'privacy tools', risk: 'high', purpose: 'future explicit cleanup flow for local browser data' },
  { perm: 'contentSettings', group: 'privacy tools', risk: 'high', purpose: 'future explicit site-setting diagnostics and repair prompts' },
  { perm: 'privacy', group: 'privacy tools', risk: 'high', purpose: 'future read-only privacy-setting diagnostics' },
  { perm: 'idle', group: 'operator state', risk: 'medium', purpose: 'detect operator idle state before long-running local flows' },
  { perm: 'unlimitedStorage', group: 'local vault', risk: 'medium', purpose: 'larger local report vaults and evidence archives', labOnly: true },
  { perm: 'desktopCapture', group: 'capture', risk: 'high', purpose: 'explicit screen capture prompt only' },
  { perm: 'tabCapture', group: 'capture', risk: 'high', purpose: 'explicit tab capture prompt only' },
  { perm: 'offscreen', group: 'capture', risk: 'medium', purpose: 'offscreen document support for bounded capture/audio tasks' }
];

function setErr(msg) {
  // Base options error box
  if (!msg) {
    errEl.style.display = 'none';
    errEl.textContent = '';
    return;
  }
  errEl.style.display = 'block';
  errEl.textContent = msg;
}

function setPermBox(msg) {
  if (!permBoxEl) return;
  permBoxEl.textContent = msg || '';
}

async function refreshPermissionsStatus() {
  if (!permStatusEl) return;
  permStatusEl.textContent = 'Checking…';

  const optionalPerms = JARVIS_OPTIONAL_PERMISSIONS.filter((item) => !item.labOnly).map((item) => item.perm);

  const checks = await Promise.all(optionalPerms.map((p) => new Promise((resolve) => {
    chrome.permissions.contains({ permissions: [p] }, (ok) => {
      const error = chrome.runtime.lastError?.message || '';
      resolve({ perm: p, ok: Boolean(ok), error });
    });
  })));

  const hostOk = await new Promise((resolve) => {
    chrome.permissions.contains({ origins: ['<all_urls>'] }, (ok) => resolve(Boolean(ok)));
  });

  const lines = [];
  lines.push('Optional Jarvis permissions:');
  const byPerm = new Map(checks.map((item) => [item.perm, item.ok]));
  let currentGroup = '';
  for (const item of JARVIS_OPTIONAL_PERMISSIONS) {
    if (item.group !== currentGroup) {
      currentGroup = item.group;
      lines.push('');
      lines.push(`${currentGroup}:`);
    }
    const ok = item.labOnly ? false : byPerm.get(item.perm);
    const check = checks.find((entry) => entry.perm === item.perm);
    const mode = item.labOnly ? 'lab manifest only' : 'optional request';
    lines.push(`- ${ok ? '[x]' : '[ ]'} ${item.perm} | ${mode} | ${item.risk} | ${item.purpose}${check?.error ? ` | ${check.error}` : ''}`);
  }
  lines.push('');
  lines.push(`Optional host access (<all_urls>): ${hostOk ? '[x] enabled' : '[ ] not enabled'}`);

  permStatusEl.textContent = 'Ready';
  setPermBox(lines.join('\n'));
}

async function requestJarvisPermissions() {
  setPermBox('Requesting…');
  permStatusEl.textContent = 'Requesting…';

  const permissions = JARVIS_OPTIONAL_PERMISSIONS.filter((item) => !item.labOnly).map((item) => item.perm);

  const ok = await new Promise((resolve) => {
    chrome.permissions.request({ permissions, origins: ['<all_urls>'] }, (granted) => {
      // If the user dismisses, granted is false and lastError is usually empty.
      const error = chrome.runtime.lastError?.message || '';
      if (error) setPermBox(`Request failed: ${error}`);
      resolve(Boolean(granted));
    });
  });

  permStatusEl.textContent = ok ? 'Granted' : 'Not granted';
  await refreshPermissionsStatus();
}

async function load() {
  const { agentBackend, agntBaseUrl, agntToken, hermesBaseUrl, hermesApiKey } = await chrome.storage.sync.get([
    'agentBackend',
    'agntBaseUrl',
    'agntToken',
    'hermesBaseUrl',
    'hermesApiKey'
  ]);
  if (backendEl) backendEl.value = agentBackend || 'agnt';
  baseUrlEl.value = agntBaseUrl || 'http://localhost:3333';
  tokenEl.value = agntToken || '';
  if (hermesBaseUrlEl) hermesBaseUrlEl.value = hermesBaseUrl || 'http://localhost:8642';
  if (hermesApiKeyEl) hermesApiKeyEl.value = hermesApiKey || '';
}

async function save() {
  setErr(null);
  const agentBackend = backendEl?.value || 'agnt';
  const agntBaseUrl = baseUrlEl.value.trim() || 'http://localhost:3333';
  const agntToken = tokenEl.value.trim();
  const hermesBaseUrl = hermesBaseUrlEl?.value.trim() || 'http://localhost:8642';
  const hermesApiKey = hermesApiKeyEl?.value.trim() || '';
  await chrome.storage.sync.set({ agentBackend, agntBaseUrl, agntToken, hermesBaseUrl, hermesApiKey });
  statusEl.textContent = 'Saved.';
  setTimeout(() => (statusEl.textContent = ''), 2000);
}

async function detectFromActiveTab() {
  setErr(null);
  statusEl.textContent = 'Detecting…';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || typeof tab.id !== 'number') throw new Error('No active tab URL');

  const u = new URL(tab.url);
  baseUrlEl.value = u.origin;

  // Best-effort: if the active tab is AGNT (same origin), pull token + selected provider/model
  // from that tab’s localStorage so the extension matches what AGNT is actually using.
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        token: localStorage.getItem('token'),
        selectedProvider: localStorage.getItem('selectedProvider'),
        selectedModel: localStorage.getItem('selectedModel'),
      }),
    });

    if (result?.token) tokenEl.value = result.token;

    statusEl.textContent = 'Detected base URL: ' + u.origin +
      (result?.selectedProvider || result?.selectedModel
        ? ` • provider/model: ${result?.selectedProvider || '?'} / ${result?.selectedModel || '?'}`
        : '');
  } catch {
    statusEl.textContent = 'Detected base URL: ' + u.origin;
  }

  setTimeout(() => (statusEl.textContent = ''), 3500);
}

async function testConnection() {
  setErr(null);
  statusEl.textContent = 'Testing…';

  if ((backendEl?.value || 'agnt') === 'hermes') {
    const base = (hermesBaseUrlEl?.value.trim() || 'http://localhost:8642').replace(/\/$/, '');
    const key = hermesApiKeyEl?.value.trim() || '';
    const res = await fetch(base + '/health', {
      headers: key ? { Authorization: 'Bearer ' + key } : {}
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    statusEl.textContent = 'Done.';
    setTimeout(() => (statusEl.textContent = ''), 2000);
    if (!res.ok) throw new Error(`Hermes health failed: ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
    setErr('OK\nbackend: Hermes\nbase: ' + base);
    return;
  }

  const base = (baseUrlEl.value.trim() || 'http://localhost:3333').replace(/\/$/, '');
  const token = tokenEl.value.trim();

  async function fetchJson(path) {
    const res = await fetch(base + path, {
      headers: token ? { Authorization: 'Bearer ' + token } : {}
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { ok: res.ok, status: res.status, json };
  }

  const health = await fetchJson('/api/health');
  const settings = await fetchJson('/api/users/settings');
  const agents = await fetchJson('/api/agents/');

  statusEl.textContent = 'Done.';
  setTimeout(() => (statusEl.textContent = ''), 2000);

  if (!health.ok) throw new Error(`health failed: ${health.status}`);
  if (!settings.ok) throw new Error(`users/settings failed: ${settings.status} ${JSON.stringify(settings.json).slice(0, 200)}`);
  if (!agents.ok) throw new Error(`agents failed: ${agents.status} ${JSON.stringify(agents.json).slice(0, 200)}`);

  setErr(
    'OK\n' +
    `base: ${base}\n` +
    `provider/model: ${settings.json.selectedProvider} / ${settings.json.selectedModel}\n` +
    `agents: ${(agents.json.agents || []).length}`
  );
}

saveBtn.addEventListener('click', () => save().catch(e => setErr(e.message)));
detectBtn.addEventListener('click', () => detectFromActiveTab().catch(e => setErr(e.message)));
testBtn.addEventListener('click', () => testConnection().catch(e => setErr(e.message)));

if (permRequestCoreBtn) permRequestCoreBtn.addEventListener('click', () => requestJarvisPermissions().catch(e => setPermBox('Error: ' + (e?.message || String(e)))));
if (permRefreshBtn) permRefreshBtn.addEventListener('click', () => refreshPermissionsStatus().catch(() => {}));

load().then(() => refreshPermissionsStatus().catch(() => {}));
