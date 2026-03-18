# Phase 2 — System Architecture
## artifact-cards feature — Aitri Product Graph Visualizer

---

## Executive Summary

The artifact-cards feature adds a **CardManager** module (`js/cards.js`) to the existing vanilla JS frontend. No new server endpoints, no new dependencies. Cards are fixed-position DOM overlays rendered from in-memory artifact data already loaded by the graph. The Cytoscape tap event is extended to call CardManager alongside the existing collapse/expand handler — both fire independently.

**Stack additions:** 1 new JS module (`js/cards.js`) + 1 new CSS file (`css/cards.css`). Zero npm dependencies added.

---

## System Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  Browser (localhost:3000)                                           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  index.html                                                  │   │
│  │  <link rel="stylesheet" href="css/cards.css">               │   │
│  │  <script type="module" src="js/cards.js">                   │   │
│  └──────────────────────────────┬──────────────────────────────┘   │
│                                 │                                   │
│  ┌──────────────────────────────▼──────────────────────────────┐   │
│  │  js/graph.js  (existing — extended)                          │   │
│  │                                                              │   │
│  │  cy.on('tap', 'node', (evt) => {                            │   │
│  │    toggleCollapse(evt.target);          // existing          │   │
│  │    CardManager.toggle(evt.target);      // NEW               │   │
│  │  });                                                         │   │
│  └──────────────────────────────┬──────────────────────────────┘   │
│                                 │                                   │
│  ┌──────────────────────────────▼──────────────────────────────┐   │
│  │  js/cards.js  — CardManager (NEW)                            │   │
│  │                                                              │   │
│  │  openCards: Map<nodeId, HTMLElement>                         │   │
│  │  cascadeCount: number                                        │   │
│  │                                                              │   │
│  │  toggle(cyNode)                                              │   │
│  │  ├─ if open → close(nodeId)                                 │   │
│  │  └─ if closed → open(nodeId, data, renderedPosition)        │   │
│  │                                                              │   │
│  │  open(nodeId, data, pos)                                     │   │
│  │  ├─ renderCard(data) → HTMLElement                           │   │
│  │  ├─ computePosition(pos, cascadeCount) → {left, top}        │   │
│  │  ├─ clampToViewport({left, top}, cardEl) → {left, top}      │   │
│  │  ├─ apply position → el.style.left/top                      │   │
│  │  ├─ append to document.body                                  │   │
│  │  └─ openCards.set(nodeId, el)                               │   │
│  │                                                              │   │
│  │  close(nodeId)                                               │   │
│  │  ├─ el.remove()                                              │   │
│  │  └─ openCards.delete(nodeId)                                 │   │
│  │                                                              │   │
│  │  renderCard(data) → HTMLElement                              │   │
│  │  ├─ header: id · title · status badge · X button            │   │
│  │  └─ body: fields (conditional, no empty rows)               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  css/cards.css  (NEW)                                        │   │
│  │  CSS custom properties: --card-bg, --card-border, etc.      │   │
│  │  Reuses --status-* tokens already defined in css/graph.css  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  DOM: document.body                                          │   │
│  │  Cards appended as direct children of body                  │   │
│  │  position: fixed — immune to graph canvas scroll/transform  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

| Component | File | Responsibility |
|---|---|---|
| CardManager | `js/cards.js` | State (openCards Map), open/close/toggle, render, position, cascade |
| Card styles | `css/cards.css` | Layout, tokens, status badge colors, responsive overrides |
| Graph integration | `js/graph.js` (existing) | Extend tap handler to call `CardManager.toggle()` |
| HTML shell | `index.html` (existing) | Add `<link>` for cards.css and `<script>` for cards.js |

---

## Algorithm Specifications

### 1. Card positioning

```
CARD_WIDTH = 320         // px, from UX spec
CASCADE_OFFSET = 24      // px per card, from UX spec
MARGIN = 8               // minimum distance from viewport edge

function computePosition(nodeScreenPos, cascadeCount):
  // nodeScreenPos: {x, y} in screen pixels (from cy.node.renderedPosition())
  left = nodeScreenPos.x + 16 + (cascadeCount * CASCADE_OFFSET)
  top  = nodeScreenPos.y      + (cascadeCount * CASCADE_OFFSET)
  return {left, top}

function clampToViewport(pos, cardEl):
  cardH = cardEl.getBoundingClientRect().height  // measured after append
  left  = min(pos.left, window.innerWidth  - CARD_WIDTH - MARGIN)
  left  = max(left, MARGIN)
  top   = min(pos.top,  window.innerHeight - cardH - MARGIN)
  top   = max(top, MARGIN)
  return {left, top}

function getCascadeCount():
  count = openCards.size  // 0-indexed: 0 = no offset, 1 = first cascade, etc.
  maxCascade = floor((window.innerWidth - CARD_WIDTH - MARGIN - MARGIN) / CASCADE_OFFSET)
  return count % (maxCascade + 1)  // wrap around when overflow would occur
```

**Why getBoundingClientRect after append:** Card height depends on artifact content. Height is not known before render. Append → measure → clamp is the correct order. Card is appended off-screen (left: -9999px) first, measured, then repositioned.

### 2. Field rendering

```
STANDARD_FIELDS = ['id', 'title', 'description', 'priority', 'type',
                   'status', 'acceptance_criteria', 'implementation_level']

function renderBody(data):
  for each field in STANDARD_FIELDS (excluding 'id', 'title', 'status' — shown in header):
    if data[field] is undefined → skip (no empty row)
    if data[field] is Array → render as <ul> list
    else → render as label + value row

  EXTRA_FIELDS = Object.keys(data).filter(k => !STANDARD_FIELDS.includes(k))
  for each field in EXTRA_FIELDS:
    render as label + value row (JSON.stringify if object/array)
```

### 3. Status badge

```
STATUS_COLORS = {
  pending:     { bg: '#94a3b8', text: '#0f172a' },
  in_progress: { bg: '#f59e0b', text: '#0f172a' },
  approved:    { bg: '#22c55e', text: '#0f172a' },
  complete:    { bg: '#3b82f6', text: '#ffffff' },
  drift:       { bg: '#ef4444', text: '#ffffff' },
}

// These MUST match the values in css/graph.css --status-* tokens.
// Single source of truth: define as JS constants in cards.js,
// and also export for use in graph.js stylesheet (or duplicate with comment).
```

---

## ADR-001: Card DOM attachment point

**Decision:** Append cards to `document.body`

**Option A — Append to `document.body`** ✅ chosen
- Cards use `position: fixed` → coordinates relative to viewport, unaffected by any parent's transform or overflow settings.
- Cytoscape canvas uses CSS transforms for pan/zoom — any card inside the canvas container would move with the graph. Attaching to body avoids this entirely.
- Simple DOM management: `document.body.appendChild(card)`, `card.remove()`.

**Option B — Append to a dedicated `#card-layer` div inside the app container**
- Would require the card-layer to have `position: fixed; inset: 0; pointer-events: none` with cards inside having `pointer-events: auto`.
- Extra DOM complexity for no benefit over Option A.
- **Rejected:** unnecessary indirection.

---

## ADR-002: Card state storage

**Decision:** `Map<nodeId, HTMLElement>` in CardManager module scope

**Option A — `Map<nodeId, HTMLElement>`** ✅ chosen
- O(1) lookup by nodeId for toggle (is this card open?).
- Direct reference to HTMLElement enables `el.remove()` without DOM query.
- Module-scoped — no global pollution.

**Option B — `Array<{nodeId, el}>` with linear search**
- O(n) lookup — acceptable for n < 20 but unnecessary complexity.
- **Rejected:** no advantage over Map.

**Option C — Store in dataset on the Cytoscape node (`cy.node.data('cardEl')`)**
- Couples card state to graph state — violates separation of concerns.
- Cytoscape data should contain artifact data, not DOM references.
- **Rejected:** incorrect layer coupling.

---

## ADR-003: Cascade offset strategy

**Decision:** Fixed increment with modulo wrap

**Option A — Fixed increment with modulo wrap** ✅ chosen
- `offset = (openCards.size % maxCascade) * CASCADE_OFFSET`
- Deterministic and simple. Wraps to initial anchor when overflow would occur.
- No collision detection needed — cards may coincide at wrap boundary (acceptable per FR-020 AC: "resets to initial anchor position").

**Option B — Smart placement (find first non-overlapping position)**
- Requires checking bounding rect of every open card on each new open.
- O(n²) in worst case. Significant complexity for a POC.
- **Rejected:** over-engineered for the stated requirement.

---

## ADR-004: Graph.js integration — tap handler extension

**Decision:** Extend existing `cy.on('tap', 'node')` handler in graph.js

**Option A — Extend existing handler in graph.js** ✅ chosen
- Single tap handler per node — no event listener proliferation.
- `toggleCollapse(evt.target)` and `CardManager.toggle(evt.target)` are sequential calls in the same handler.
- Clean: both behaviors are co-located, easy to reason about their interaction.

**Option B — Register a second `cy.on('tap', 'node')` in cards.js**
- Both handlers would fire (Cytoscape allows multiple listeners).
- Decoupled: cards.js doesn't need to be aware of graph.js internals.
- **Rejected:** two tap handlers for the same event on the same element is harder to debug. Execution order is not guaranteed across listeners.

---

## Failure Modes & Blast Radius

| Failure | Impact | Mitigation |
|---|---|---|
| Artifact data missing required field | Card renders with available fields; missing fields silently omitted | Conditional render per field (no crash) |
| Artifact data is null/undefined | Card shows error state: node id + "Could not load artifact data" | Try/catch in renderCard(); error state defined in UX spec |
| Card position computation overflow | Card clamped to viewport margin (MARGIN = 8px) — always visible | clampToViewport() enforces min/max bounds |
| > 50 cards open (extreme case) | Cascade wraps — cards overlap at initial position. No crash. | Modulo wrap in getCascadeCount() |
| graph.js tap handler throws | CardManager.toggle() still fires if called before the throw; if after, card does not open | Sequential calls — order matters. toggleCollapse first, CardManager.toggle second. If collapse throws, card is not opened. Acceptable: collapse is the primary action. |

---

## API Contracts

### CardManager public interface

```js
// js/cards.js exports:

export const CardManager = {
  toggle(cyNode),     // Called from graph.js tap handler
  open(nodeId, artifactData, renderedPos),   // { x, y } screen coords
  close(nodeId),
  closeAll(),         // utility — not required by FRs but defensive
}
```

**cyNode:** Cytoscape node element. CardManager reads:
- `cyNode.id()` → string nodeId
- `cyNode.data()` → artifact data object (already in graph memory)
- `cyNode.renderedPosition()` → `{ x, y }` screen coordinates

No new server endpoints. No new HTTP calls. All data is in-memory.

---

## File Changes Summary

| File | Action | Change |
|---|---|---|
| `js/cards.js` | **CREATE** | CardManager module — full implementation |
| `css/cards.css` | **CREATE** | Card styles, tokens, responsive overrides |
| `index.html` | **MODIFY** | Add `<link>` for cards.css, `<script type="module">` for cards.js |
| `js/graph.js` | **MODIFY** | Import CardManager; extend tap handler to call `CardManager.toggle()` |

---

## Traceability Checklist

| FR | Addressed by |
|---|---|
| FR-013: Open card on click | CardManager.toggle() called from graph.js tap handler |
| FR-014: All fields in card | renderCard() + renderBody() field iteration algorithm |
| FR-015: Status badge matches graph | STATUS_COLORS constants shared with graph.css tokens |
| FR-016: Viewport boundary clamping | clampToViewport() algorithm |
| FR-017: Close via X button | X button event listener calls CardManager.close(nodeId) |
| FR-018: Multiple cards simultaneously | openCards Map — no limit enforced |
| FR-019: Graph navigation unaffected | Cards use position:fixed on body — no pointer-event capture on canvas |
| FR-020: Cascade offset | getCascadeCount() with modulo wrap |
| NFR-006: ≤16ms frame time with 5 cards | Cards are static DOM — no JS runs during pan/zoom, no reflow triggered |
| NFR-007: ≥280px width, ≥13px font | Enforced in cards.css |
| NFR-008: ≤40% canvas coverage | Not enforced programmatically — cascade offset + 320px card width makes 3 cards ≈ 25% of 1280×800 canvas; documented as design-time decision |

**no_go_zone compliance:**
- ❌ No editing from card → renderCard() generates read-only HTML, no input elements
- ❌ No persistence → openCards Map is not written to localStorage
- ❌ No mobile optimization → CSS has 375px override (no-break only)
- ❌ Tooltip not replaced → FR-007 hover handler in graph.js is untouched
- ❌ No drag-to-reposition → cards have no mousedown/drag handler

---

## Data Model

Cards are transient — no persistence layer. All data originates from the in-memory artifact store already loaded by the graph.

### CardState (in-memory only)

```
openCards: Map<nodeId: string, el: HTMLElement>
cascadeCount: number  // derived from openCards.size at open time
```

### ArtifactData (passed from Cytoscape node.data())

```
{
  id: string,                        // required
  title: string,                     // required
  status: string,                    // required: pending|in_progress|approved|complete|drift
  description?: string,
  priority?: string,                 // MUST|SHOULD|NICE
  type?: string,                     // UX|logic|persistence|security|reporting
  acceptance_criteria?: string[],
  implementation_level?: string,
  [extraKey: string]: any            // any additional fields rendered dynamically
}
```

No schema validation is performed — fields are rendered if present, omitted if absent. No data is written or transformed.

---

## API Design

This feature introduces **no new server endpoints**. All data is client-side:

- Artifact data: already in Cytoscape node memory (`cyNode.data()`)
- Node screen position: `cyNode.renderedPosition()` — Cytoscape built-in
- Card state: `openCards` Map in `js/cards.js` module scope

**Existing endpoint unchanged:** `GET /api/project?path=...` continues to serve artifact data to the graph. CardManager reads from the already-loaded graph nodes — no additional HTTP calls.

---

## Security Design

**XSS prevention:** All artifact field values are set via `textContent` or `innerText`, never `innerHTML`. No field value is interpolated into HTML strings.

```js
// Safe:
el.textContent = data.title;

// Never:
el.innerHTML = `<span>${data.title}</span>`;  // XSS risk if title contains <script>
```

**No new attack surface:** No new endpoints, no new user input fields, no eval, no dynamic script loading.

**Pointer event isolation:** Cards use `pointer-events: auto` on the card element and `pointer-events: none` is NOT applied to the canvas — cards simply overlay it. Clicks on empty canvas areas pass through to Cytoscape normally because card elements only cover their own bounding box.

---

## Performance & Scalability

**Rendering cost:** `renderCard()` creates ~15–30 DOM nodes per card. At 5 open cards: ~150 nodes added to document.body. Negligible for browser rendering.

**Pan/zoom frame time:** Cards use `position: fixed` — they are not part of the Cytoscape canvas subtree. Pan/zoom triggers Cytoscape's internal transform on the canvas element only. Cards do not reflow or repaint during pan/zoom. NFR-006 (≤16ms frame time) is satisfied by design.

**getBoundingClientRect:** Called once per card open, after DOM append. Not called during pan/zoom or any animation loop. O(1), no performance concern.

**Memory:** Each open card holds ~1KB of DOM nodes. 50 open cards = ~50KB — negligible. openCards Map holds HTMLElement references; GC cleans up on `el.remove()` + `openCards.delete()`.

**Scalability:** This is a localhost desktop tool with a single user. No concurrency, no server load considerations.

---

## Deployment Architecture

No changes to deployment architecture. The feature is purely frontend:

- `js/cards.js` and `css/cards.css` are served as static files by the existing `server.js` (`GET /*` static file handler).
- No new Docker configuration required.
- No new environment variables.
- `node server.js` continues to be the only start command.

Existing `DEPLOYMENT.md` and `Dockerfile` remain valid without modification.

---

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Cytoscape tap event fires before CardManager is imported | Low — ES module load order is deterministic | High — cards would not open | Import CardManager at top of graph.js; ES module guarantees sync resolution |
| artifact data fields contain `<script>` or HTML injection | Low — data comes from local JSON files | High — XSS | All field values set via `textContent`, never `innerHTML` |
| Card overflow on very small viewports (<1280px) | Medium — not a supported use case but possible | Low — card partially off-screen | clampToViewport() enforces MARGIN=8px on all edges; worst case is card touching viewport edge |
| Too many open cards degrading DOM performance | Very low — no realistic use case exceeds 10 cards | Low — minor jank | No mitigation needed; acceptable degradation |
| Status color mismatch between card badge and graph node | Low — same JS constants used | Medium — visual inconsistency | STATUS_COLORS defined once in cards.js; graph.js imports or mirrors from same source |
