import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  ['legacy', path.join(root, 'extension')],
  ['edge', path.join(root, 'apps', 'edge-extension')],
  ['chrome', path.join(root, 'apps', 'chrome-extension')],
];

const requiredFiles = [
  'background.js',
  'contentScript.js',
  'manifest.json',
  'options.html',
  'options.js',
  'sidepanel.html',
  'sidepanel.js',
];

for (const [label, extensionDir] of targets) {
  const manifestPath = path.join(extensionDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  for (const file of requiredFiles) {
    const full = path.join(extensionDir, file);
    if (!fs.existsSync(full)) {
      throw new Error(`[${label}] Missing extension file: ${file}`);
    }
  }

  const backgroundText = fs.readFileSync(path.join(extensionDir, 'background.js'), 'utf8');
  if (backgroundText.includes('./policyBundles.js')) {
    const policyBundlePath = path.join(extensionDir, 'policyBundles.js');
    if (!fs.existsSync(policyBundlePath)) {
      throw new Error(`[${label}] background.js imports policyBundles.js, but the file is missing`);
    }
  }

  const iconRefs = [
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}).filter((v) => typeof v === 'string')
  ];
  for (const rel of iconRefs) {
    const iconPath = path.join(extensionDir, rel);
    if (!fs.existsSync(iconPath)) {
      throw new Error(`[${label}] manifest references missing icon: ${rel}`);
    }
  }


  // --- Runtime sanity checks (lightweight) ---
  // Structural checks can pass while the panel is runtime-broken (missing helpers).
  const sidepanelText = fs.readFileSync(path.join(extensionDir, 'sidepanel.js'), 'utf8');
  const sidepanelHtml = fs.readFileSync(path.join(extensionDir, 'sidepanel.html'), 'utf8');
  const contentText = fs.readFileSync(path.join(extensionDir, 'contentScript.js'), 'utf8');
  const requiredSnippets = [
    'function setError',
    'function pushMsg',
    'function setSelectedAgent',
    'function normalizeAgentList',
    'async function bg',
    'function rebuildFromChatLog'
  ];
  if (label === 'edge' || label === 'chrome') {
    requiredSnippets.push('async function startThreatScan', 'function extractIpIndicatorsFromText');
  }
  const missing = requiredSnippets.filter((s) => !sidepanelText.includes(s));
  if (missing.length) {
    throw new Error('[' + label + '] sidepanel.js is missing helper(s): ' + missing.join(', '));
  }

  if ((label === 'edge' || label === 'chrome') && !sidepanelHtml.includes('id="threatScanBtn"') && !sidepanelHtml.includes('Threat Scan')) {
    throw new Error(`[${label}] sidepanel.html must expose Threat Scan`);
  }
  if ((label === 'edge' || label === 'chrome') && !sidepanelHtml.includes('id="extractIpBtn"')) {
    throw new Error(`[${label}] sidepanel.html must expose Extract IP Address`);
  }
  if ((label === 'edge' || label === 'chrome') && !contentText.includes('BROWSERPILOT_START_THREAT_SCAN')) {
    throw new Error(`[${label}] contentScript.js must handle BROWSERPILOT_START_THREAT_SCAN`);
  }
  if ((label === 'edge' || label === 'chrome') && (!contentText.includes('Open Threat Screens') || !contentText.includes('function renderThreatEvidenceCards'))) {
    throw new Error(`[${label}] contentScript.js must expose Threat Screens evidence HUD`);
  }
  if ((label === 'edge' || label === 'chrome') && (!contentText.includes('function renderThreatTimeline') || !contentText.includes('data-action="filter-threats"'))) {
    throw new Error(`[${label}] contentScript.js must expose Threat Timeline filters`);
  }
  if ((label === 'edge' || label === 'chrome') && (!contentText.includes('data-action="report-chat"') || !sidepanelText.includes('function reportThreatToChat'))) {
    throw new Error(`[${label}] extension must expose Threat Report to Chat flow`);
  }
  if ((label === 'edge' || label === 'chrome') && (contentText.includes('setInterval(mountFab, 2000)') || contentText.includes('subtree: true'))) {
    throw new Error(`[${label}] contentScript.js must not use unbounded FAB remount loops or full-subtree observers`);
  }
  if ((label === 'edge' || label === 'chrome') && (!contentText.includes('THREAT_SCAN_BUDGET') || !contentText.includes('nodesScanned') || !contentText.includes('scan_budget_exceeded'))) {
    throw new Error(`[${label}] contentScript.js must expose Threat Scan budgets and partial-result metadata`);
  }
  if ((label === 'edge' || label === 'chrome') && (!contentText.includes('category_capped_correlation_v1') || !contentText.includes('categoryCaps') || !contentText.includes('correlationBonus'))) {
    throw new Error(`[${label}] contentScript.js must use category-capped correlation threat scoring`);
  }
  if ((label === 'edge' || label === 'chrome') && (!contentText.includes('contextMode') || !contentText.includes('noPageCaptureInMinimalMode') || !sidepanelText.includes('threatScanContextMode') || !sidepanelHtml.includes('id="threatScanContextMode"'))) {
    throw new Error(`[${label}] Threat Scan must expose privacy context modes`);
  }
  if ((label === 'edge' || label === 'chrome') && (!sidepanelText.includes('trustedSidePanelConfirm') || sidepanelText.includes('threatLockActive = false;\n    queueSaveState();\n    pushMsg'))) {
    throw new Error(`[${label}] sidepanel.js must preserve trusted confirmation and avoid blind Threat Lock unlock`);
  }
  if ((label === 'edge' || label === 'chrome') && (!sidepanelText.includes('observedIps: []') || !sidepanelText.includes('resolvedIps: []') || !sidepanelText.includes('noNetwork: true') || !sidepanelText.includes('isValidIpv6Candidate'))) {
    throw new Error(`[${label}] Extract IP must separate extracted/observed/resolved IPs and guarantee no-network local parsing`);
  }
  if ((label === 'edge' || label === 'chrome') && (!contentText.includes('CONTEXT_RADAR_BUDGET') || !contentText.includes('candidatesScanned'))) {
    throw new Error(`[${label}] contentScript.js must expose Context Radar budgets`);
  }
  if ((label === 'edge' || label === 'chrome') && (!contentText.includes('BROWSERPILOT_STOP_PAGE_TOOLS') || !sidepanelHtml.includes('id="stopPageToolsBtn"'))) {
    throw new Error(`[${label}] extension must expose Stop All Page Tools`);
  }
  if ((label === 'edge' || label === 'chrome') && !backgroundText.includes('BROWSERPILOT_START_THREAT_SCAN')) {
    throw new Error(`[${label}] background.js must route BROWSERPILOT_START_THREAT_SCAN`);
  }
  if (!backgroundText.includes('function normalizeAgentList') || !backgroundText.includes('agents: normalizeAgentList')) {
    throw new Error(`[${label}] background.js must normalize AGNT agent list responses`);
  }
  if ((label === 'edge' || label === 'chrome') && (!backgroundText.includes('BROWSERPILOT_RUN_THREAT_REVIEW') || !backgroundText.includes('runThreatReviewSandbox') || !backgroundText.includes('THREAT_REVIEW_HELPER_URL'))) {
    throw new Error(`[${label}] background.js must route real Threat Review Sandbox requests`);
  }
  if ((label === 'edge' || label === 'chrome') && (!backgroundText.includes('shouldBlockCommandByThreatState') || !backgroundText.includes('validateAgntExecCommand'))) {
    throw new Error(`[${label}] background.js must enforce Threat Lock and AGNT_EXEC schema validation`);
  }
  if (!sidepanelText.includes('LOCAL_DEFAULT_AGENT_ID') || !sidepanelText.includes('makeLocalDefaultAgent')) {
    throw new Error(`[${label}] sidepanel.js must expose the local default agent fallback`);
  }
  if ((label === 'edge' || label === 'chrome') && (!sidepanelText.includes('buildThreatReviewRequest') || !sidepanelText.includes('renderThreatReviewResult') || !sidepanelText.includes('appendLedgerEvent') || !sidepanelText.includes('browserpilot_evidence_ledger_v1'))) {
    throw new Error(`[${label}] sidepanel.js must ingest sandbox verdicts and ledger events`);
  }

  if (manifest.manifest_version !== 3) {
    throw new Error(`[${label}] manifest_version must be 3`);
  }

  if (!manifest.background?.service_worker) {
    throw new Error(`[${label}] Missing background.service_worker`);
  }

  if (!manifest.side_panel?.default_path) {
    throw new Error(`[${label}] Missing side_panel.default_path`);
  }

  const requiredOptionalPermissions = [
    'history',
    'bookmarks',
    'cookies',
    'webRequest',
    'nativeMessaging',
    'identity',
    'sessions',
    'topSites',
    'tabGroups',
    'browsingData',
    'contentSettings',
    'privacy',
    'desktopCapture',
    'pageCapture',
    'idle'
  ];
  const optionalPermissions = new Set(manifest.optional_permissions || []);
  const missingOptionalPermissions = requiredOptionalPermissions.filter((perm) => !optionalPermissions.has(perm));
  if ((label === 'edge' || label === 'chrome') && missingOptionalPermissions.length) {
    throw new Error(`[${label}] manifest missing Jarvis optional permissions: ${missingOptionalPermissions.join(', ')}`);
  }
  const requiredPermissions = new Set(manifest.permissions || []);
  const invalidOptionalPermissions = ['unlimitedStorage'];
  const presentInvalidOptionalPermissions = invalidOptionalPermissions.filter((perm) => optionalPermissions.has(perm));
  if ((label === 'edge' || label === 'chrome') && presentInvalidOptionalPermissions.length) {
    throw new Error(`[${label}] default manifest must not list invalid optional permissions: ${presentInvalidOptionalPermissions.join(', ')}`);
  }
  const labOnlyPermissions = ['debugger', 'declarativeNetRequest', 'declarativeNetRequestWithHostAccess', 'unlimitedStorage'];
  const presentLabOnlyPermissions = labOnlyPermissions.filter((perm) => requiredPermissions.has(perm));
  if ((label === 'edge' || label === 'chrome') && presentLabOnlyPermissions.length) {
    throw new Error(`[${label}] default manifest must not require lab-only permissions: ${presentLabOnlyPermissions.join(', ')}`);
  }
  const optionsText = fs.readFileSync(path.join(extensionDir, 'options.js'), 'utf8');
  if ((label === 'edge' || label === 'chrome') && (!sidepanelHtml || !optionsText.includes('JARVIS_OPTIONAL_PERMISSIONS') || !optionsText.includes('labOnly') || !optionsText.includes('advanced declared optional') || !optionsText.includes('declared optional'))) {
    throw new Error(`[${label}] options.js must expose Jarvis permission matrix`);
  }
  if ((label === 'edge' || label === 'chrome') && !(manifest.host_permissions || []).includes('http://127.0.0.1:8791/*')) {
    throw new Error(`[${label}] manifest must allow the local Threat Review Helper endpoint`);
  }

  const qaPages = [
    'threat-radar-hidden-prompt.html',
    'threat-radar-overlay.html',
    'threat-radar-link-mismatch.html',
    'threat-radar-iframe-form.html',
    'threat-radar-ip-extraction.html',
    'threat-radar-benign-control.html'
  ];
  for (const page of qaPages) {
    const qaPath = path.join(root, 'test-pages', page);
    if (!fs.existsSync(qaPath)) {
      throw new Error(`[${label}] Missing Threat Radar QA page: ${page}`);
    }
    if (!fs.readFileSync(qaPath, 'utf8').includes('expected:')) {
      throw new Error(`[${label}] Threat Radar QA page lacks expected finding comment: ${page}`);
    }
  }
  const helperPath = path.join(root, 'scripts', 'threat-review-helper.mjs');
  if (!fs.existsSync(helperPath)) {
    throw new Error(`[${label}] Missing Threat Review helper script`);
  }
  const helperText = fs.readFileSync(helperPath, 'utf8');
  if (!helperText.includes('/threat-review') || !helperText.includes('threat_review_runner.py')) {
    throw new Error(`[${label}] Threat Review helper must expose the local runner endpoint`);
  }
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!packageJson.scripts?.['sandbox:helper']) {
    throw new Error(`[${label}] package.json must expose npm run sandbox:helper`);
  }

  console.log(`BrowserPilot ${label} extension validated: ${manifest.name} ${manifest.version}`);
}
