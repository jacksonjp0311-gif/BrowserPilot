import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runnerPath = path.join(root, 'sandbox', 'threat-review', 'threat_review_runner.py');
const port = Number(process.env.BROWSERPILOT_THREAT_REVIEW_PORT || 8791);
const host = '127.0.0.1';
const maxBodyBytes = 1_500_000;

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error('request body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function runPython(args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const child = spawn('python', args, {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`threat review timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || `threat review exited ${code}`));
    });
  });
}

async function handleThreatReview(req, res) {
  const raw = await readBody(req);
  const request = JSON.parse(raw);
  if (request?.schemaVersion !== 'browserpilot.threatReviewRequest.v1') {
    throw new Error('invalid schemaVersion');
  }
  if (request?.humanApproved !== true) {
    throw new Error('humanApproved must be true');
  }
  if (request?.options?.allowNetwork === true) {
    throw new Error('network review is disabled by default');
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'browserpilot-review-request-'));
  const inputPath = path.join(tmpDir, 'approved-threat-review-request.json');
  const outputPath = path.join(tmpDir, 'threat-review-result.json');
  try {
    await fs.writeFile(inputPath, JSON.stringify(request, null, 2), 'utf8');
    await runPython([runnerPath, inputPath, '--output', outputPath], Number(request?.options?.timeoutMs || 30000));
    const result = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    sendJson(res, 200, { ok: true, result });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { ok: true, service: 'BrowserPilot Threat Review Helper' });
      return;
    }
    if (req.method === 'POST' && req.url === '/threat-review') {
      await handleThreatReview(req, res);
      return;
    }
    sendJson(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err?.message || String(err) });
  }
});

server.listen(port, host, () => {
  console.log(`BrowserPilot Threat Review Helper listening on http://${host}:${port}`);
});
