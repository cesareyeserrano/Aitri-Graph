/**
 * Sidebar — project list, add-project form, event handling.
 * @aitri-trace FR-ID: FR-010, FR-011, US-ID: US-010, US-011, TC-ID: TC-010h, TC-011h, TC-011f
 */

import {
  getProjects, getActiveProject, addProject, removeProject,
  setActiveProject, validateProjectInput, on, emit, syncFromServerRegistry,
} from './app.js';
import { loadProject, LoadError } from './loader.js';
import { normalize } from './normalizer.js';

let graphController = null;
let currentProjectId = null;

// ── Change detection polling ──────────────────────────────────────

const POLL_INTERVAL_MS        = 30_000;  // local projects
const GITHUB_POLL_INTERVAL_MS = 60_000;  // GitHub projects (conservative — public API)

// Local polling state
let _pollTimer      = null;
let _pollUpdatedAt  = null;
let _pollProjectUrl = null;

// GitHub polling state
let _ghPollTimer    = null;
let _ghPollUpdatedAt = null;
let _ghPollBranch   = null;

function startPolling(project) {
  stopPolling();
  if (project.source === 'local') {
    _pollProjectUrl = project.url;
    _pollUpdatedAt  = null;
    _pollTimer = setInterval(() => pollProject(project), POLL_INTERVAL_MS);
  } else if (project.source === 'github') {
    _ghPollUpdatedAt = null;
    _ghPollBranch    = null;
    _ghPollTimer = setInterval(() => pollGitHubProject(project), GITHUB_POLL_INTERVAL_MS);
  }
}

function stopPolling() {
  if (_pollTimer)   { clearInterval(_pollTimer);   _pollTimer   = null; }
  if (_ghPollTimer) { clearInterval(_ghPollTimer); _ghPollTimer = null; }
  _pollProjectUrl  = null;
  _pollUpdatedAt   = null;
  _ghPollUpdatedAt = null;
  _ghPollBranch    = null;
}

async function pollProject(project) {
  if (document.visibilityState === 'hidden') return;
  try {
    const res = await fetch(`/api/project/status?path=${encodeURIComponent(project.url)}`);
    if (!res.ok) return;
    const { updatedAt } = await res.json();
    if (!updatedAt) return;
    if (_pollUpdatedAt === null) { _pollUpdatedAt = updatedAt; return; } // baseline
    if (updatedAt !== _pollUpdatedAt) {
      _pollUpdatedAt = updatedAt;
      await loadAndRender(project);
    }
  } catch { /* server unreachable — keep polling silently */ }
}

function parseGitHubRef(url) {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:[/#?]|$)/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

async function pollGitHubProject(project) {
  if (document.visibilityState === 'hidden') return;
  const ref = parseGitHubRef(project.url);
  if (!ref) return;

  // Resolve branch once, cache in _ghPollBranch.
  if (!_ghPollBranch) {
    for (const branch of ['main', 'master']) {
      try {
        const res = await fetch(
          `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${branch}/.aitri`
        );
        if (res.ok) { _ghPollBranch = branch; break; }
      } catch { /* try next */ }
    }
    if (!_ghPollBranch) return; // repo not found or no .aitri
  }

  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${_ghPollBranch}/.aitri`
    );
    if (!res.ok) return;
    const data = await res.json();
    const updatedAt = data.updatedAt ?? null;
    if (!updatedAt) return;
    if (_ghPollUpdatedAt === null) { _ghPollUpdatedAt = updatedAt; return; } // baseline
    if (updatedAt !== _ghPollUpdatedAt) {
      _ghPollUpdatedAt = updatedAt;
      await loadAndRender(project);
    }
  } catch { /* rate-limited or network error — keep polling silently */ }
}

// ── Init ──────────────────────────────────────────────────────────

export function initSidebar(gc) {
  graphController = gc;

  // Bind static DOM elements
  document.getElementById('add-project-btn').addEventListener('click', showForm);
  document.getElementById('cancel-btn').addEventListener('click', hideForm);
  document.getElementById('load-btn').addEventListener('click', handleLoad);
  document.getElementById('demo-btn').addEventListener('click', handleDemo);

  // Mobile sidebar toggle
  const mobileToggle = document.getElementById('mobile-toggle');
  if (mobileToggle) {
    const sidebar = document.getElementById('sidebar');
    mobileToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    // Close sidebar when a project is selected on mobile
    on('project:added', () => sidebar.classList.remove('open'));
  }

  const input = document.getElementById('project-input');
  input.addEventListener('keydown', e => { if (e.key === 'Enter') handleLoad(); });

  // Real-time validation
  input.addEventListener('input', () => {
    clearValidationError();
    const v = validateProjectInput(input.value);
    if (input.value.trim() && !v.valid) {
      // Show error inline without blocking typing
    }
  });

  // Subscribe to store events
  on('project:added',   () => renderProjectList());
  on('project:removed', ({ wasActive }) => {
    renderProjectList();
    if (wasActive) {
      stopPolling();
      currentProjectId = null;
      if (graphController) graphController.clear();
      showCanvasState('empty');
      updateLegend(false);
      updateControls(false);
    }
  });

  // Sync from server registry first, then render
  syncFromServerRegistry().then(() => {
    renderProjectList();
    // Restore active project if any
    const active = getActiveProject();
    if (active) {
      currentProjectId = active.id;
      loadAndRender(active);
    } else {
      showCanvasState('empty');
      updateLegend(false);
      updateControls(false);
    }
  });

  // Re-render sidebar if server sync added new projects
  on('registry:synced', () => renderProjectList());
}

// ── Project List ──────────────────────────────────────────────────

/**
 * @aitri-trace FR-ID: FR-010, TC-ID: TC-010h
 */
function renderProjectList() {
  const list = document.getElementById('project-list');
  const emptyEl = document.getElementById('sidebar-empty');
  const projects = getProjects();

  list.innerHTML = '';

  if (projects.length === 0) {
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  projects.forEach(project => {
    const item = createProjectItem(project);
    list.appendChild(item);
  });
}

/**
 * @aitri-trace FR-ID: FR-010, TC-ID: TC-010h, TC-010e
 */
function createProjectItem(project) {
  const active = getActiveProject();
  const isActive = active?.id === project.id;

  const item = document.createElement('div');
  item.className = 'project-item' + (isActive ? ' active' : '');
  item.dataset.testid = 'project-item';
  item.dataset.projectId = project.id;

  const sourceBadge = project.source === 'github' ? 'GH' :
                      project.source === 'demo'   ? 'DEMO' : 'LOCAL';

  item.innerHTML = `
    <div class="project-spinner spin-sm" style="display:none"></div>
    <div class="error-dot"></div>
    <span class="project-name" title="${escHtml(project.name)}">${escHtml(project.name)}</span>
    <span class="source-badge">${sourceBadge}</span>
    <button class="remove-btn" title="Remove project" aria-label="Remove ${escHtml(project.name)}">×</button>
    <div class="remove-confirm">
      <span>Remove?</span>
      <button class="confirm-yes">Yes</button>
      <button class="confirm-no">Cancel</button>
    </div>
  `;

  // Select project on click
  item.addEventListener('click', e => {
    if (e.target.closest('.remove-btn') || e.target.closest('.remove-confirm')) return;
    selectProject(project);
  });

  // Remove flow
  item.querySelector('.remove-btn').addEventListener('click', e => {
    e.stopPropagation();
    item.querySelector('.remove-confirm').classList.add('visible');
  });
  item.querySelector('.confirm-yes').addEventListener('click', e => {
    e.stopPropagation();
    removeProject(project.id);
  });
  item.querySelector('.confirm-no').addEventListener('click', e => {
    e.stopPropagation();
    item.querySelector('.remove-confirm').classList.remove('visible');
  });

  return item;
}

/**
 * @aitri-trace FR-ID: FR-010, TC-ID: TC-010e
 */
function selectProject(project) {
  if (currentProjectId === project.id) return; // already selected
  stopPolling();
  setActiveProject(project.id);
  currentProjectId = project.id;
  renderProjectList();
  loadAndRender(project);
}

// ── Load & Render ─────────────────────────────────────────────────

/**
 * @aitri-trace FR-ID: FR-001, FR-008, FR-009
 */
async function loadAndRender(project) {
  showCanvasState('loading', `Loading ${project.name}…`);
  updateLegend(false);
  updateControls(false);
  setProjectItemState(project.id, 'loading');

  try {
    const data = await loadProject(project);
    const graphData = normalize(data.artifacts);

    graphController.render(graphData);
    showCanvasState(null);
    updateLegend(true);
    updateControls(true);
    setProjectItemState(project.id, 'default');
    startPolling(project); // start 30s change detection for local projects
  } catch (err) {
    const msg = err instanceof LoadError
      ? err.message
      : 'Unexpected error loading project';
    showCanvasState('error', msg, project);
    setProjectItemState(project.id, 'error');
    updateLegend(false);
    updateControls(false);
  }
}

// ── Add Project Form ──────────────────────────────────────────────

function showForm() {
  document.getElementById('add-project-btn').style.display = 'none';
  document.getElementById('add-project-form').classList.add('visible');
  document.getElementById('project-input').focus();
}

function hideForm() {
  document.getElementById('add-project-btn').style.display = '';
  document.getElementById('add-project-form').classList.remove('visible');
  document.getElementById('project-input').value = '';
  clearValidationError();
}

/**
 * @aitri-trace FR-ID: FR-011, TC-ID: TC-011h, TC-011e, TC-011f
 */
async function handleLoad() {
  const input = document.getElementById('project-input');
  const url = input.value.trim();

  const validation = validateProjectInput(url);
  if (!validation.valid) {
    showValidationError(validation.error);
    return;
  }

  clearValidationError();
  setFormLoading(true);

  try {
    // Derive name from URL/path
    const name = deriveName(url, validation.source);
    const project = addProject(url, name, validation.source);

    setActiveProject(project.id);
    currentProjectId = project.id;
    renderProjectList();
    hideForm();
    await loadAndRender(project);
  } catch (err) {
    showValidationError(err.message ?? 'Failed to add project');
    setFormLoading(false);
  }
}

async function handleDemo() {
  const demoUrl = 'demo://mock';
  const project = addProject(demoUrl, 'E-Commerce Demo', 'demo');
  setActiveProject(project.id);
  currentProjectId = project.id;
  renderProjectList();
  await loadAndRender(project);
}

function setFormLoading(loading) {
  const input = document.getElementById('project-input');
  const btn = document.getElementById('load-btn');
  input.disabled = loading;
  btn.disabled = loading;
  btn.textContent = loading ? '…' : 'Load';
}

function showValidationError(msg) {
  const el = document.getElementById('form-validation-error');
  el.textContent = msg;
  el.classList.add('visible');
  document.getElementById('project-input').classList.add('error');
}

function clearValidationError() {
  const el = document.getElementById('form-validation-error');
  el.classList.remove('visible');
  document.getElementById('project-input').classList.remove('error');
}

// ── Canvas States ─────────────────────────────────────────────────

function showCanvasState(state, message = '', project = null) {
  // Hide all states first
  ['canvas-empty', 'canvas-loading', 'canvas-error'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  if (!state) return; // just clear

  const el = document.getElementById(`canvas-${state}`);
  if (!el) return;
  el.classList.remove('hidden');

  if (state === 'loading') {
    const txt = el.querySelector('.loading-text');
    if (txt) txt.textContent = message;
  }

  if (state === 'error') {
    const desc = el.querySelector('.error-desc');
    if (desc) desc.textContent = message;
    const retryBtn = el.querySelector('.retry-btn');
    if (retryBtn && project) {
      retryBtn.onclick = () => loadAndRender(project);
    }
  }
}

// ── Controls & Legend ─────────────────────────────────────────────

function updateControls(enabled) {
  ['fit-button'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !enabled;
  });
}

function updateLegend(visible) {
  const legend = document.getElementById('status-legend');
  if (!legend) return;
  legend.classList.toggle('hidden', !visible);
}

// ── Project item state ────────────────────────────────────────────

function setProjectItemState(projectId, state) {
  const item = document.querySelector(`[data-project-id="${projectId}"]`);
  if (!item) return;
  item.classList.remove('loading', 'error');
  item.querySelector('.project-spinner').style.display = 'none';
  if (state === 'loading') {
    item.classList.add('loading');
    item.querySelector('.project-spinner').style.display = 'flex';
  }
  if (state === 'error') item.classList.add('error');
}

// ── Helpers ───────────────────────────────────────────────────────

function deriveName(url, source) {
  if (source === 'github') {
    const m = url.match(/github\.com\/[\w.-]+\/([\w.-]+)/);
    return m ? m[1] : url;
  }
  // local: last path segment
  return url.split('/').filter(Boolean).pop() ?? url;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
