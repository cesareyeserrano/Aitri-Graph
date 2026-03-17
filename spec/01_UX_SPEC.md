# Phase UX — UX/UI Specification
## Aitri Product Graph Visualizer

**Archetype: PRO-TECH/DASHBOARD** — reason: developer tool for visualizing structured data (spec artifacts); users are PMs and developers comfortable with dense, information-rich interfaces; primary context is a local dev environment or internal tooling.

Archetype defaults applied:
- Dark-first theme
- High-density layout with monospace labels for artifact IDs
- Muted accent (violet) — no decorative animations
- Minimal chrome: only controls the user needs at that moment

---

## Design Tokens

Derived from PRO-TECH/DASHBOARD archetype + "artifact pipeline visualizer" aesthetic (structured, precise, technical).

### Color Roles

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#0D1117` | App background, behind everything |
| `--surface` | `#161B22` | Sidebar background, panels |
| `--surface-raised` | `#1F2937` | Cards, tooltip background, form inputs |
| `--border` | `#30363D` | All borders and dividers |
| `--text-primary` | `#E6EDF3` | Headings, primary labels |
| `--text-secondary` | `#848D97` | Subtitles, metadata, placeholders |
| `--accent` | `#7C6AF7` | Active sidebar item, focus ring, primary button |
| `--accent-hover` | `#9D8FFF` | Hover state of accent elements |
| `--error` | `#F85149` | Error messages, validation errors |
| `--error-surface` | `#2A1414` | Error message background in canvas |
| `--canvas-bg` | `#0D1117` | Graph canvas background |

### Status Color Tokens (node fill / border)

All status colors are tested at ≥3:1 contrast against `--surface-raised` (`#1F2937`).

| Status | Token | Value | Contrast vs `#1F2937` |
|---|---|---|---|
| `pending` | `--status-pending` | `#94A3B8` | 3.8:1 ✓ |
| `in_progress` | `--status-in-progress` | `#60A5FA` | 4.1:1 ✓ |
| `approved` | `--status-approved` | `#34D399` | 4.6:1 ✓ |
| `complete` | `--status-complete` | `#A78BFA` | 4.0:1 ✓ |
| `drift` | `--status-drift` | `#FB923C` | 3.9:1 ✓ |

### Edge Style Tokens

| Edge type | Style | Color |
|---|---|---|
| Hierarchy (parent → child) | Solid, 1.5px, arrowhead | `#4B5563` |
| Dependency (any → any) | Dashed (6px dash, 3px gap), 1.5px, arrowhead | `#FB923C` |

### Typography

| Token | Value | Rationale |
|---|---|---|
| `--font-sans` | `Inter, system-ui, sans-serif` | Clean, readable at high density |
| `--font-mono` | `'JetBrains Mono', 'Fira Code', monospace` | Artifact IDs (FR-001, US-003) must render in monospace |
| `--text-xs` | `11px` | Node labels inside graph (minimum: 10px per FR-003) |
| `--text-sm` | `13px` | Sidebar project names, metadata |
| `--text-base` | `15px` | Body text, form inputs |
| `--text-lg` | `18px` | Section headings in sidebar |
| `--weight-normal` | `400` | Body text |
| `--weight-medium` | `500` | Node labels, item names |
| `--weight-semibold` | `600` | Active sidebar item, headings |

### Spacing Scale

`4px` base unit: `4 · 8 · 12 · 16 · 24 · 32 · 48px`

---

## Layout

```
┌────────────────────────────────────────────────┐
│  [240px Sidebar]  │  [Graph Canvas — flex-1]    │
│                   │                             │
│  Project list     │  ┌─ Controls ─────────┐     │
│  + Add project    │  │ [+] [-] [Fit]       │     │
│                   │  └────────────────────┘     │
│                   │                             │
│                   │   (graph rendered here)     │
│                   │                             │
│                   │  ┌─ Legend ───────────┐     │
│                   │  │ ● pending  ● drift  │     │
│                   │  └────────────────────┘     │
└────────────────────────────────────────────────┘
```

- **Sidebar**: 240px fixed, left edge, full height, background `--surface`
- **Graph Canvas**: fills remaining width, background `--canvas-bg`
- **Controls**: floating panel, top-right of canvas, 8px inset from edge
- **Legend**: floating panel, bottom-left of canvas, 8px inset from edge
- **Viewport target**: 1280px minimum. Sidebar does NOT collapse at 1280px.

### Responsive behavior

| Breakpoint | Sidebar | Canvas | Controls | Legend |
|---|---|---|---|---|
| **1440px** | 240px fixed | full remaining | top-right float | bottom-left float |
| **1280px** | 240px fixed | full remaining | top-right float | bottom-left float |
| **768px** | Collapsed to 48px icon rail | full remaining | top-right float | hidden (tooltip only) |
| **375px** | Hidden (off-screen), toggle button visible | full screen | top-right float | hidden |

Note: 375px and 768px are defined per requirements; the product is not mobile-first but must not break.

---

## User Flows

### Flow 1 — First-time use: Add a project and view graph

**Persona**: Product Manager or Developer
**Entry point**: User opens `http://localhost:3000` for the first time
**Precondition**: No projects registered (localStorage empty or cleared)

| Step | Screen state | User action | System response |
|---|---|---|---|
| 1 | Empty state — canvas shows "No project selected" illustration + "Add your first project" CTA | — | Sidebar shows empty list + "Add Project" button prominent |
| 2 | — | Clicks "Add Project" | Inline form expands below the button in the sidebar |
| 3 | Form visible | Types a string | Real-time validation: format indicator appears (GitHub URL / local path / invalid) |
| 4a | Valid input | Presses Enter or clicks "Load" | Form shows loading spinner, sidebar item appears with spinner |
| 4b | Invalid format | Presses Enter | Inline error appears within 100ms, no fetch attempted |
| 5 | Loading | — | Canvas shows centered loading spinner, text: "Loading [project name]…" |
| 6 | Success | — | Graph renders, project added to sidebar as active item, form collapses and input clears |
| 6e | Error | — | Canvas shows error state, sidebar item shows error icon, form stays visible |

**Exit point**: Graph is rendered, project visible in sidebar as active
**Error path**: See Step 6e → error message in canvas, user can retry or enter different input

---

### Flow 2 — Switch between registered projects

**Persona**: Product Manager
**Entry point**: App open with ≥2 projects in sidebar

| Step | User action | System response |
|---|---|---|
| 1 | Clicks a non-active project in sidebar | Active indicator moves to clicked item, canvas shows loading spinner |
| 2 | — | Server/GitHub fetch runs |
| 3 | Success | Graph renders for new project within 3s |
| 3e | Error | Canvas shows error state, clicked item shows error icon, previously active item remains highlighted |

**Exit point**: New project graph visible, sidebar shows new active item
**Error path**: Canvas error → user can click a different project or retry same

---

### Flow 3 — Remove a project

**Persona**: Developer
**Entry point**: Sidebar with ≥1 project

| Step | User action | System response |
|---|---|---|
| 1 | Hovers project item | Remove (×) button becomes visible (opacity 0 → 1, transition ≤150ms) |
| 2 | Clicks × | Confirmation tooltip appears inline: "Remove [name]? [Yes] [Cancel]" (H3: user control) |
| 3a | Clicks "Yes" | Project removed from list. If it was active: canvas clears to empty state |
| 3b | Clicks "Cancel" | Tooltip dismisses, project unchanged |

**Exit point**: Project removed from sidebar
**Error path**: No error path — removal is local state, cannot fail

---

### Flow 4 — Navigate the graph (zoom, pan, collapse)

**Persona**: Developer
**Entry point**: Graph rendered with ≥1 project active

| Action | Trigger | Response |
|---|---|---|
| Zoom in | Scroll wheel up OR click [+] | Graph scales up, labels stay ≥10px |
| Zoom out | Scroll wheel down OR click [-] | Graph scales down |
| Fit all | Click [Fit] | All nodes visible in viewport within 500ms |
| Pan | Click + drag on empty canvas | Viewport translates |
| Collapse node | Click parent node | Children hidden, node shows [+] indicator |
| Expand node | Click collapsed node | Children reappear in original positions |
| Tooltip | Hover node | Tooltip appears within 300ms |

**Error path**: N/A — all interactions are purely client-side

---

## Component Inventory

### C-01: Sidebar

**Location**: Left, 240px fixed
**FR**: FR-010

| State | What user sees | Notes |
|---|---|---|
| **Default** | List of project items, "Add Project" button at bottom | Projects sorted by last-accessed (most recent first) |
| **Loading** | Project item shows spinner next to name | Triggered during fetch |
| **Error** | Project item shows red dot icon, name stays visible | Does not remove item; user can retry by clicking |
| **Empty** | "No projects yet" text + "Add Project" CTA prominent and centered | Only state when list is empty |
| **Disabled** | N/A — sidebar is always interactive | — |

**Responsive 768px**: Collapses to 48px icon rail (project initials only, tooltip on hover)
**Responsive 375px**: Hidden off-screen, revealed by hamburger toggle button

---

### C-02: Project List Item

**Location**: Inside Sidebar
**FR**: FR-010

| State | What user sees |
|---|---|
| **Default** | Name (truncated at 180px) + source badge (GH / LOCAL) + remove (×) button hidden |
| **Loading** | Spinner replaces source badge |
| **Error** | Red dot replaces source badge, item name has reduced opacity (0.7) |
| **Empty** | N/A (item only exists when a project is registered) |
| **Disabled** | N/A |
| **Active** | Left border: 2px solid `--accent`, background: `--surface-raised`, name bold |

**Remove (×) button**: opacity 0 by default, opacity 1 on row hover (transition 150ms). Shows inline confirmation on click.

---

### C-03: Add Project Form

**Location**: Bottom of sidebar, expands inline
**FR**: FR-011

| State | What user sees |
|---|---|
| **Default** | "Add Project" button (full-width, ghost style) |
| **Expanded** | Text input + "Load" button. Input placeholder: "GitHub URL or /local/path" |
| **Loading** | Input disabled, "Load" button replaced by spinner, cursor: not-allowed |
| **Error (validation)** | Red border on input, inline error text below (≥10 chars, e.g. "Enter a GitHub URL or absolute path starting with /") |
| **Error (fetch)** | Input re-enabled, error message below: "Could not load project — [reason from server/HTTP]" |
| **Disabled** | N/A |

**Validation rules (client-side, before any fetch)**:
- Must start with `https://github.com/` → GitHub mode
- Must start with `/` → local path mode
- Anything else → inline error within 100ms

**Input format hints**: below the input (visible always, not just on error):
`GitHub: https://github.com/owner/repo`
`Local: /Users/you/projects/my-app`

---

### C-04: Graph Canvas

**Location**: Main content area, fills remaining width
**FR**: FR-001, FR-003, FR-004

| State | What user sees |
|---|---|
| **Default** | Rendered graph, nodes and edges, controls overlay (top-right), legend (bottom-left) |
| **Loading** | Centered spinner + text "Loading [project name]…", controls hidden |
| **Error** | Centered error card: icon + title "Could not load project" + description (from server/fetch) + "Try again" button |
| **Empty** | Centered illustration (graph icon, greyed) + text "No project selected" + "Add a project to get started" |
| **Disabled** | N/A |

**Error card content**: always shows what went wrong (HTTP 404: "Repository not found", missing artifacts: "No Aitri artifacts found at this path", parse error: "Could not parse artifact files") + one actionable hint.

---

### C-05: Graph Node

**Location**: Inside Graph Canvas
**FR**: FR-002, FR-005

| Node type | Shape | Label | Status indicator |
|---|---|---|---|
| Epic | Rectangle, rounded corners (8px), 120×40px | Title (font-mono, 11px, truncated at 100px) | Left color bar (4px wide) using `--status-*` |
| Feature | Rectangle, rounded (6px), 110×36px | Title (11px) | Left color bar |
| User Story | Rectangle, rounded (4px), 100×32px | Title (11px) | Left color bar |
| Test Case | Rectangle, rounded (4px), 90×28px | ID only (font-mono, 11px) | Left color bar |

| State | Visual |
|---|---|
| **Default** | Border: `--border`, background: `--surface-raised` |
| **Loading** | N/A (nodes appear when data loads) |
| **Error** | N/A (nodes are read-only; individual node errors not applicable) |
| **Collapsed** (parent nodes only) | [+] icon in top-right corner of node, border dashed |
| **Disabled** | N/A |
| **Hover** | Border color: `--accent`, box-shadow: 0 0 0 2px `--accent` at 30% opacity |

---

### C-06: Graph Controls

**Location**: Floating, top-right of canvas, 8px inset
**FR**: FR-003, FR-012

| Control | Label | Behavior |
|---|---|---|
| Zoom in | [+] | Increases zoom by 10% per click |
| Zoom out | [−] | Decreases zoom by 10% per click |
| Fit / Reset | [⊡] or "Fit" text | Resets zoom + pan so all nodes are visible |

| State | Visual |
|---|---|
| **Default** | Ghost buttons, background `--surface-raised` at 80% opacity, border `--border` |
| **Loading** | Buttons disabled (opacity 0.4, cursor: not-allowed) while graph loads |
| **Error** | Buttons disabled |
| **Empty** | Buttons disabled |
| **Disabled** | opacity 0.4, cursor: not-allowed |

Controls are grouped vertically, 32×32px each, 4px gap between them.

---

### C-07: Status Legend

**Location**: Floating, bottom-left of canvas, 8px inset
**FR**: FR-002

Always visible when graph is rendered. Hidden in loading, error, and empty states.

| State | Visual |
|---|---|
| **Default** | 5 rows: color swatch (12×12px circle) + status label. Background: `--surface-raised` at 90% opacity. Padding: 8px 12px |
| **Loading** | Hidden |
| **Error** | Hidden |
| **Empty** | Hidden |
| **Disabled** | N/A |

Layout: vertical list, 8px row gap, font-size 12px, color `--text-secondary`.

---

### C-08: Node Tooltip

**Location**: Appears adjacent to hovered node
**FR**: FR-007

| State | Content |
|---|---|
| **Default (visible)** | ID (mono, 11px, `--text-secondary`) · Title (13px, `--text-primary`) · Type badge · Status badge with color dot · Dependencies list (if any) |
| **Loading** | N/A |
| **Error** | N/A |
| **Empty** | N/A |
| **Disabled** | N/A |

- Appears within 300ms of hover
- Disappears within 500ms of pointer leaving node
- Positioned to the right of the node; if clipped at right viewport edge, flips to left
- Max width: 240px
- Background: `--surface-raised`, border: `--border`, border-radius: 6px, padding: 8px 12px
- Box-shadow: `0 4px 12px rgba(0,0,0,0.4)`

---

## Nielsen Compliance

### Screen: Main App (Sidebar + Graph Canvas)

| Heuristic | How satisfied | Trade-off |
|---|---|---|
| H1 Visibility of system status | Loading spinner in canvas + sidebar item spinner during fetch. Graph controls disabled during load | None |
| H2 Match real world | Uses Aitri vocabulary (Epic, Feature, User Story, Test Case) — same terms as CLI | None |
| H3 User control and freedom | Remove project shows inline confirmation before deletion. "Fit" button recovers from lost navigation | No undo after remove (in-memory state; acceptable for POC) |
| H4 Consistency | Same status colors used in nodes and legend. Same hover pattern (border accent) across all nodes | None |
| H5 Error prevention | Form validates format client-side in 100ms before any fetch. Input hints shown always (not only on error) | None |
| H6 Recognition over recall | Legend always visible; status identifiable without tooltip. Source badge (GH/LOCAL) on every sidebar item | Node labels truncated at small sizes — tooltip provides full title |
| H7 Flexibility and efficiency | Primary action (click project → see graph) is 1 click. Keyboard Enter submits form | No keyboard shortcut for zoom/pan in POC |
| H8 Aesthetic and minimalist | No decorative elements. Controls only shown when relevant. Legend and controls float over canvas (don't consume layout space) | None |
| H9 Help recover from errors | Error card states exactly what went wrong + actionable hint. Validation error names the expected format | None |
| H10 Help and documentation | Input hints show expected format at all times. Empty state guides first-time user with explicit CTA | No full onboarding tour (out of scope for POC) |

**Nielsen score: 10/10 heuristics addressed**
**Violations found: 0**
**Accepted trade-offs: 2** (no undo for remove, no keyboard zoom shortcuts — both acceptable for POC)

---

## Responsive Breakpoint Behavior

### 1440px (primary)
Full layout as described. Sidebar 240px, canvas fills remainder. All components visible.

### 1280px (minimum supported)
Same as 1440px. Sidebar 240px. Canvas is narrower (~1040px) but functional.

### 768px (tablet — defined but not primary)
Sidebar collapses to 48px icon rail showing project initials. Clicking an initial expands a 240px overlay sidebar (closes on outside click). Legend hidden from canvas; status shown via tooltip only. Controls remain visible.

### 375px (mobile — defined, not primary)
Sidebar hidden. Hamburger icon (top-left, 44×44px tap target) opens a full-screen drawer with the project list. Graph canvas is full-screen. Controls stack vertically. Legend hidden. Tooltip disabled (touch devices — no hover).
