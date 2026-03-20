/**
 * ProjectStore — project registry backed by localStorage + in-memory artifact cache.
 * @aitri-trace FR-ID: FR-010, FR-011, US-ID: US-010, US-011, AC-ID: AC-012, TC-ID: TC-010h
 */

const STORAGE_KEY = 'aitri-visualizer-projects';

/** In-memory artifact cache: Map<projectId, ArtifactData> */
const artifactCache = new Map();

// ── localStorage helpers ──────────────────────────────────────────

function loadRegistry() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { projects: [], activeProjectId: null };
    return JSON.parse(raw);
  } catch {
    return { projects: [], activeProjectId: null };
  }
}

function saveRegistry(registry) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
}

// ── Public API ────────────────────────────────────────────────────

export function getProjects() {
  return loadRegistry().projects;
}

export function getActiveProject() {
  const { projects, activeProjectId } = loadRegistry();
  return projects.find(p => p.id === activeProjectId) ?? null;
}

/**
 * Add a new project. Returns the created Project object.
 * Throws if URL already registered.
 * @aitri-trace FR-ID: FR-011, TC-ID: TC-011h, TC-011e
 */
export function addProject(url, name, source) {
  const registry = loadRegistry();
  if (registry.projects.some(p => p.url === url)) {
    // Already exists — just return it
    return registry.projects.find(p => p.url === url);
  }
  const project = {
    id: generateId(),
    name,
    source,
    url,
    addedAt: new Date().toISOString(),
    lastAccessedAt: new Date().toISOString(),
  };
  registry.projects.push(project);
  saveRegistry(registry);
  emit('project:added', { project });
  // Sync to server registry async — localStorage is primary; server is persistence backup
  fetch('/api/registry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, name, source }),
  }).catch(() => {}); // server may not be running — ignore silently
  return project;
}

/**
 * @aitri-trace FR-ID: FR-010, TC-ID: TC-010f
 */
export function removeProject(id) {
  const registry = loadRegistry();
  const wasActive = registry.activeProjectId === id;
  const project = registry.projects.find(p => p.id === id);
  registry.projects = registry.projects.filter(p => p.id !== id);
  if (wasActive) registry.activeProjectId = null;
  saveRegistry(registry);
  artifactCache.delete(id);
  emit('project:removed', { projectId: id, wasActive });
  // Sync removal to server registry async
  if (project) {
    fetch(`/api/registry/${encodeURIComponent(project.id)}`, { method: 'DELETE' }).catch(() => {});
  }
}

/**
 * @aitri-trace FR-ID: FR-010, TC-ID: TC-010e
 */
export function setActiveProject(id) {
  const registry = loadRegistry();
  const project = registry.projects.find(p => p.id === id);
  if (!project) return;
  registry.activeProjectId = id;
  project.lastAccessedAt = new Date().toISOString();
  saveRegistry(registry);
  emit('project:selected', { project });
  // Persist active project URL to server so it survives localStorage clears
  fetch('/api/registry', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activeProjectUrl: project.url }),
  }).catch(() => {});
}

// ── Artifact Cache ────────────────────────────────────────────────

export function getCachedArtifacts(projectId) {
  return artifactCache.get(projectId) ?? null;
}

export function setCachedArtifacts(projectId, data) {
  artifactCache.set(projectId, data);
}

export function evictCache(projectId) {
  artifactCache.delete(projectId);
}

// ── Server Registry Sync ─────────────────────────────────────────

/**
 * Load projects from the server registry and merge with localStorage.
 * Server projects that are not in localStorage are added silently.
 * Call once on app startup (fire-and-forget). Returns a Promise.
 */
export async function syncFromServerRegistry() {
  try {
    const res = await fetch('/api/registry');
    if (!res.ok) return;
    const serverData = await res.json();
    const serverProjects = serverData.projects ?? [];
    const serverActiveUrl = serverData.activeProjectUrl ?? null;

    const registry = loadRegistry();
    const existingUrls = new Set(registry.projects.map(p => p.url));
    let changed = false;

    // Merge server projects into localStorage
    for (const sp of serverProjects) {
      if (!sp.url || existingUrls.has(sp.url)) continue;
      registry.projects.push({
        id: sp.id ?? generateId(),
        name: sp.name,
        source: sp.source,
        url: sp.url,
        addedAt: sp.addedAt ?? new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      });
      existingUrls.add(sp.url);
      changed = true;
    }

    // Restore activeProjectId from server's activeProjectUrl if not already set locally
    if (serverActiveUrl && !registry.activeProjectId) {
      const match = registry.projects.find(p => p.url === serverActiveUrl);
      if (match) {
        registry.activeProjectId = match.id;
        changed = true;
      }
    }

    if (changed) {
      saveRegistry(registry);
      emit('registry:synced', {});
    }
  } catch { /* server not running — ignore */ }
}

// ── Event Bus ────────────────────────────────────────────────────

export function emit(event, detail = {}) {
  document.dispatchEvent(new CustomEvent(event, { detail }));
}

export function on(event, handler) {
  document.addEventListener(event, e => handler(e.detail));
}

// ── Validation ────────────────────────────────────────────────────

/**
 * Validate a project input string.
 * @aitri-trace FR-ID: FR-011, TC-ID: TC-011h, TC-011e, TC-011f
 */
export function validateProjectInput(input) {
  if (!input || !input.trim()) {
    return { valid: false, error: 'Please enter a GitHub URL or local path' };
  }
  const trimmed = input.trim();
  if (trimmed.startsWith('https://github.com/')) {
    const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(\.git)?$/.test(trimmed);
    if (!match) return { valid: false, error: 'Invalid GitHub URL — use: https://github.com/owner/repo' };
    return { valid: true, source: 'github' };
  }
  if (trimmed.startsWith('/')) {
    return { valid: true, source: 'local' };
  }
  return {
    valid: false,
    error: 'Must be a GitHub URL (https://github.com/...) or absolute path starting with /',
  };
}

// ── Helpers ──────────────────────────────────────────────────────

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
