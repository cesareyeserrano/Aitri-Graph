# Aitri Graph — Backlog

> Open items only. Closed items go in CHANGELOG.md.
> Priority: P1 (critical) / P2 (important) / P3 (nice to have)

---

## Open

- [ ] P3 — **Persistent project registry** — Graph does not remember projects between browser sessions. Users must re-add projects every time they open the app. `localStorage` is the only current persistence, which breaks when the browser clears storage or a different browser is used.

  Problem: Multi-project teams re-add the same 5+ projects on every session. Friction kills daily use.

  Files:
  - `server.js` — add `GET /api/registry` (returns `~/.aitri-graph/projects.json`); add `POST /api/registry` (adds a project entry); add `DELETE /api/registry/:id` (removes a project)
  - `js/sidebar.js` — on startup, call `GET /api/registry` and pre-populate sidebar with saved projects
  - `js/app.js` — on project add/remove, call `POST`/`DELETE /api/registry` to persist; keep `localStorage` as fallback for browser-only use (no server)

  Behavior:
  - Server creates `~/.aitri-graph/projects.json` on first write if absent
  - Schema: `{ "projects": [{ "id": "string", "name": "string", "source": "local|github|demo", "url": "string", "addedAt": "ISO8601" }] }`
  - On app load: fetch registry, render all saved projects in sidebar, auto-load the last active project
  - `localStorage` entries (existing behavior) remain as fallback if server is unreachable
  - No changes to `loader.js` — local/GitHub loading logic unchanged

  Decisions:
  - Graph owns `~/.aitri-graph/` — no dependency on Aitri Core or Hub registries
  - `id` generated as `crypto.randomUUID()` or sha256 of `url` (8 chars)
  - Max 50 projects in registry (configurable via `AITRI_GRAPH_MAX_PROJECTS` env var)

  Acceptance:
  - Add a GitHub project in Graph UI → close browser → reopen → project appears in sidebar
  - Add a local project → server writes to `~/.aitri-graph/projects.json` → verify file contents
  - Remove a project → entry removed from registry file
  - Server unreachable: sidebar falls back to `localStorage`, no crash

- [ ] P3 — **Local project change detection (polling)** — Graph loads artifacts on user request. It does not detect when the pipeline advances while the app is open. A developer runs `aitri approve 1` and must manually refresh to see updated node states.

  Problem: Graph is meant to be a live view of the pipeline. Without change detection it's a static snapshot tool.

  Files:
  - `server.js` — add `GET /api/project/status?path=<dir>` returning `{ updatedAt: string, currentPhase: number }` (reads `.aitri`, returns only these two fields — lightweight)
  - `js/app.js` — when a local project is active, poll `GET /api/project/status` every 30s; if `updatedAt` changed since last load, trigger full artifact reload and re-render
  - `js/graph.js` — support re-render without full re-layout (update node state colors/labels in place; only re-layout if new nodes appear)

  Behavior:
  - Polling only for `source: "local"` projects — GitHub projects continue on-demand (fetch cost is not free)
  - Poll interval: 30s default, not configurable in this version
  - On change detected: reload `01_REQUIREMENTS.json`, `03_TEST_CASES.json`, `.aitri` from server; re-derive node states; update graph in place
  - Poll fails (server down, project moved): stop polling silently, show stale-data indicator in sidebar
  - Tab hidden (`document.visibilityState === "hidden"`): pause polling; resume on tab focus

  Decisions:
  - Compare `updatedAt` string from `.aitri` — same mechanism Hub uses for local projects. No git SHA needed for this version.
  - Full artifact reload on change (not incremental) — simpler; artifact files are small
  - GitHub change detection deferred: would require server-side git SHA check or GitHub API calls — out of scope here

  Acceptance:
  - Open Graph with a local project active
  - Run `aitri approve 1` in terminal
  - Within 30s, Graph updates requirements nodes to `approved` state without manual refresh
  - Run `aitri run-phase 1` (creates drift): within 30s, nodes show `drift` state
  - Close laptop lid for 10 min (tab hidden): no poll requests sent during that time

---

## Integration Contract

Graph reads `.aitri` schema and artifact schemas per the canonical contract:
- [SCHEMA.md](https://github.com/cesareyeserrano/aitri/blob/main/docs/integrations/SCHEMA.md) — `.aitri` fields and semantics
- [ARTIFACTS.md](https://github.com/cesareyeserrano/aitri/blob/main/docs/integrations/ARTIFACTS.md) — `spec/` file schemas and node hierarchy

Update `js/normalizer.js` whenever the Aitri contract changelog records a breaking change.
