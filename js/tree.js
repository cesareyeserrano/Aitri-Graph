/**
 * TreeView — file-explorer-style artifact tree renderer (sidebar).
 * Implements the graphController interface: { render, clear, fit, zoomIn, zoomOut }
 * Calls onSelect(node) when user clicks a node label.
 */

const STATUS_COLOR = {
  pending:     '#94A3B8',
  in_progress: '#60A5FA',
  approved:    '#34D399',
  complete:    '#A78BFA',
  drift:       '#FB923C',
};

const TYPE_LABEL = {
  epic:       'EP',
  feature:    'FR',
  user_story: 'US',
  test_case:  'TC',
};

const LEAF_TYPES = new Set(['test_case']);

/**
 * Build a tree structure from flat node + edge lists.
 * Returns root nodes (parentId === null or parent not in nodeSet).
 */
function buildTree(nodes, edges) {
  const nodeMap = new Map(nodes.map(n => [n.id, { ...n, children: [] }]));

  // Use hierarchy edges to wire parent → child
  const hierarchyEdges = edges.filter(e => e.edgeType === 'hierarchy');
  const childIds = new Set();
  for (const e of hierarchyEdges) {
    const parent = nodeMap.get(e.source);
    const child  = nodeMap.get(e.target);
    if (parent && child) {
      parent.children.push(child);
      childIds.add(child.id);
    }
  }

  // Collect dependency edges per node (for badges)
  const depsByNode = new Map();
  for (const e of edges.filter(e => e.edgeType === 'dependency')) {
    if (!depsByNode.has(e.source)) depsByNode.set(e.source, []);
    depsByNode.get(e.source).push(e.target);
  }
  for (const [id, deps] of depsByNode) {
    const n = nodeMap.get(id);
    if (n) n._deps = deps;
  }

  // Root nodes = nodes with no parent in the tree
  return [...nodeMap.values()].filter(n => !childIds.has(n.id));
}

/**
 * Render one tree node (and its children recursively) as a <li>.
 * @param {object} node - tree node with .children[]
 * @param {Set<string>} collapsed - set of collapsed node IDs
 * @param {number} depth
 */
function renderNode(node, collapsed, depth) {
  const isLeaf     = LEAF_TYPES.has(node.type) || node.children.length === 0;
  const isCollapsed = collapsed.has(node.id);
  const color      = STATUS_COLOR[node.status] ?? STATUS_COLOR.pending;
  const badge      = TYPE_LABEL[node.type] ?? '?';
  const deps       = node._deps ?? [];

  const li = document.createElement('li');
  li.className = `tree-node tree-node--${node.type}`;
  li.dataset.id = node.id;

  // ── Row ──────────────────────────────────────────────────────────
  const row = document.createElement('div');
  row.className = 'tree-row';
  row.style.paddingLeft = `${depth * 20 + 8}px`;

  // Chevron (only for non-leaf nodes)
  const chevron = document.createElement('span');
  chevron.className = 'tree-chevron';
  if (!isLeaf) {
    chevron.textContent = isCollapsed ? '▶' : '▼';
    chevron.setAttribute('aria-label', isCollapsed ? 'expand' : 'collapse');
  }
  row.appendChild(chevron);

  // Status dot
  const dot = document.createElement('span');
  dot.className = 'tree-dot';
  dot.style.background = color;
  dot.title = node.status.replace('_', ' ');
  row.appendChild(dot);

  // Type badge
  const typeBadge = document.createElement('span');
  typeBadge.className = `tree-badge tree-badge--${node.type}`;
  typeBadge.textContent = badge;
  row.appendChild(typeBadge);

  // Label (clickable → opens card)
  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = node.fullTitle || node.label;
  label.title = node.fullTitle || node.label;
  row.appendChild(label);

  // Dependency badges
  if (deps.length > 0) {
    const depWrap = document.createElement('span');
    depWrap.className = 'tree-deps';
    deps.forEach(depId => {
      const d = document.createElement('span');
      d.className = 'tree-dep-badge';
      d.textContent = `→ ${depId}`;
      d.title = `depends on ${depId}`;
      depWrap.appendChild(d);
    });
    row.appendChild(depWrap);
  }

  li.appendChild(row);

  // ── Children ─────────────────────────────────────────────────────
  if (!isLeaf && node.children.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'tree-children';
    if (isCollapsed) ul.classList.add('hidden');

    for (const child of node.children) {
      ul.appendChild(renderNode(child, collapsed, depth + 1));
    }
    li.appendChild(ul);
  }

  return li;
}

/**
 * Initialize the tree view and return a graphController-compatible object.
 * @param {HTMLElement} container
 */
export function initTree(container, { onSelect } = {}) {
  let currentData = null;
  const collapsed = new Set();

  function render(graphData) {
    collapsed.clear();
    currentData = graphData;
    _paint();
  }

  function _paint() {
    if (!currentData) return;
    container.innerHTML = '';

    const { nodes, edges } = currentData;
    const roots = buildTree(nodes, edges);

    const ul = document.createElement('ul');
    ul.className = 'tree-root';
    ul.setAttribute('role', 'tree');
    for (const root of roots) {
      ul.appendChild(renderNode(root, collapsed, 0));
    }
    container.appendChild(ul);

    // ── Event delegation ─────────────────────────────────────────
    container.addEventListener('click', _onClick, { once: true });
    function _onClick(e) {
      // Re-attach after each click so it fires again
      container.addEventListener('click', _onClick, { once: true });

      const row = e.target.closest('.tree-row');
      if (!row) return;
      const li  = row.closest('.tree-node');
      if (!li) return;
      const id  = li.dataset.id;

      const clickedLabel = e.target.closest('.tree-label');
      if (clickedLabel) {
        const node = currentData.nodes.find(n => n.id === id);
        if (node && onSelect) onSelect(node);
        // Mark row as active
        container.querySelectorAll('.tree-row.active').forEach(r => r.classList.remove('active'));
        row.classList.add('active');
        return;
      }

      // Click anywhere else on row → collapse/expand
      const children = li.querySelector('.tree-children');
      if (!children) return;

      if (collapsed.has(id)) {
        collapsed.delete(id);
        children.classList.remove('hidden');
        li.querySelector('.tree-chevron').textContent = '▼';
      } else {
        collapsed.add(id);
        children.classList.add('hidden');
        li.querySelector('.tree-chevron').textContent = '▶';
      }
    }
  }

  function clear() {
    container.innerHTML = '';
    currentData = null;
    collapsed.clear();
  }

  return {
    render,
    clear,
    fit:     () => { container.scrollTop = 0; },
    zoomIn:  () => {},
    zoomOut: () => {},
    // Expose for tests
    _tree: () => currentData,
  };
}
