#!/usr/bin/env node
/**
 * Aitri Graph Visualizer — Local Server
 * Node.js built-ins only. No npm dependencies.
 * @aitri-trace FR-ID: FR-009, NFR-005
 */
import { createServer } from 'http';
import { readFileSync, existsSync, realpathSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { randomUUID } from 'crypto';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = process.env.PORT ?? 3000;
const ROOT = __dirname;
const GRAPH_DIR      = join(homedir(), '.aitri-graph');
const REGISTRY_FILE  = join(GRAPH_DIR, 'projects.json');
const MAX_REGISTRY   = Number(process.env.AITRI_GRAPH_MAX_PROJECTS ?? 50);

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

// ── Registry helpers ──────────────────────────────────────────────

function readRegistry() {
  try {
    if (!existsSync(REGISTRY_FILE)) return { projects: [] };
    return JSON.parse(readFileSync(REGISTRY_FILE, 'utf8'));
  } catch { return { projects: [] }; }
}

function writeRegistry(registry) {
  mkdirSync(GRAPH_DIR, { recursive: true });
  writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
}

/**
 * GET /api/registry — return persisted project list.
 */
function handleRegistryGet(_req, res) {
  json(res, 200, readRegistry());
}

/**
 * POST /api/registry — add a project entry.
 * Body: { url: string, name: string, source: 'local'|'github'|'demo' }
 */
function handleRegistryPost(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let payload;
    try { payload = JSON.parse(body); } catch {
      return json(res, 400, { error: 'Invalid JSON body' });
    }
    const { url, name, source } = payload ?? {};
    if (!url || typeof url !== 'string') return json(res, 400, { error: 'Missing field: url' });
    if (!name || typeof name !== 'string') return json(res, 400, { error: 'Missing field: name' });
    if (!['local', 'github', 'demo'].includes(source)) return json(res, 400, { error: 'Invalid source' });

    const registry = readRegistry();
    if (!Array.isArray(registry.projects)) registry.projects = [];
    // Deduplicate by url
    if (registry.projects.some(p => p.url === url)) {
      return json(res, 200, registry.projects.find(p => p.url === url));
    }
    if (registry.projects.length >= MAX_REGISTRY) {
      return json(res, 409, { error: `Registry full (max ${MAX_REGISTRY} projects)` });
    }
    const project = { id: randomUUID(), url, name, source, addedAt: new Date().toISOString() };
    registry.projects.push(project);
    writeRegistry(registry);
    json(res, 201, project);
  });
}

/**
 * DELETE /api/registry/:id — remove a project by id.
 */
function handleRegistryDelete(req, res, id) {
  if (!id) return json(res, 400, { error: 'Missing project id' });
  const registry = readRegistry();
  const before = registry.projects.length;
  registry.projects = (registry.projects ?? []).filter(p => p.id !== id);
  if (registry.projects.length === before) return json(res, 404, { error: 'Project not found' });
  writeRegistry(registry);
  json(res, 200, { ok: true });
}

/**
 * GET /api/project/status?path=<dir>
 * Lightweight endpoint: returns only { updatedAt, currentPhase } from .aitri.
 * Used by the frontend polling loop to detect pipeline changes without a full reload.
 */
function handleProjectStatus(_req, res, url) {
  const projectPath = url.searchParams.get('path');
  if (!projectPath) return json(res, 400, { error: 'Missing path' });
  if (projectPath.includes('..')) return json(res, 400, { error: 'Path traversal not allowed' });
  if (!projectPath.startsWith('/')) return json(res, 400, { error: 'Path must be absolute' });

  const aitriFile = join(projectPath, '.aitri');
  if (!existsSync(aitriFile)) return json(res, 404, { error: '.aitri not found' });

  try {
    const raw = JSON.parse(readFileSync(aitriFile, 'utf8'));
    json(res, 200, {
      updatedAt:    raw.updatedAt    ?? null,
      currentPhase: raw.currentPhase ?? 0,
    });
  } catch {
    json(res, 422, { error: 'Could not parse .aitri' });
  }
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
  if (req.method === 'GET'    && url.pathname === '/api/project')        return handleApiProject(req, res, url);
  if (req.method === 'GET'    && url.pathname === '/api/project/status') return handleProjectStatus(req, res, url);
  if (req.method === 'GET'    && url.pathname === '/api/registry')       return handleRegistryGet(req, res);
  if (req.method === 'POST'   && url.pathname === '/api/registry')       return handleRegistryPost(req, res);
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/registry/')) {
    return handleRegistryDelete(req, res, url.pathname.slice('/api/registry/'.length));
  }
  handleStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`\n  Aitri Graph Visualizer`);
  console.log(`  → http://localhost:${PORT}\n`);
});
