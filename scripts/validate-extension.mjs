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


  // --- Runtime sanity checks (lightweight) ---
  // Structural checks can pass while the panel is runtime-broken (missing helpers).
  const sidepanelText = fs.readFileSync(path.join(extensionDir, 'sidepanel.js'), 'utf8');
  const requiredSnippets = [
    'function setError',
    'function pushMsg',
    'function setSelectedAgent',
    'async function bg',
    'function rebuildFromChatLog'
  ];
  const missing = requiredSnippets.filter((s) => !sidepanelText.includes(s));
  if (missing.length) {
    throw new Error('[' + label + '] sidepanel.js is missing helper(s): ' + missing.join(', '));
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
