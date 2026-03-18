#!/usr/bin/env node
/**
 * Aitri Graph Visualizer — Local Server
 * Node.js built-ins only. No npm dependencies.
 * @aitri-trace FR-ID: FR-009, NFR-005
 */
import { createServer } from 'http';
import { readFileSync, existsSync, realpathSync } from 'fs';
import { join, resolve, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = process.env.PORT ?? 3000;
const ROOT = __dirname;

// ── Rate limiting (per IP, /api/project only) ─────────────────────
const RATE_LIMIT_MAX       = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'text/javascript',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; " +
    "script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; " +
    "connect-src 'self' https://raw.githubusercontent.com",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
  res.end(JSON.stringify(body));
}

/**
 * @aitri-trace FR-ID: FR-009, TC-ID: TC-009h, TC-009e, TC-009f, TC-NFR005h, TC-NFR005f
 */
function handleApiProject(req, res, url) {
  const ip = req.socket.remoteAddress ?? 'unknown';
  if (!checkRateLimit(ip)) return json(res, 429, { error: 'Too many requests — slow down' });

  const path = url.searchParams.get('path');

  if (!path)              return json(res, 400, { error: 'Invalid path: missing' });
  if (path.includes('..')) return json(res, 400, { error: 'Invalid path: traversal not allowed' });
  if (!path.startsWith('/')) return json(res, 400, { error: 'Invalid path: must be absolute' });
  if (path.length > 512)  return json(res, 400, { error: 'Invalid path: too long' });

  if (!existsSync(path))  return json(res, 404, { error: `Path not found: ${path}` });

  // Resolve symlinks to get the real path for file operations (e.g. /tmp → /private/tmp on macOS)
  let resolvedPath;
  try { resolvedPath = realpathSync(path); } catch {
    return json(res, 400, { error: 'Invalid path: cannot resolve' });
  }

  const reqPath = join(resolvedPath, 'spec', '01_REQUIREMENTS.json');
  if (!existsSync(reqPath)) return json(res, 422, { error: 'No Aitri artifacts found at this path' });

  let requirements;
  try {
    requirements = JSON.parse(readFileSync(reqPath, 'utf8'));
  } catch {
    return json(res, 422, { error: 'Could not parse artifact: invalid JSON format' });
  }

  let testCases = null;
  try {
    const tcPath = join(resolvedPath, 'spec', '03_TEST_CASES.json');
    if (existsSync(tcPath)) testCases = JSON.parse(readFileSync(tcPath, 'utf8'));
  } catch { /* optional file */ }

  let aitriState = null;
  try {
    const aitriPath = join(resolvedPath, '.aitri');
    if (existsSync(aitriPath)) aitriState = JSON.parse(readFileSync(aitriPath, 'utf8'));
  } catch { /* optional file */ }

  const name = requirements.project_name ?? path.split('/').filter(Boolean).pop();
  json(res, 200, { name, source: 'local', artifacts: { requirements, testCases, aitriState } });
}

function handleStatic(_req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  const safePath = resolve(ROOT, '.' + pathname);
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403, SECURITY_HEADERS); res.end('Forbidden'); return;
  }
  if (!existsSync(safePath)) {
    res.writeHead(404, SECURITY_HEADERS); res.end('Not found'); return;
  }
  try {
    const content = readFileSync(safePath);
    const mime = MIME[extname(safePath)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, ...SECURITY_HEADERS });
    res.end(content);
  } catch {
    res.writeHead(500, SECURITY_HEADERS); res.end('Server error');
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.on('finish', () => {
    console.log(`${new Date().toISOString()} ${req.method} ${url.pathname} ${res.statusCode}`);
  });
  if (req.method === 'GET' && url.pathname === '/api/project') {
    return handleApiProject(req, res, url);
  }
  handleStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`\n  Aitri Graph Visualizer`);
  console.log(`  → http://localhost:${PORT}\n`);
});
