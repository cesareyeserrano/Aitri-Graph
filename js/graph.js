/**
 * GraphRenderer — Cytoscape.js wrapper.
 * Handles: hierarchical layout (dagre), node styling, zoom/pan,
 * expand/collapse, dependency edges, tooltip.
 * @aitri-trace FR-ID: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-012
 */

const STATUS_COLORS = {
  pending:     '#94A3B8',
  in_progress: '#60A5FA',
  approved:    '#34D399',
  complete:    '#A78BFA',
  drift:       '#FB923C',
};

const NODE_SIZES = {
  epic:       { width: 130, height: 44 },
  feature:    { width: 118, height: 38 },
  user_story: { width: 108, height: 34 },
  test_case:  { width: 96,  height: 28 },
};

const ZOOM_STEP = 0.10; // 10% per click
const ZOOM_THROTTLE_MS = 16;   // ~60fps
const PAN_THRESHOLD     = 3;    // px — click-without-drag tolerance
const FIT_PADDING       = 40;   // px — viewport padding on fit
const FONT_SIZE_FLOOR   = 10;   // px — minimum readable label size at any zoom
const TOOLTIP_SHOW_DELAY = 0;   // instantaneous (Cytoscape fires at mouseover)
const TOOLTIP_HIDE_DELAY = 300; // ms

/**
 * Initialize Cytoscape in the given container.
 * Returns a GraphController.
 * @aitri-trace FR-ID: FR-003, FR-004
 */
export function initGraph(container) {
  const cy = window.cytoscape({
    container,
    elements: [],
    style: buildStylesheet(),
    layout: { name: 'preset' },
    minZoom: 0.1,
    maxZoom: 5,
    wheelSensitivity: 0.3,
    boxSelectionEnabled: false,
    selectionType: 'single',
    userZoomingEnabled: true,    // FR-003
    userPanningEnabled: true,    // FR-004
    autoungrabify: true,         // nodes not draggable (read-only)
  });

  // Expand/collapse state: Map<nodeId, removedElements>
  const collapsedState = new Map();

  // ── FR-005 fix: expand all collapsed descendants before collapsing parent
  function expandDescendantsOf(node) {
    cy.edges(`[edgeType = "hierarchy"][source = "${node.id()}"]`).targets().forEach(child => {
      if (child.hasClass('collapsed')) {
        const saved = collapsedState.get(child.id());
        if (saved) saved.restore();
        collapsedState.delete(child.id());
        child.removeClass('collapsed');
      }
      expandDescendantsOf(child);
    });
  }

  // ── Expand/Collapse (FR-005) ──────────────────────────────────
  cy.on('tap', 'node', function (evt) {
    const node = evt.target;

    // Check collapse first — descendants are removed when collapsed,
    // so getDescendants() would return empty and exit early if checked before this.
    if (node.hasClass('collapsed')) {
      const saved = collapsedState.get(node.id());
      if (saved) saved.restore();
      collapsedState.delete(node.id());
      node.removeClass('collapsed');
      return;
    }

    const descendants = getDescendants(cy, node);
    if (descendants.length === 0) return; // leaf node — no behavior (TC-005f)

    // Expand any nested collapsed descendants first (FR-005 debt fix)
    expandDescendantsOf(node);
    // Collapse parent — re-get descendants after inner expansions
    collapsedState.set(node.id(), getDescendants(cy, node).remove());
    node.addClass('collapsed');
  });

  // ── FR-004 fix: ±3px no-pan threshold on background click ─────
  let panStart = null;
  let panPosAtStart = null;
  cy.on('mousedown', evt => {
    if (evt.target !== cy) return; // only on background
    panStart = { x: evt.originalEvent.clientX, y: evt.originalEvent.clientY };
    panPosAtStart = { ...cy.pan() };
  });
  cy.on('mouseup', evt => {
    if (panStart && evt.target === cy) {
      const dx = evt.originalEvent.clientX - panStart.x;
      const dy = evt.originalEvent.clientY - panStart.y;
      if (Math.sqrt(dx * dx + dy * dy) <= PAN_THRESHOLD) cy.pan(panPosAtStart);
    }
    panStart = null;
    panPosAtStart = null;
  });

  // ── FR-003 fix: enforce 10px font-size floor at all zoom levels ─
  let zoomThrottle = null;
  cy.on('zoom', () => {
    if (zoomThrottle) return;
    zoomThrottle = setTimeout(() => {
      zoomThrottle = null;
      const zoom = cy.zoom();
      cy.batch(() => {
        const fs = base => Math.max(FONT_SIZE_FLOOR / zoom, base) + 'px';
        cy.nodes('[type = "epic"]').style('font-size', fs(12));
        cy.nodes('[type = "feature"]').style('font-size', fs(11));
        cy.nodes('[type = "user_story"]').style('font-size', fs(11));
        cy.nodes('[type = "test_case"]').style('font-size', fs(10));
      });
    }, ZOOM_THROTTLE_MS);
  });

  // ── Tooltip (FR-007) ──────────────────────────────────────────
  const tooltip = document.getElementById('node-tooltip');
  let hideTimer = null;

  cy.on('mouseover', 'node', function (evt) {
    clearTimeout(hideTimer);
    const node = evt.target;
    renderTooltip(tooltip, node.data());
    tooltip.classList.add('visible');
    positionTooltip(tooltip, evt.renderedPosition, container);
  });

  cy.on('mousemove', 'node', function (evt) {
    positionTooltip(tooltip, evt.renderedPosition, container);
  });

  cy.on('mouseout', 'node', function () {
    hideTimer = setTimeout(() => {
      tooltip.classList.remove('visible');
    }, TOOLTIP_HIDE_DELAY);
  });

  cy.on('tap', function () {
    clearTimeout(hideTimer);
    tooltip.classList.remove('visible');
  });

  // ── GraphController ───────────────────────────────────────────

  return {
    /**
     * Replace graph with new data and run dagre layout.
     * @aitri-trace FR-ID: FR-001, TC-ID: TC-001h
     */
    render(graphData) {
      collapsedState.clear();
      cy.elements().remove();

      const elements = [
        ...graphData.nodes.map(n => ({
          group: 'nodes',
          data: {
            id: n.id,
            label: n.label,
            fullTitle: n.fullTitle,
            type: n.type,
            status: n.status,
            parentId: n.parentId,
            dependencies: n.dependencies,
            statusColor: STATUS_COLORS[n.status] ?? STATUS_COLORS.pending,
            ...NODE_SIZES[n.type],
          },
        })),
        ...graphData.edges.map(e => ({
          group: 'edges',
          data: {
            id: e.id,
            source: e.source,
            target: e.target,
            edgeType: e.edgeType,
          },
        })),
      ];

      cy.add(elements);

      cy.layout({
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 24,
        rankSep: 48,
        edgeSep: 10,
        fit: true,
        padding: FIT_PADDING,
        animate: false,
      }).run();
    },

    clear() {
      collapsedState.clear();
      cy.elements().remove();
    },

    /** @aitri-trace FR-ID: FR-003, TC-ID: TC-003e */
    zoomIn() {
      cy.zoom({ level: cy.zoom() * (1 + ZOOM_STEP), renderedPosition: canvasCenter(container) });
    },

    /** @aitri-trace FR-ID: FR-003 */
    zoomOut() {
      cy.zoom({ level: cy.zoom() * (1 - ZOOM_STEP), renderedPosition: canvasCenter(container) });
    },

    /** @aitri-trace FR-ID: FR-012, TC-ID: TC-012h */
    fit() {
      cy.fit(undefined, FIT_PADDING);
    },

    destroy() {
      cy.destroy();
    },

    /** Expose cy for tests */
    _cy: cy,
    /** Expose collapse state for tests */
    _collapsedState: collapsedState,
  };
}

// ── Stylesheet ────────────────────────────────────────────────────

function buildStylesheet() {
  return [
    // ── Base node ──
    {
      selector: 'node',
      style: {
        'shape': 'round-rectangle',
        'width': 'data(width)',
        'height': 'data(height)',
        'background-color': '#1F2937',
        'border-width': 3,
        'border-color': 'data(statusColor)',
        'label': 'data(label)',
        'color': '#E6EDF3',
        'font-size': 11,
        'font-family': "'JetBrains Mono', 'Fira Code', monospace",
        'font-weight': 500,
        'text-valign': 'center',
        'text-halign': 'center',
        'text-overflow-wrap': 'none',
        'text-max-width': 'data(width)',
      },
    },
    // ── Node type overrides ──
    {
      selector: 'node[type = "epic"]',
      style: {
        'font-size': 12,
        'font-weight': 600,
        'border-width': 4,
      },
    },
    {
      selector: 'node[type = "test_case"]',
      style: {
        'font-size': 10,
        'font-weight': 400,
        'color': '#848D97',
      },
    },
    // ── Hover ──
    {
      selector: 'node:active',
      style: {
        'border-color': '#7C6AF7',
        'overlay-opacity': 0,
      },
    },
    // ── Collapsed ──
    {
      selector: 'node.collapsed',
      style: {
        'border-style': 'dashed',
        'border-color': '#848D97',
      },
    },
    // ── Hierarchy edges ──
    {
      selector: 'edge[edgeType = "hierarchy"]',
      style: {
        'line-color': '#4B5563',
        'target-arrow-color': '#4B5563',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.8,
        'curve-style': 'bezier',
        'width': 1.5,
        'line-style': 'solid',
      },
    },
    // ── Dependency edges ──
    {
      selector: 'edge[edgeType = "dependency"]',
      style: {
        'line-color': '#FB923C',
        'target-arrow-color': '#FB923C',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.8,
        'curve-style': 'unbundled-bezier',
        'width': 1.5,
        'line-style': 'dashed',
        'line-dash-pattern': [6, 3],
      },
    },
  ];
}

// ── Expand/Collapse helpers ───────────────────────────────────────

/**
 * Get all descendant nodes (recursive, via hierarchy edges).
 * @aitri-trace FR-ID: FR-005, TC-ID: TC-005h, TC-005e, TC-005f
 */
function getDescendants(cy, node) {
  let result = cy.collection();
  const directChildren = cy.edges(`[edgeType = "hierarchy"][source = "${node.id()}"]`).targets();
  directChildren.forEach(child => {
    result = result.union(child).union(getDescendants(cy, child));
  });
  return result;
}

// ── Tooltip helpers ───────────────────────────────────────────────

/**
 * @aitri-trace FR-ID: FR-007, TC-ID: TC-007h, TC-007e
 */
function renderTooltip(el, data) {
  const statusColor = STATUS_COLORS[data.status] ?? STATUS_COLORS.pending;
  const deps = (data.dependencies ?? []);

  el.innerHTML = `
    <div class="tt-id">${escHtml(data.id)}</div>
    <div class="tt-title">${escHtml(data.fullTitle ?? data.label)}</div>
    <div class="tt-meta">
      <span class="tt-badge">${escHtml(data.type ?? '')}</span>
      <span class="tt-status-dot" style="background:${statusColor}"></span>
      <span class="tt-badge">${escHtml(data.status ?? '')}</span>
    </div>
    ${deps.length > 0
      ? `<div class="tt-deps">depends on: ${deps.map(d => `<span>${escHtml(d)}</span>`).join(', ')}</div>`
      : ''}
  `;
}

function positionTooltip(el, renderedPos, container) {
  if (!renderedPos) return;
  const rect = container.getBoundingClientRect();
  const x = rect.left + renderedPos.x + 12;
  const y = rect.top  + renderedPos.y - 8;

  // Flip left if clipped on right edge
  const flipX = x + 260 > window.innerWidth ? x - 280 : x;
  el.style.left = flipX + 'px';
  el.style.top  = y + 'px';
}

// ── Canvas helpers ────────────────────────────────────────────────

function canvasCenter(container) {
  return { x: container.offsetWidth / 2, y: container.offsetHeight / 2 };
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
