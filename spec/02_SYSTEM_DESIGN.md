# Phase 2 — System Architecture
## Aitri Product Graph Visualizer

---

## Executive Summary

**Runtime stack:**
- **Frontend**: Vanilla JS (ES Modules via `<script type="module">`) — no build step, no framework
- **Graph library**: Cytoscape.js v3.28 (CDN) + cytoscape-dagre layout plugin (CDN) — chosen for native hierarchical layout, built-in zoom/pan/expand-collapse support
- **Server**: Node.js v18+ LTS, built-in `http` + `fs` + `path` modules only — single file `server.js`, no `npm install` required
- **Persistence**: `localStorage` for project registry only; artifact data is in-memory per session

The app is a thin shell: the server serves static files and proxies local filesystem reads; the frontend owns all graph state, rendering, and GitHub fetches. The constraint of zero npm dependencies on the server is satisfied by design — the entire server is ~100 lines of Node.js core APIs.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (localhost:3000)                                        │
│                                                                  │
│  ┌────────────────┐    ┌────────────────────────────────────┐   │
│  │   Sidebar      │    │   Graph Canvas                     │   │
│  │   sidebar.js   │    │   graph.js (Cytoscape.js v3.28)    │   │
│  │                │    │                                    │   │
│  │  ProjectStore  │◄──►│  GraphRenderer                     │   │
│  │  (app.js)      │    │  - dagre hierarchical layout       │   │
│  │                │    │  - expand/collapse (in-graph)      │   │
│  │  localStorage  │    │  - zoom/pan (native Cytoscape)     │   │
│  └────────────────┘    │  - dependency edges (dashed)       │   │
│           │            └────────────────────────────────────┘   │
│           │                        ▲                            │
│           ▼                        │                            │
│  ┌─────────────────────────────────┴──────────────────────┐    │
│  │   ArtifactLoader (loader.js)                            │    │
│  │                                                         │    │
│  │   GitHub source → fetch(raw.githubusercontent.com)      │    │
│  │   Local source  → fetch(/api/project?path=...)          │    │
│  │                                                         │    │
│  │   ArtifactNormalizer → internal GraphData model         │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                                │ (local source only)
                                ▼
              ┌─────────────────────────────────┐
              │   server.js (Node.js built-ins) │
              │                                 │
              │   GET /api/project?path=...      │
              │   ├─ validates path (no "..")    │
              │   ├─ reads spec/01_REQUIREMENTS  │
              │   ├─ reads spec/03_TEST_CASES    │
              │   └─ reads .aitri               │
              │                                 │
              │   GET /* → serves static files  │
              │   from project root dir         │
              └─────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Local Filesystem     │
                    │  /path/to/project/    │
                    │  ├─ spec/             │
                    │  │  ├─ 01_REQ*.json   │
                    │  │  └─ 03_TEST*.json  │
                    │  └─ .aitri            │
                    └───────────────────────┘
```

**Component responsibilities:**

| Component | File | Responsibility |
|---|---|---|
| App Shell | `index.html` | HTML skeleton, CSS/JS imports via CDN and local modules |
| App State | `js/app.js` | ProjectStore (CRUD on project registry), active project, artifact cache, event bus |
| Sidebar | `js/sidebar.js` | Renders project list, handles add/remove/select, delegates load to loader.js |
| Artifact Loader | `js/loader.js` | GitHub fetch path, local API path, JSON parse, error normalization |
| Artifact Normalizer | `js/normalizer.js` | Transforms raw Aitri JSON into internal GraphData model |
| Graph Renderer | `js/graph.js` | Cytoscape init, layout (dagre), node/edge styling, expand/collapse, tooltip |
| Controls | `js/controls.js` | Zoom in/out buttons, Fit button — delegates to Cytoscape instance |
| Legend | `js/legend.js` | Renders status color/icon legend, always visible when graph is active |
| Tooltip | `js/tooltip.js` | DOM tooltip element positioned on Cytoscape mouseover events |
| Server | `server.js` | Static file server + `/api/project` endpoint |
| Design Tokens | `css/tokens.css` | CSS custom properties (all color/type/spacing tokens) |
| Mock Data | `data/mock.json` | Sample Aitri project (2 Epics, 4 Features, 8 US, 8 TC, 2 dependencies) |

---

## Data Model

### 1. Project Registry (localStorage)

Key: `aitri-visualizer-projects`

```js
// Type: ProjectRegistry
{
  projects: [
    {
      id: string,              // crypto.randomUUID() or Date.now().toString(36)
      name: string,            // derived: repo name (GitHub) or last path segment (local)
      source: "github"|"local",
      url: string,             // GitHub URL ("https://github.com/owner/repo")
                               // or absolute local path ("/Users/x/projects/foo")
      addedAt: string,         // ISO 8601
      lastAccessedAt: string   // ISO 8601, updated on each graph load
    }
  ],
  activeProjectId: string | null
}
```

Constraints:
- `id` is immutable after creation
- `url` is the canonical identifier — no two projects may share the same `url`
- Max 50 projects (UI does not enforce a hard cap but localStorage limit applies)
- `name` is display-only; may differ from project_name in artifacts

---

### 2. Artifact Cache (in-memory, per session)

Not persisted. Keyed by `project.id` in a `Map<string, ArtifactData>`.

```js
// Type: ArtifactData
{
  projectId: string,
  name: string,              // from requirements.project_name
  source: "github"|"local",
  requirements: object,      // raw 01_REQUIREMENTS.json — may be null
  testCases: object | null,  // raw 03_TEST_CASES.json — null if not found
  aitriState: object | null, // raw .aitri — null if not found
  loadedAt: string           // ISO 8601
}
```

Cache invalidation: cache entry is evicted when the project is removed from the sidebar. Re-fetched on next selection.

---

### 3. Internal GraphData Model (in-memory, derived)

Produced by `normalizer.js` from `ArtifactData`. Consumed by `graph.js`.

```js
// Type: GraphData
{
  projectId: string,
  nodes: GraphNode[],
  edges: GraphEdge[]
}

// Type: GraphNode
{
  id: string,          // FR-001, US-003, TC-001, EPIC-01, etc.
  label: string,       // title (truncated) or id for test cases
  type: "epic" | "feature" | "user_story" | "test_case",
  status: "pending" | "in_progress" | "approved" | "complete" | "drift",
  parentId: string | null,
  fullTitle: string,   // untruncated title for tooltip
  dependencies: string[],  // IDs of nodes this node depends on (non-hierarchical)
  collapsed: boolean       // default: false — runtime state, not from artifacts
}

// Type: GraphEdge
{
  id: string,          // "e-{sourceId}-{targetId}-{type}"
  source: string,      // source node id
  target: string,      // target node id
  edgeType: "hierarchy" | "dependency"
}
```

**Normalization rules** (applied in `normalizer.js`):

| Artifact source | GraphNode type | id | label | parentId | status |
|---|---|---|---|---|---|
| `functional_requirements[n]` | `feature` | `fr.id` | `fr.title` | `null` (or epic id if epics defined) | from `.aitri.approvedPhases` or `pending` |
| `user_stories[n]` | `user_story` | `us.id` | `us.as_a + ": " + us.i_want` (truncated 60 chars) | `us.requirement_id` | same derivation |
| `testCases[n]` (from 03_TEST_CASES.json) | `test_case` | `tc.id` | `tc.id` | `tc.requirement_id` or `tc.user_story_id` | `tc.status` or `pending` |
| Synthetic epic | `epic` | `EPIC-{n}` | `project_name` | `null` | derived from child statuses |

**Status derivation from `.aitri`:**
- If `.aitri.approvedPhases` includes a phase number → corresponding FRs get `approved`
- If `.aitri.driftPhases` includes a phase → corresponding FRs get `drift`
- If `.aitri.completedPhases` includes → `complete`
- If `.aitri.currentPhase` is actively running → `in_progress`
- Default: `pending`

**Dependency edges:** derived from `us.acceptance_criteria` cross-references or explicit `dependencies` field in mock.json.

---

### 4. Server-side (no persistence)

The server holds no state. Each request is stateless. All filesystem reads happen per-request.

---

## API Design

### Server API (Node.js built-in HTTP)

#### `GET /api/project`

Reads Aitri artifacts from a local filesystem path.

**Query parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `path` | string | yes | Absolute path to Aitri project root |

**Security checks (applied before any fs access):**
1. Reject if `path` is missing → 400
2. Reject if `path` contains `..` → 400 (path traversal)
3. Reject if `path` does not start with `/` → 400
4. Reject if `path` length > 512 chars → 400

**Response 200:**
```json
{
  "name": "string",
  "source": "local",
  "artifacts": {
    "requirements": { /* 01_REQUIREMENTS.json content */ },
    "testCases": { /* 03_TEST_CASES.json content, or null */ },
    "aitriState": { /* .aitri content, or null */ }
  }
}
```

**Error responses:**

| Status | Condition | Body |
|---|---|---|
| 400 | Path missing, contains `..`, not absolute, or too long | `{ "error": "Invalid path: [reason]" }` |
| 404 | Path does not exist on filesystem | `{ "error": "Path not found: [path]" }` |
| 422 | Path exists but no `spec/01_REQUIREMENTS.json` found | `{ "error": "No Aitri artifacts found at this path" }` |
| 500 | Unexpected fs error | `{ "error": "Server error reading artifacts" }` |

**Implementation note:** The server reads exactly 3 files max per request:
1. `{path}/spec/01_REQUIREMENTS.json` — required
2. `{path}/spec/03_TEST_CASES.json` — optional (null if not found)
3. `{path}/.aitri` — optional (null if not found)

All reads use `fs.readFileSync` with try/catch. Response is serialized with `JSON.stringify`.

---

#### `GET /*` (static file server)

Serves static files from the project root directory (where `server.js` lives).

| Path | Serves |
|---|---|
| `/` | `index.html` |
| `/css/*.css` | CSS files |
| `/js/*.js` | JS modules |
| `/data/*.json` | Mock data files |

MIME types: `.html` → `text/html`, `.css` → `text/css`, `.js` → `text/javascript`, `.json` → `application/json`.

Returns 404 for any path not matching a real file.

---

### Frontend Internal Module API

#### `loader.js`

```js
/**
 * Load artifacts for a project.
 * Determines GitHub vs local source from project.source.
 * Returns normalized ArtifactData or throws LoadError.
 */
async function loadProject(project: Project): Promise<ArtifactData>

/**
 * Thrown by loadProject on any failure.
 * .code: "NOT_FOUND" | "NO_ARTIFACTS" | "PARSE_ERROR" | "NETWORK_ERROR"
 * .message: human-readable description
 */
class LoadError extends Error { code: string }
```

**GitHub fetch logic:**
1. Extract `{owner}/{repo}` from URL using regex `^https://github\.com/([\w.-]+)/([\w.-]+?)(?:\.git)?$`
2. Try: `GET https://raw.githubusercontent.com/{owner}/{repo}/main/spec/01_REQUIREMENTS.json`
3. On 404: retry with `/master/` branch
4. On 404 again: throw `LoadError { code: "NO_ARTIFACTS" }`
5. Fetch `testCases` and `aitriState` in parallel (non-blocking; 404 → null)

---

#### `normalizer.js`

```js
/**
 * Transform raw ArtifactData into GraphData for Cytoscape.
 * Always returns a valid GraphData; missing fields produce pending/unknown nodes.
 */
function normalize(artifacts: ArtifactData): GraphData
```

---

#### `graph.js`

```js
/**
 * Initialize Cytoscape instance in the given container element.
 * Returns a GraphController.
 */
function initGraph(container: HTMLElement): GraphController

interface GraphController {
  render(data: GraphData): void   // Replace current graph with new data
  clear(): void                   // Remove all nodes/edges, show empty state
  zoomIn(): void                  // Zoom +10%
  zoomOut(): void                 // Zoom -10%
  fit(): void                     // Fit all nodes in viewport
  destroy(): void                 // Clean up Cytoscape instance
}
```

---

#### `app.js` (ProjectStore)

```js
// Singleton store — exposes these functions:

function getProjects(): Project[]
function getActiveProject(): Project | null
function addProject(url: string): Project        // validates, deduplicates, persists to localStorage
function removeProject(id: string): void         // removes from localStorage, evicts cache
function setActiveProject(id: string): void      // updates localStorage.activeProjectId

// Event bus (custom events on document):
// "project:added"    — detail: { project }
// "project:removed"  — detail: { projectId, wasActive }
// "project:selected" — detail: { project }
```

---

## Security Design

### Path Traversal Prevention (server.js)

All paths through `/api/project` are validated before any `fs` call:

```js
// Applied in order — first violation → immediate 400 return
if (!path) return respond(400, { error: "Invalid path: missing" });
if (path.includes("..")) return respond(400, { error: "Invalid path: traversal not allowed" });
if (!path.startsWith("/")) return respond(400, { error: "Invalid path: must be absolute" });
if (path.length > 512) return respond(400, { error: "Invalid path: too long" });
```

The static file server uses `path.resolve()` + prefix check to ensure served files are within the project root:

```js
const safe = path.resolve(ROOT, requestedPath);
if (!safe.startsWith(ROOT)) return respond(403, "Forbidden");
```

### GitHub URL Validation (client-side, loader.js)

Before any fetch:
```js
const GITHUB_RE = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(\.git)?$/;
if (!GITHUB_RE.test(url)) throw new LoadError("NOT_FOUND", "Invalid GitHub URL format");
```

### XSS Prevention

All user-provided text (project names, artifact titles) is inserted via `element.textContent` never `innerHTML`. The only exception is the error message card — which uses static hardcoded HTML, not user content.

Tooltip content is built entirely via DOM manipulation (`createElement`, `textContent`) — no string interpolation into HTML.

### CORS

The server does not set `Access-Control-Allow-Origin` headers. The app runs on localhost only; no cross-origin requests are expected. If a cross-origin request arrives, the browser's default policy applies (blocked).

### Content Security Policy (HTTP header)

Set by server.js on every response:
```
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://unpkg.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://raw.githubusercontent.com
```

This allows:
- CDN scripts (Cytoscape, dagre) from jsdelivr/unpkg
- Fetch to `raw.githubusercontent.com` for GitHub projects
- Blocks all other external connections

---

## Performance & Scalability

### Graph Rendering Performance

**Target:** ≤3 seconds to render 22 nodes after data is available (NFR-001).

Cytoscape.js with dagre layout for 22 nodes completes layout in ~50ms on a modern desktop. Rendering overhead is negligible at this scale. Performance risk only arises at >200 nodes — documented as out of scope for POC.

**Optimization:** Cytoscape is initialized once on page load (`initGraph`), not re-created on project switch. `render(data)` calls `cy.batch()` to apply all node/edge changes atomically before a single re-render.

### Artifact Cache

Artifact data (raw JSON) is cached in-memory per session keyed by `project.id`. Switching to a previously-loaded project uses the cache and skips the network/fs call.

Cache entry size: 01_REQUIREMENTS.json for a typical Aitri project is ~20–50KB. 10 cached projects = ~500KB max — negligible.

### GitHub Fetch

Two sequential fetches for GitHub projects (main branch attempt → master fallback). Parallel fetch for optional files (testCases, aitriState). Total network time for a typical project: ~500ms on a fast connection.

Timeout: 10 seconds per fetch, enforced via `AbortController`. On timeout → `LoadError { code: "NETWORK_ERROR" }`.

### Expand/Collapse Performance

Cytoscape's built-in `remove()` / `restore()` methods are used for expand/collapse. For a sub-tree of 50 nodes, this is ~5ms. No plugin dependency — implemented directly in `graph.js` by tracking `collapsedChildren` in a `Map<nodeId, Element[]>`.

### Bundle Size (no build step)

| Library | CDN size (gzip) |
|---|---|
| Cytoscape.js v3.28 | ~115KB |
| cytoscape-dagre v2.5 | ~15KB |
| dagre v0.8 | ~28KB |
| App JS (all modules) | ~15KB estimated |
| App CSS | ~5KB estimated |
| **Total** | ~178KB |

All CDN resources use integrity hashes (SRI) to prevent tampering.

---

## Deployment Architecture

This is a localhost-only POC. No staging, no production environment, no CI/CD.

**Startup:**
```bash
node server.js
# → listening on http://localhost:3000
```

**Requirements:**
- Node.js v18 LTS or later (for `crypto.randomUUID()`, `fetch` in tests)
- No `npm install` required

**Port:** `3000` (hardcoded default). Overridable via `PORT` environment variable:
```js
const PORT = process.env.PORT ?? 3000;
```

**Project root:** server.js serves static files from `__dirname` (its own directory). The project must be opened from its root.

**No containers, no CI, no cloud** — consistent with no_go_zone constraints.

---

## Risk Analysis

### ADR-01: Graph Library — Cytoscape.js vs D3.js

**Context:** FR-001 (hierarchical graph), FR-003/004 (zoom/pan), FR-005 (expand/collapse), FR-006 (dependency edges) all require a graph rendering library. Technology preferences mention Cytoscape.js or D3.js.

**Option A: Cytoscape.js v3.28**
- Purpose-built for network/graph visualization
- dagre layout plugin provides automatic hierarchical (top-down) layout out of the box
- Zoom/pan built-in with no additional code
- Node click events, styling, and edge differentiation via stylesheet API
- Expand/collapse implementable with `remove()`/`restore()` without plugins
- CDN available (jsdelivr), MIT license
- Tradeoff: larger bundle than D3 for simple use cases; less flexible for non-graph charts

**Option B: D3.js v7**
- General-purpose data visualization; tree layout (`d3.tree()`) available
- Zoom/pan via `d3.zoom()` — requires manual implementation
- Dependency edges (non-tree) require custom SVG line drawing on top of tree layout
- Expand/collapse requires manual subtree show/hide logic with re-layout
- Tooltip, hover states — fully manual DOM manipulation
- Tradeoff: much more implementation code for the same outcome; higher risk of layout bugs

**Decision: Cytoscape.js v3.28** — the built-in graph model (nodes + arbitrary edges) directly maps to the FR requirements. Hierarchical layout (dagre) + dependency edges as non-hierarchical edges is a first-class Cytoscape use case. Estimated 60% less implementation code vs D3 for this specific feature set.

**Consequences:** CDN dependency on jsdelivr. SRI hash required. dagre + cytoscape-dagre are additional CDN dependencies (~43KB gzip total).

---

### ADR-02: Frontend Framework — Vanilla JS vs React (CDN)

**Context:** 8 components defined in UX spec. State includes project list, active project, graph state, and tooltip. No build step allowed.

**Option A: Vanilla JS (ES Modules)**
- No CDN framework overhead (~0 extra KB)
- ES Module imports for local files work natively in modern browsers
- State managed in `app.js` as a singleton with custom events
- DOM manipulation for sidebar/tooltip components is ~150 lines per component
- No virtual DOM diffing needed — the graph is managed entirely by Cytoscape; the sidebar has ≤50 items

**Option B: React via CDN (unpkg, no JSX)**
- ~45KB (gzip) for React + ReactDOM
- Without JSX, React components written in `React.createElement(...)` — verbose and hard to read
- With JSX, a transpilation step is needed (Babel CDN adds ~150KB) — violates "no build step"
- State management: `useState` / `useEffect` provide structure, but for this component count the overhead is not justified

**Decision: Vanilla JS (ES Modules)** — the component count (8) and state complexity (1 list + 1 active item + in-memory cache) do not justify React's overhead, especially without JSX. ES Modules provide sufficient code organization.

**Consequences:** Manual DOM updates in sidebar.js and tooltip.js. Custom event bus in app.js. No reactivity framework — state changes must explicitly call render functions.

---

### ADR-03: Project List Persistence — localStorage vs In-Memory

**Context:** The project list (registered projects) must survive page refresh (per UX Flow 2: returning user sees their projects). Artifact data (raw JSON) does not need to persist.

**Option A: localStorage**
- Survives page reload and browser restart
- Synchronous API — no async complexity
- ~5MB limit per origin — more than sufficient for project metadata (each entry ~200 bytes; 50 projects = ~10KB)
- Tradeoff: shared across tabs (acceptable for this use case)

**Option B: In-memory only (JavaScript object)**
- Lost on page reload — user must re-add projects every session
- Simpler implementation
- Tradeoff: violates the implicit user expectation that registered projects persist

**Decision: localStorage** — the product's primary value (sidebar with multiple registered projects) is meaningless if projects disappear on refresh. Artifact JSON is NOT persisted to localStorage — only the registry metadata (url, name, source, timestamps).

**Consequences:** `app.js` must read/write localStorage on every `addProject`/`removeProject`. `getProjects()` reads from localStorage on first call and caches in-memory for subsequent calls within the session.

---

### ADR-04: GitHub Branch Resolution — Fixed `main` vs Fallback Strategy

**Context:** GitHub repos use either `main` or `master` as default branch. Fetching `raw.githubusercontent.com/{owner}/{repo}/main/...` returns 404 for repos using `master`.

**Option A: Fixed `main` only**
- Simpler implementation, single fetch per file
- Breaks for all repos still on `master` branch

**Option B: Try `main`, fallback to `master`**
- Two sequential fetches only on `main` 404 (rare — most modern repos use `main`)
- Adds ~200ms latency for master-branch repos
- Covers both naming conventions without requiring user input

**Option C: Use GitHub API to determine default branch**
- Requires authenticated or rate-limited API call
- Adds complexity; rate limit of 60 req/hour for unauthenticated calls
- Tradeoff: violates the spirit of "simple client-side fetch"

**Decision: Option B (main → master fallback)** — acceptable latency tradeoff for broader compatibility. GitHub API (Option C) introduces rate limiting risk.

**Consequences:** loader.js `fetchGitHub()` first tries `/main/`, on 404 retries `/master/`, on second 404 throws `LoadError { code: "NO_ARTIFACTS" }`.

---

### ADR-05: Artifact Normalization — Derive Status from `.aitri` vs Trust Per-Node Status Fields

**Context:** The `01_REQUIREMENTS.json` schema does not include a `status` field per FR or US. Status must be derived from elsewhere.

**Option A: Derive status from `.aitri` pipeline state**
- `.aitri.approvedPhases`, `.aitri.completedPhases`, `.aitri.driftPhases`, `.aitri.currentPhase` encode which pipeline phases are in which state
- Phase 1 → FRs and USs; Phase 3 → Test Cases (approximate mapping)
- Tradeoff: coarse-grained — all FRs in a phase get the same status; individual FR status not tracked by Aitri today

**Option B: Use explicit `status` field in mock.json and future artifact extensions**
- Mock data defines `status` per node explicitly
- Real projects without per-node status fall back to deriving from `.aitri`
- Most flexible for POC — mock demonstrates full status variety; real data gracefully degrades

**Decision: Option B (explicit per-node status in data, `.aitri` as fallback)** — the normalizer checks for a `status` field on each artifact first; if missing, derives from `.aitri` pipeline state. This makes the mock data rich and the real-world behavior correct.

**Consequences:** normalizer.js implements a two-pass derivation. Mock data must include `status` fields per node.

---

### Failure Blast Radius

**Component: GitHub raw content fetch (`raw.githubusercontent.com`)**
- Blast radius: GitHub source projects cannot load; local source projects unaffected
- User impact: Canvas shows "Could not load project — Network error fetching GitHub artifacts"
- Recovery: User can retry by clicking the project in the sidebar. If GitHub is down, no recovery until service restores.

**Component: Node.js local server (`server.js`)**
- Blast radius: Local source projects cannot load; GitHub source projects unaffected (client-side fetch)
- User impact: Canvas shows "Could not load project — Server unavailable". Add-project form local path validation still works (client-side), but fetch to `/api/project` returns a network error.
- Recovery: User restarts `node server.js`. Previously registered GitHub projects continue to work.

**Component: localStorage**
- Blast radius: Project registry lost; sidebar shows empty state
- User impact: All registered projects disappear on next page load. App still fully functional for new registrations.
- Recovery: User re-adds projects. Artifact data is re-fetched normally.

**Component: Cytoscape.js CDN (jsdelivr)**
- Blast radius: Graph cannot initialize; entire app non-functional
- User impact: Blank canvas with no graph controls; browser console error on CDN load failure
- Recovery: No automatic recovery. Mitigation: SRI hash prevents serving of tampered scripts; pin to a specific Cytoscape version (v3.28.1) to avoid unexpected updates.

---

### Traceability Checklist

- [x] FR-001 — Graph render: `graph.js` GraphController.render() + `normalizer.js`
- [x] FR-002 — Status indicators: Cytoscape node stylesheet using `--status-*` tokens; `legend.js`
- [x] FR-003 — Zoom: Cytoscape native zoom + `controls.js` zoomIn/zoomOut
- [x] FR-004 — Pan: Cytoscape native pan (enabled by default); threshold of ±3px in click handler
- [x] FR-005 — Expand/collapse: `graph.js` collapsedChildren Map + Cytoscape remove/restore
- [x] FR-006 — Dependency edges: `normalizer.js` produces `edgeType: "dependency"` edges; styled as dashed orange in Cytoscape stylesheet
- [x] FR-007 — Tooltip: `tooltip.js` + Cytoscape `mouseover`/`mouseout` events
- [x] FR-008 — GitHub load: `loader.js` fetchGitHub() with main/master fallback
- [x] FR-009 — Local load: `server.js` GET /api/project + `loader.js` fetchLocal()
- [x] FR-010 — Sidebar: `sidebar.js` + `app.js` ProjectStore
- [x] FR-011 — Add project form: `sidebar.js` form with client-side validation regex
- [x] FR-012 — Fit/reset: `controls.js` fit() → `graph.js` GraphController.fit()
- [x] NFR-001 — Performance: Cytoscape batch render + dagre layout; 22 nodes << 200-node limit
- [x] NFR-002 — No build step: `node server.js` only; CDN for graph library
- [x] NFR-003 — No overlapping labels: dagre layout + node size defined in UX spec (11px labels, node widths accommodate text)
- [x] NFR-004 — Error handling: LoadError class with `.code`; all 3 error scenarios handled in `loader.js` + canvas error state in `graph.js`
- [x] NFR-005 — Path traversal: `..` check in `server.js` before any `fs` call
- [x] no_go_zone: No auth, no DB, no editor, no WebSocket, no private repos, no cloud — none present in this architecture
- [x] All ADRs have ≥2 options: ADR-01 (2), ADR-02 (2), ADR-03 (2), ADR-04 (3), ADR-05 (2)
- [x] Failure blast radius documented for 4 components
