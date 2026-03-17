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
  if (project.source === 'github') return loadGitHub(project.url);
  if (project.source === 'local')  return loadLocal(project.url);
  if (project.source === 'demo')   return loadDemo();
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
  if (!branch) throw new LoadError('NO_ARTIFACTS', `No Aitri spec found in ${owner}/${repo} — make sure spec/01_REQUIREMENTS.json exists on main or master branch`);

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
 * Try 'main' branch first, fallback to 'master'.
 * Returns branch name or null if neither found.
 * @aitri-trace TC-ID: TC-008e
 */
async function resolveBranch(owner, repo) {
  const mainUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/spec/01_REQUIREMENTS.json`;
  const masterUrl = `https://raw.githubusercontent.com/${owner}/${repo}/master/spec/01_REQUIREMENTS.json`;

  const mainRes = await fetchWithTimeout(mainUrl);
  if (mainRes.ok) return 'main';

  const masterRes = await fetchWithTimeout(masterUrl);
  if (masterRes.ok) return 'master';

  if (mainRes.status === 404 && masterRes.status === 404) return null;
  throw new LoadError('NETWORK_ERROR', `Network error fetching repository (${mainRes.status})`);
}

// ── Local loader ──────────────────────────────────────────────────

/**
 * @aitri-trace FR-ID: FR-009, TC-ID: TC-009h, TC-009e, TC-009f
 */
async function loadLocal(path) {
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
    throw new LoadError('NO_ARTIFACTS', 'No Aitri artifacts found at this path');
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
