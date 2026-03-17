import { initGraph } from './graph.js';
import { initSidebar } from './sidebar.js';

// Register cytoscape-dagre plugin (requires window.cytoscape to be loaded via CDN)
if (window.cytoscape && window.cytoscapeDagre) {
  window.cytoscape.use(window.cytoscapeDagre);
}

const container = document.getElementById('cy');

let gc;
try {
  gc = initGraph(container);
} catch (err) {
  // Show error in canvas area so it's visible
  container.innerHTML = `<div style="padding:24px;color:#F85149;font-family:monospace;font-size:13px">
    <b>initGraph failed:</b><br>${err.message}<br><br>
    window.cytoscape = ${typeof window.cytoscape}<br>
    window.cytoscapeDagre = ${typeof window.cytoscapeDagre}
  </div>`;
  // Still init sidebar so buttons work (without graph)
  gc = { render() {}, clear() {}, zoomIn() {}, zoomOut() {}, fit() {}, destroy() {}, _cy: null };
}

// Wire controls
document.getElementById('zoom-in').addEventListener('click',    () => gc.zoomIn());
document.getElementById('zoom-out').addEventListener('click',   () => gc.zoomOut());
document.getElementById('fit-button').addEventListener('click', () => gc.fit());

initSidebar(gc);

// Expose cy for e2e tests (Playwright)
window.__cy = gc._cy;
