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
  if ((label === 'edge' || label === 'chrome') && !backgroundText.includes('BROWSERPILOT_START_THREAT_SCAN')) {
    throw new Error(`[${label}] background.js must route BROWSERPILOT_START_THREAT_SCAN`);
  }
  if (!backgroundText.includes('function normalizeAgentList') || !backgroundText.includes('agents: normalizeAgentList')) {
    throw new Error(`[${label}] background.js must normalize AGNT agent list responses`);
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

  console.log(`BrowserPilot ${label} extension validated: ${manifest.name} ${manifest.version}`);
}
