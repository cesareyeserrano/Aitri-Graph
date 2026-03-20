/**
 * ArtifactLoader — fetches Aitri artifacts from GitHub or local server.
 * @aitri-trace FR-ID: FR-008, FR-009, US-ID: US-008, US-009, TC-ID: TC-008h, TC-008e, TC-008f, TC-009h
 */

const FETCH_TIMEOUT_MS = 10000;

/**
 * LoadError — thrown by loadProject on any failure.
 * codes: NOT_FOUND | NO_ARTIFACTS | PARSE_ERROR | NETWORK_ERROR | SERVER_ERROR
 */
export class LoadError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'LoadError';
  }
}

/**
 * Load artifacts for a project. Returns ArtifactData.
 * @param {{ id, source, url, name }} project
 * @returns {Promise<{name, source, artifacts: {requirements, testCases, aitriState}}>}
 * @aitri-trace FR-ID: FR-008, FR-009
 */
export async function loadProject(project) {
  if (project.source === 'github')       return loadGitHub(project.url);
  if (project.source === 'local')        return loadLocal(project.url);
  if (project.source === 'demo')         return loadDemo();
  if (project.source === 'local-browser') {
    throw new LoadError('NOT_FOUND', 'Vuelve a elegir la carpeta para recargar este proyecto');
  }
  throw new LoadError('NOT_FOUND', 'Unknown project source');
}

// ── GitHub loader ─────────────────────────────────────────────────

const GITHUB_RE = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(\.git)?$/;

/**
 * @aitri-trace FR-ID: FR-008, TC-ID: TC-008h, TC-008e, TC-008f
 */
async function loadGitHub(url) {
  const match = url.match(GITHUB_RE);
  if (!match) throw new LoadError('NOT_FOUND', 'Invalid GitHub URL format');

  const [, owner, repo] = match;

  // Try main, then master (TC-008e)
  const branch = await resolveBranch(owner, repo);
  if (!branch) throw new LoadError('NOT_FOUND', `Repository ${owner}/${repo} not found or has no Aitri spec on main/master branch`);

  const base = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;

  const requirements = await fetchJSON(`${base}/spec/01_REQUIREMENTS.json`, true);
  if (!requirements) throw new LoadError('NO_ARTIFACTS', 'No Aitri artifacts found in this repository');

  const [testCases, aitriState] = await Promise.all([
    fetchJSON(`${base}/spec/03_TEST_CASES.json`, false),
    fetchJSON(`${base}/.aitri`, false),
  ]);

  const name = requirements.project_name ?? repo;
  return { name, source: 'github', artifacts: { requirements, testCases, aitriState } };
}

/**
 * Resolve 'main' or 'master' branch by probing both in parallel.
 * Returns branch name or null if neither found.
 * @aitri-trace TC-ID: TC-008e
 */
async function resolveBranch(owner, repo) {
  const toUrl = branch =>
    `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/spec/01_REQUIREMENTS.json`;

  const [mainResult, masterResult] = await Promise.allSettled([
    fetchWithTimeout(toUrl('main')),
    fetchWithTimeout(toUrl('master')),
  ]);

  if (mainResult.status === 'fulfilled' && mainResult.value.ok) return 'main';
  if (masterResult.status === 'fulfilled' && masterResult.value.ok) return 'master';

  // Both 404 → no spec found
  const mainStatus = mainResult.status === 'fulfilled' ? mainResult.value.status : 0;
  const masterStatus = masterResult.status === 'fulfilled' ? masterResult.value.status : 0;
  if (mainStatus === 404 && masterStatus === 404) return null;

  throw new LoadError('NETWORK_ERROR', `Network error fetching repository (${mainStatus || masterStatus})`);
}

// ── Local loader ──────────────────────────────────────────────────

/**
 * @aitri-trace FR-ID: FR-009, TC-ID: TC-009h, TC-009e, TC-009f
 */
async function loadLocal(path) {
  // Guard: browser-picked folders stored with old source='local' — catch them here
  if (!path || !path.startsWith('/')) {
    throw new LoadError('NOT_FOUND', 'Elige la carpeta de nuevo usando el botón 📁');
  }
  let res;
  try {
    res = await fetchWithTimeout(`/api/project?path=${encodeURIComponent(path)}`);
  } catch {
    throw new LoadError('NETWORK_ERROR', 'Could not reach local server — is server.js running?');
  }

  if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    throw new LoadError('NOT_FOUND', body.error ?? 'Invalid path');
  }
  if (res.status === 404) {
    const body = await res.json().catch(() => ({}));
    throw new LoadError('NOT_FOUND', body.error ?? 'Path not found');
  }
  if (res.status === 422) {
    const body = await res.json().catch(() => ({}));
    throw new LoadError('NO_ARTIFACTS', body.error ?? 'No Aitri artifacts found at this path');
  }
  if (!res.ok) {
    throw new LoadError('SERVER_ERROR', `Server error (${res.status})`);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new LoadError('PARSE_ERROR', 'Could not parse server response');
  }

  return data; // { name, source: 'local', artifacts: { requirements, testCases, aitriState } }
}

// ── Demo loader ───────────────────────────────────────────────────

async function loadDemo() {
  const requirements = await fetchJSON('/data/mock.json', true);
  if (!requirements) throw new LoadError('NO_ARTIFACTS', 'Could not load demo data');
  return {
    name: requirements.project_name ?? 'Demo Project',
    source: 'demo',
    artifacts: { requirements, testCases: null, aitriState: null },
  };
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Build GitHub raw content URL. Exported for unit tests.
 * @aitri-trace TC-ID: TC-008h
 */
export function buildGitHubRawUrl(githubUrl, branch, filePath) {
  const match = githubUrl.match(GITHUB_RE);
  if (!match) return null;
  const [, owner, repo] = match;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new LoadError('NETWORK_ERROR', 'Request timed out after 10s');
    throw new LoadError('NETWORK_ERROR', `Network error: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Load artifacts directly from a FileSystemDirectoryHandle (browser File System Access API).
 * No server needed — reads spec/ files straight from the user's local folder.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @returns {Promise<{name, source, artifacts}>}
 */
export async function loadFromDirectoryHandle(dirHandle) {
  async function readJSON(path) {
    try {
      const parts = path.split('/');
      let handle = dirHandle;
      for (let i = 0; i < parts.length - 1; i++) {
        handle = await handle.getDirectoryHandle(parts[i]);
      }
      const fileHandle = await handle.getFileHandle(parts[parts.length - 1]);
      const file = await fileHandle.getFile();
      return JSON.parse(await file.text());
    } catch {
      return null;
    }
  }

  const requirements = await readJSON('spec/01_REQUIREMENTS.json');
  if (!requirements) {
    throw new LoadError('NO_ARTIFACTS', 'No Aitri artifacts found — make sure spec/01_REQUIREMENTS.json exists');
  }

  const [testCases, aitriState] = await Promise.all([
    readJSON('spec/03_TEST_CASES.json'),
    readJSON('.aitri'),
  ]);

  const name = requirements.project_name ?? dirHandle.name;
  return { name, source: 'local', artifacts: { requirements, testCases, aitriState } };
}

async function fetchJSON(url, required) {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    if (err instanceof LoadError) {
      if (required) throw err;
      return null;
    }
    if (required) throw new LoadError('PARSE_ERROR', `Could not parse artifact at ${url}`);
    return null;
  }
}
