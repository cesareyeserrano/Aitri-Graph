/**
 * DetailPanel — renders the full content of a selected artifact node
 * in the right-hand panel.
 */

const STATUS_LABEL = {
  pending:     'Pending',
  in_progress: 'In Progress',
  approved:    'Approved',
  complete:    'Complete',
  drift:       'Drift',
};

const STATUS_COLOR = {
  pending:     '#94A3B8',
  in_progress: '#60A5FA',
  approved:    '#34D399',
  complete:    '#A78BFA',
  drift:       '#FB923C',
};

const TYPE_LABEL = {
  epic:       'Epic',
  feature:    'Feature',
  user_story: 'User Story',
  test_case:  'Test Case',
};

// ── Helpers ───────────────────────────────────────────────────────

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function section(title, content) {
  const wrap = el('div', 'detail-section');
  wrap.appendChild(el('h3', 'detail-section-title', title));
  wrap.appendChild(content);
  return wrap;
}

function badge(text, color) {
  const b = el('span', 'detail-badge');
  b.textContent = text;
  if (color) b.style.background = color;
  return b;
}

// ── Renderers per type ────────────────────────────────────────────

function renderHeader(node) {
  const wrap = el('div', 'detail-header');

  const top = el('div', 'detail-header-top');
  top.appendChild(badge(TYPE_LABEL[node.type] ?? node.type, 'var(--surface-raised)'));

  const statusBadge = badge(STATUS_LABEL[node.status] ?? node.status);
  statusBadge.style.background = STATUS_COLOR[node.status] ?? '#94A3B8';
  statusBadge.style.color = '#0f1117';
  top.appendChild(statusBadge);

  if (node.priority) {
    top.appendChild(badge(node.priority.toUpperCase(), 'var(--surface-raised)'));
  }

  wrap.appendChild(top);

  const id = el('div', 'detail-id', node.id);
  wrap.appendChild(id);

  const title = el('h2', 'detail-title', node.fullTitle || node.label);
  wrap.appendChild(title);

  return wrap;
}

function renderFeature(node) {
  const frag = document.createDocumentFragment();
  frag.appendChild(renderHeader(node));

  if (node.description) {
    const p = el('p', 'detail-desc', node.description);
    frag.appendChild(section('Description', p));
  }

  if (node.acceptance_criteria?.length) {
    const ul = el('ul', 'detail-ac-list');
    node.acceptance_criteria.forEach(ac => {
      const li = el('li', 'detail-ac-item');
      if (ac.given)  li.appendChild(Object.assign(el('span', 'ac-part'), { innerHTML: `<b>Given</b> ${ac.given}` }));
      if (ac.when)   li.appendChild(Object.assign(el('span', 'ac-part'), { innerHTML: `<b>When</b> ${ac.when}` }));
      if (ac.then)   li.appendChild(Object.assign(el('span', 'ac-part'), { innerHTML: `<b>Then</b> ${ac.then}` }));
      if (!ac.given && !ac.when) li.textContent = JSON.stringify(ac);
      ul.appendChild(li);
    });
    frag.appendChild(section('Acceptance Criteria', ul));
  }

  if (node.dependencies?.length) {
    frag.appendChild(renderDeps(node.dependencies));
  }

  return frag;
}

function renderUserStory(node) {
  const frag = document.createDocumentFragment();
  frag.appendChild(renderHeader(node));

  if (node.as_a || node.i_want || node.so_that) {
    const div = el('div', 'detail-story');
    if (node.as_a)    div.appendChild(Object.assign(el('p', 'story-part'), { innerHTML: `<b>As a</b> ${node.as_a}` }));
    if (node.i_want)  div.appendChild(Object.assign(el('p', 'story-part'), { innerHTML: `<b>I want</b> ${node.i_want}` }));
    if (node.so_that) div.appendChild(Object.assign(el('p', 'story-part'), { innerHTML: `<b>So that</b> ${node.so_that}` }));
    frag.appendChild(section('User Story', div));
  }

  if (node.acceptance_criteria?.length) {
    const ul = el('ul', 'detail-ac-list');
    node.acceptance_criteria.forEach(ac => {
      const li = el('li', 'detail-ac-item');
      if (typeof ac === 'string') { li.textContent = ac; }
      else {
        if (ac.given) li.appendChild(Object.assign(el('span', 'ac-part'), { innerHTML: `<b>Given</b> ${ac.given}` }));
        if (ac.when)  li.appendChild(Object.assign(el('span', 'ac-part'), { innerHTML: `<b>When</b> ${ac.when}` }));
        if (ac.then)  li.appendChild(Object.assign(el('span', 'ac-part'), { innerHTML: `<b>Then</b> ${ac.then}` }));
      }
      ul.appendChild(li);
    });
    frag.appendChild(section('Acceptance Criteria', ul));
  }

  if (node.dependencies?.length) {
    frag.appendChild(renderDeps(node.dependencies));
  }

  return frag;
}

function renderTestCase(node) {
  const frag = document.createDocumentFragment();
  frag.appendChild(renderHeader(node));

  const meta = el('div', 'detail-meta-grid');
  if (node.nodeType) meta.appendChild(renderMetaRow('Type',     node.nodeType));
  if (node.scenario) meta.appendChild(renderMetaRow('Scenario', node.scenario));
  if (node.priority) meta.appendChild(renderMetaRow('Priority', node.priority));
  if (node.ac_id)    meta.appendChild(renderMetaRow('AC',       node.ac_id));
  if (meta.children.length) frag.appendChild(section('Details', meta));

  if (node.preconditions?.length) {
    const ul = el('ul', 'detail-steps');
    node.preconditions.forEach(p => ul.appendChild(el('li', 'detail-step', p)));
    frag.appendChild(section('Preconditions', ul));
  }

  if (node.given || node.when || node.then) {
    const div = el('div', 'detail-story');
    if (node.given) div.appendChild(Object.assign(el('p', 'story-part'), { innerHTML: `<b>Given</b> ${node.given}` }));
    if (node.when)  div.appendChild(Object.assign(el('p', 'story-part'), { innerHTML: `<b>When</b> ${node.when}` }));
    if (node.then)  div.appendChild(Object.assign(el('p', 'story-part'), { innerHTML: `<b>Then</b> ${node.then}` }));
    frag.appendChild(section('Scenario', div));
  }

  if (node.steps?.length) {
    const ol = el('ol', 'detail-steps');
    node.steps.forEach(s => ol.appendChild(el('li', 'detail-step', s)));
    frag.appendChild(section('Steps', ol));
  }

  if (node.expected_result) {
    frag.appendChild(section('Expected Result', el('p', 'detail-desc', node.expected_result)));
  }

  return frag;
}

function renderEpic(node) {
  const frag = document.createDocumentFragment();
  frag.appendChild(renderHeader(node));
  return frag;
}

function renderDeps(deps) {
  const wrap = el('div', 'detail-deps');
  deps.forEach(d => {
    const b = el('span', 'detail-dep-badge', `→ ${d}`);
    wrap.appendChild(b);
  });
  return section('Dependencies', wrap);
}

function renderMetaRow(label, value) {
  const row = el('div', 'meta-row');
  row.appendChild(el('span', 'meta-label', label));
  row.appendChild(el('span', 'meta-value', String(value)));
  return row;
}

// ── Public API ────────────────────────────────────────────────────

export function initDetail(panelEl) {
  const emptyEl  = document.getElementById('canvas-empty');
  const detailEl = panelEl;

  function show(node) {
    emptyEl.classList.add('hidden');
    detailEl.classList.remove('hidden');
    detailEl.innerHTML = '';

    let frag;
    switch (node.type) {
      case 'feature':    frag = renderFeature(node);   break;
      case 'user_story': frag = renderUserStory(node); break;
      case 'test_case':  frag = renderTestCase(node);  break;
      default:           frag = renderEpic(node);      break;
    }

    detailEl.appendChild(frag);
    detailEl.scrollTop = 0;
  }

  function clear() {
    detailEl.classList.add('hidden');
    detailEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
  }

  return { show, clear };
}
