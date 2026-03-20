import { initTree } from './tree.js';
import { initSidebar } from './sidebar.js';

const container = document.getElementById('tree');
const gc = initTree(container);

// Fit button → scroll to top
document.getElementById('fit-button').addEventListener('click', () => gc.fit());

initSidebar(gc);

// Expose for e2e tests
window.__gc = gc;
