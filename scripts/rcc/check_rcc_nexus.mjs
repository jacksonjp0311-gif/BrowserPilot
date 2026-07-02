import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const requiredFiles = [
  'README.md',
  'README_90_SECONDS.md',
  'agnt-plugins/README.md',
  'apps/README.md',
  'apps/edge-extension/README.md',
  'apps/chrome-extension/README.md',
  'docs/README.md',
  'docs/rcc-nexus.md',
  'docs/rehydration-protocol.md',
  'docs/failure-modes.md',
  'extension/README.md',
  'rcc/README.md',
  'rcc/nexus/README.md',
  'rcc/nexus/route_map.json',
  'reports/README.md',
  'reports/rcc_nexus/.gitkeep',
  'sandbox/README.md',
  'scripts/README.md',
  'symtorch/README.md',
  'test-pages/README.md',
  'toolbox/README.md',
  'toolbox/skills/dom-audit-probe/README.md'
];

const requiredPhrases = new Map([
  ['README.md', ['# PART I - Human README', '# PART II - RCC Nexus README', '# PART III - AI Agent README', '# PART IV - Rehydration Protocol']],
  ['README_90_SECONDS.md', ['npm run validate', 'npm run validate:rcc', 'No validation, no completion claim']],
  ['apps/README.md', ['## S - Specification', '## RCC Nexus Echo Location', 'Extension reload behavior must be runtime-checked']],
  ['apps/edge-extension/README.md', ['## S - Specification', '## RCC Nexus Echo Location', 'manual Edge verification remains required']],
  ['apps/chrome-extension/README.md', ['## S - Specification', '## RCC Nexus Echo Location', 'manual Chrome verification remains required']],
  ['docs/README.md', ['## S - Specification', '## RCC Nexus Echo Location', 'Local Documentation Index']],
  ['docs/rcc-nexus.md', ['navigation is not validation', 'Threat Scan', 'Cyber Snapshot', 'Context Radar']],
  ['docs/rehydration-protocol.md', ['The geometry must align before the output can compound', 'No validation, no completion claim']],
  ['docs/failure-modes.md', ['Side Panel Open Failure', 'Receiving End Does Not Exist', 'Threat Signal Confusion']],
  ['rcc/README.md', ['navigation_is_not_validation', 'validation_remains_required']],
  ['rcc/nexus/README.md', ['Agent Route', 'Update Obligation']],
  ['scripts/README.md', ['## S - Specification', '## RCC Nexus Echo Location']],
  ['sandbox/README.md', ['## S - Specification', '## RCC Nexus Echo Location']],
  ['symtorch/README.md', ['## S - Specification', '## RCC Nexus Echo Location']],
  ['toolbox/README.md', ['## S - Specification', '## RCC Nexus Echo Location']]
]);

const findings = [];

for (const rel of requiredFiles) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    findings.push(`missing file: ${rel}`);
  }
}

for (const [rel, phrases] of requiredPhrases) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) continue;
  const text = fs.readFileSync(full, 'utf8');
  for (const phrase of phrases) {
    if (!text.includes(phrase)) {
      findings.push(`${rel} missing phrase: ${phrase}`);
    }
  }
}

const routePath = path.join(root, 'rcc', 'nexus', 'route_map.json');
if (fs.existsSync(routePath)) {
  const routeMap = JSON.parse(fs.readFileSync(routePath, 'utf8'));
  if (!Array.isArray(routeMap.routes) || routeMap.routes.length < 5) {
    findings.push('route_map.json must contain at least five routes');
  }
  for (const rel of routeMap.readOrder || []) {
    if (!fs.existsSync(path.join(root, rel))) {
      findings.push(`route_map.json readOrder points to missing file: ${rel}`);
    }
  }
  for (const route of routeMap.routes || []) {
    for (const rel of route.paths || []) {
      if (!fs.existsSync(path.join(root, rel))) {
        findings.push(`route ${route.surface} points to missing path: ${rel}`);
      }
    }
  }
}

if (findings.length) {
  console.error('BrowserPilot RCC Nexus validation failed:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log('BrowserPilot RCC Nexus validated');
