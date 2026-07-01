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

  const optionalPerms = [
    'notifications',
    'downloads',
    'clipboardRead',
    'clipboardWrite',
    'contextMenus',
    'alarms',
    'offscreen',
    'tabCapture'
  ];

  const checks = await Promise.all(optionalPerms.map((p) => new Promise((resolve) => {
    chrome.permissions.contains({ permissions: [p] }, (ok) => resolve({ perm: p, ok: Boolean(ok) }));
  })));

  const hostOk = await new Promise((resolve) => {
    chrome.permissions.contains({ origins: ['<all_urls>'] }, (ok) => resolve(Boolean(ok)));
  });

  const lines = [];
  lines.push('Optional permissions:');
  for (const c of checks) lines.push(`- ${c.ok ? '[x]' : '[ ]'} ${c.perm}`);
  lines.push('');
  lines.push(`Optional host access (<all_urls>): ${hostOk ? '[x] enabled' : '[ ] not enabled'}`);

  permStatusEl.textContent = 'Ready';
  setPermBox(lines.join('\n'));
}

async function requestJarvisPermissions() {
  setPermBox('Requesting…');
  permStatusEl.textContent = 'Requesting…';

  const permissions = [
    'notifications',
    'downloads',
    'clipboardRead',
    'clipboardWrite',
    'contextMenus',
    'alarms',
    'offscreen',
    'tabCapture'
  ];

  const ok = await new Promise((resolve) => {
    chrome.permissions.request({ permissions, origins: ['<all_urls>'] }, (granted) => {
      // If the user dismisses, granted is false and lastError is usually empty.
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
