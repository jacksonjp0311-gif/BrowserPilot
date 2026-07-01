#!/usr/bin/env node

// BrowserPilot Edge Copilot smoke test
// Usage:
//   node ./scripts/smoke-edgecopilot.mjs --base http://localhost:3333 --token <AGNT_TOKEN>
// Or set env:
//   set AGNT_BASE_URL=http://localhost:3333
//   set AGNT_TOKEN=...

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  return args[i + 1] ?? null;
}

const base = (getArg('--base') || process.env.AGNT_BASE_URL || 'http://localhost:3333').replace(/\/$/, '');
const token = getArg('--token') || process.env.AGNT_TOKEN || process.env.AGNT_AUTH_TOKEN || '';
const symtorchRoot = getArg('--symtorch-root') || process.env.SYMTORCH_ROOT || 'C:/Users/jacks/OneDrive/Desktop/SymTorch';

async function fetchJSON(path, opts = {}) {
  const url = base + path;
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;

  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { ok: res.ok, status: res.status, json };
}

function fail(msg, extra) {
  console.error('\n[FAIL]', msg);
  if (extra) console.error(typeof extra === 'string' ? extra : JSON.stringify(extra, null, 2));
  process.exitCode = 1;
}

function ok(msg, extra) {
  console.log('\n[OK]', msg);
  if (extra) console.log(typeof extra === 'string' ? extra : JSON.stringify(extra, null, 2));
}

console.log('BrowserPilot Edge Copilot smoke');
console.log('  base:', base);
console.log('  token:', token ? '(provided)' : '(missing)');
console.log('  symtorchRoot:', symtorchRoot);

// 1) Plugin listing (no-auth endpoint)
const plugins = await fetchJSON('/api/plugins/installed');
if (!plugins.ok) fail('GET /api/plugins/installed failed', plugins);
else ok('plugins installed fetched', { totalPlugins: plugins.json?.stats?.totalPlugins, totalTools: plugins.json?.stats?.totalTools });

// 2) Orchestrator tools should include symtorch-policy-bundle-evaluate
const orch = await fetchJSON('/api/tools/orchestrator-tools');
if (!orch.ok) fail('GET /api/tools/orchestrator-tools failed', orch);

const orchStr = JSON.stringify(orch.json);
const hasSym = /symtorch[-_]policy[-_]bundle[-_]evaluate/i.test(orchStr);
if (!hasSym) {
  fail('orchestrator-tools does not include symtorch-policy-bundle-evaluate. (AGNT plugin tool registry not loaded)', {
    hint: 'Restart AGNT after patching PluginManager.js, then POST /api/plugins/reload',
    toolCount: orch.json?.tools?.length
  });
} else {
  ok('symtorch tool present in orchestrator-tools');
}

// 3) Execute SymTorch policy tool (requires token)
if (!token) {
  fail('No AGNT_TOKEN provided; cannot execute tool.');
} else {
  const bundle = {
    schemaVersion: 'symtorch.policyBundle.v1',
    name: 'BrowserPilot Default Policy',
    version: '2026.06.30',
    rules: 'block(X) :- high_risk(X).\nallow(X) :- not high_risk(X).',
    predicates: [
      { kind: 'threshold', name: 'high_risk', valueKey: 'risk', threshold: 0.7, slope: 10 }
    ],
    metadata: { scenarioId: 'browserpilot-command-gating', source: 'browser-pilot' },
    hash: 'fnv1a32:770f22e5'
  };

  const execRes = await fetchJSON('/api/tools/symtorch-policy-bundle-evaluate/execute', {
    method: 'POST',
    body: JSON.stringify({
      args: {
        symtorchRoot,
        policyBundleJson: JSON.stringify(bundle),
        factsJson: JSON.stringify({ risk: 0.2 }),
        entityId: 'smoke-1',
        threshold: 0.5,
        runAdmission: false
      }
    })
  });

  if (!execRes.ok || execRes.json?.success === false) {
    fail('SymTorch tool execute failed', execRes);
  } else {
    ok('SymTorch tool execute succeeded', execRes.json);
  }
}
