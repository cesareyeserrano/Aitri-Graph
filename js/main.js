import { initTree }   from './tree.js';
import { initDetail } from './detail.js';
import { initSidebar } from './sidebar.js';

const treeContainer  = document.getElementById('tree');
const detailPanel    = document.getElementById('detail-panel');

const detail = initDetail(detailPanel);

const gc = initTree(treeContainer, {
  onSelect: node => detail.show(node),
});

// fit-button → scroll tree to top (hidden but kept for e2e compat)
const fitBtn = document.getElementById('fit-button');
if (fitBtn) fitBtn.addEventListener('click', () => gc.fit());

// Clear detail when project changes
const _origClear = gc.clear.bind(gc);
gc.clear = () => { _origClear(); detail.clear(); };

initSidebar(gc);

window.__gc = gc;
