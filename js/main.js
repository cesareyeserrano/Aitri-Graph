import { initGraph } from './graph.js';
import { initSidebar } from './sidebar.js';

// Register cytoscape-dagre plugin (requires window.cytoscape to be loaded via CDN)
if (window.cytoscape && window.cytoscapeDagre) {
  window.cytoscape.use(window.cytoscapeDagre);
}

const container = document.getElementById('cy');

const gc = initGraph(container);

// Wire controls
document.getElementById('zoom-in').addEventListener('click',    () => gc.zoomIn());
document.getElementById('zoom-out').addEventListener('click',   () => gc.zoomOut());
document.getElementById('fit-button').addEventListener('click', () => gc.fit());

initSidebar(gc);

// Expose cy for e2e tests (Playwright)
window.__cy = gc._cy;
