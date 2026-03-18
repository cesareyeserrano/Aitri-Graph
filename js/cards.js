/**
 * CardManager — floating artifact detail cards.
 * @aitri-trace FR-ID: FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-020
 */

// Status colors — must match graph.js STATUS_COLORS exactly (same palette, same hex)
const STATUS_COLORS = {
  pending:     { bg: '#94A3B8', text: '#0f172a' },
  in_progress: { bg: '#60A5FA', text: '#0f172a' },
  approved:    { bg: '#34D399', text: '#0f172a' },
  complete:    { bg: '#A78BFA', text: '#0f172a' },
  drift:       { bg: '#FB923C', text: '#0f172a' },
};

const CARD_WIDTH  = 320;  // px — from UX spec
const CARD_GAP    = 12;   // px gap between stacked cards
const MARGIN      = 16;   // minimum distance from viewport edge

// Fields shown in the header — excluded from body rendering
const HEADER_FIELDS = new Set([
  'id', 'title', 'status', 'label', 'fullTitle',
  'statusColor', 'width', 'height', 'parentId', 'dependencies',
  'type', 'collapsed',  // internal graph fields — not useful to display
]);

// Standard body fields rendered in this fixed order
const BODY_FIELDS_ORDERED = [
  'description', 'priority', 'acceptance_criteria', 'implementation_level',
  'as_a', 'i_want', 'so_that',  // user story narrative fields
];
const BODY_FIELDS_SET = new Set(BODY_FIELDS_ORDERED);

// State: Map<nodeId, HTMLElement>
const openCards = new Map();

// ── Public API ────────────────────────────────────────────────────

/**
 * Toggle card for a Cytoscape node — open if closed, close if open.
 * Called from graph.js tap handler.
 * @aitri-trace FR-ID: FR-013, US-ID: US-013, AC-ID: AC-013-01, TC-ID: TC-013h, TC-013e
 */
function toggle(cyNode) {
  const nodeId = cyNode.id();
  if (openCards.has(nodeId)) {
    close(nodeId);
  } else {
    open(nodeId, cyNode.data());
  }
}

/**
 * Open a card for the given node.
 * renderedPos is canvas-relative (from Cytoscape renderedPosition()).
 * We convert to viewport coordinates before positioning (position:fixed).
 * @aitri-trace FR-ID: FR-013, FR-016, FR-020, TC-ID: TC-013h, TC-016h, TC-016e, TC-020h
 */
function open(nodeId, artifactData) {
  const cardEl = renderCard(nodeId, artifactData);

  // Append off-screen first — measure height before final placement (FR-016)
  cardEl.style.left = '-9999px';
  cardEl.style.top  = '-9999px';
  document.body.appendChild(cardEl);

  const pos = computeStackPosition(cardEl);
  cardEl.style.left = pos.left + 'px';
  cardEl.style.top  = pos.top  + 'px';

  openCards.set(nodeId, cardEl);
}

/**
 * Close and remove a card by nodeId.
 * @aitri-trace FR-ID: FR-017, US-ID: US-017, AC-ID: AC-017-01, TC-ID: TC-017h, TC-017e
 */
function close(nodeId) {
  const el = openCards.get(nodeId);
  if (el) {
    el.remove();
    openCards.delete(nodeId);
  }
}

/** Close all open cards (utility). */
function closeAll() {
  for (const nodeId of openCards.keys()) close(nodeId);
}

// ── Positioning ───────────────────────────────────────────────────

/**
 * Stack cards vertically at the right edge of the viewport, each below the
 * previous one with CARD_GAP spacing. Cards never overlap.
 * @aitri-trace FR-ID: FR-016, FR-020
 */
function computeStackPosition(newCardEl) {
  const left = window.innerWidth - CARD_WIDTH - MARGIN;

  // Sum heights of all already-open cards to find the next top position
  let top = MARGIN;
  for (const el of openCards.values()) {
    top += el.getBoundingClientRect().height + CARD_GAP;
  }

  // Clamp so the new card doesn't go below the viewport bottom
  const cardH = newCardEl.getBoundingClientRect().height;
  top = Math.min(top, window.innerHeight - cardH - MARGIN);
  top = Math.max(top, MARGIN);

  return { left, top };
}

/**
 * Clamp position so card stays fully within viewport.
 * @aitri-trace FR-ID: FR-016, TC-ID: TC-016h, TC-016e
 */
function clampToViewport(pos, cardEl) {
  const cardH = cardEl.getBoundingClientRect().height;
  let left = Math.min(pos.left, window.innerWidth  - CARD_WIDTH - MARGIN);
  let top  = Math.min(pos.top,  window.innerHeight - cardH      - MARGIN);
  left = Math.max(left, MARGIN);
  top  = Math.max(top,  MARGIN);
  return { left, top };
}

// Legacy — kept for unit-test compatibility
function getCascadeCount() { return openCards.size; }
function computePosition(renderedPos, cascadeCount) {
  return { left: renderedPos.x + 16, top: renderedPos.y };
}

// ── Rendering ─────────────────────────────────────────────────────

/**
 * Build the full card HTMLElement for an artifact.
 * @aitri-trace FR-ID: FR-014, FR-015, TC-ID: TC-014h, TC-015h
 */
function renderCard(nodeId, data) {
  const el = document.createElement('div');
  el.className = 'artifact-card';
  el.setAttribute('data-node-id', nodeId);
  el.style.width = CARD_WIDTH + 'px';

  el.appendChild(renderHeader(nodeId, data));
  el.appendChild(renderBody(data));

  return el;
}

function renderHeader(nodeId, data) {
  const header = document.createElement('div');
  header.className = 'card-header';

  // Top row: id + close button
  const topRow = document.createElement('div');
  topRow.className = 'card-top-row';

  const idEl = document.createElement('span');
  idEl.className = 'card-id';
  idEl.textContent = data.id || nodeId;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'card-close';
  closeBtn.setAttribute('aria-label', 'Close card');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', e => {
    e.stopPropagation();
    close(nodeId);
  });

  topRow.appendChild(idEl);
  topRow.appendChild(closeBtn);

  // Title
  const titleEl = document.createElement('div');
  titleEl.className = 'card-title';
  titleEl.textContent = data.fullTitle || data.title || data.label || nodeId;

  // Status badge
  /** @aitri-trace FR-ID: FR-015, TC-ID: TC-015h, TC-015e */
  const badge = document.createElement('span');
  badge.className = 'status-badge';
  const colors = STATUS_COLORS[data.status] ?? STATUS_COLORS.pending;
  badge.textContent = (data.status ?? 'pending').replace(/_/g, ' ');
  badge.style.backgroundColor = colors.bg;
  badge.style.color = colors.text;

  header.appendChild(topRow);
  header.appendChild(titleEl);
  header.appendChild(badge);

  return header;
}

/**
 * Render body with all artifact fields.
 * Standard fields in fixed order, then any extra fields.
 * Fields absent from data are silently omitted (no empty rows).
 * @aitri-trace FR-ID: FR-014, TC-ID: TC-014h, TC-014e, TC-014f
 */
function renderBody(data) {
  const body = document.createElement('div');
  body.className = 'card-body';

  // Standard fields — ordered
  for (const key of BODY_FIELDS_ORDERED) {
    if (data[key] === undefined || data[key] === null) continue;
    body.appendChild(renderField(key, data[key]));
  }

  // Extra fields — any top-level key not in header or standard sets
  for (const key of Object.keys(data)) {
    if (HEADER_FIELDS.has(key) || BODY_FIELDS_SET.has(key)) continue;
    body.appendChild(renderField(key, data[key]));
  }

  if (body.children.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'card-empty';
    empty.textContent = 'No additional fields available.';
    body.appendChild(empty);
  }

  return body;
}

function renderField(key, value) {
  const row = document.createElement('div');
  row.className = 'card-field';

  const label = document.createElement('span');
  label.className = 'field-label';
  label.textContent = toTitleCase(key);

  const valueEl = document.createElement('div');
  valueEl.className = 'field-value';

  if (Array.isArray(value)) {
    const ul = document.createElement('ul');
    ul.className = 'field-list';
    for (const item of value) {
      const li = document.createElement('li');
      li.textContent = typeof item === 'string' ? item : JSON.stringify(item);
      ul.appendChild(li);
    }
    valueEl.appendChild(ul);
  } else if (value !== null && typeof value === 'object') {
    const pre = document.createElement('pre');
    pre.className = 'field-json';
    pre.textContent = JSON.stringify(value, null, 2);
    valueEl.appendChild(pre);
  } else {
    valueEl.textContent = String(value);
  }

  row.appendChild(label);
  row.appendChild(valueEl);
  return row;
}

function toTitleCase(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Exports ───────────────────────────────────────────────────────

export const CardManager = {
  toggle,
  open,
  close,
  closeAll,
  // Exposed for unit tests
  _openCards: openCards,
  _getCascadeCount: getCascadeCount,
  _computePosition: computePosition,
  _clampToViewport: clampToViewport,
  _renderCard: renderCard,
  _STATUS_COLORS: STATUS_COLORS,
};
