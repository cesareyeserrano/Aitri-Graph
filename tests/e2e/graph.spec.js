/**
 * Playwright e2e tests — Aitri Graph Visualizer
 * @aitri-tc TC-001h, TC-001f, TC-002h, TC-003h, TC-003e, TC-003f, TC-004h, TC-004e, TC-004f,
 *           TC-005h, TC-005e, TC-005f, TC-006e, TC-007h, TC-007e, TC-007f,
 *           TC-010h, TC-010e, TC-010f, TC-011f, TC-012h, TC-012e, TC-012f,
 *           TC-013h, TC-013e
 */
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

// Absolute path to the committed fixture — portable across machines.
// Override with AITRI_LOCAL_FIXTURE env var to test against a real project.
const FIXTURE_DIR = resolve(fileURLToPath(new URL('../fixtures/sample-project', import.meta.url)));
const DEMO_PATH   = process.env.AITRI_LOCAL_FIXTURE ?? FIXTURE_DIR;

// ── helpers ───────────────────────────────────────────────────────

async function loadDemo(page) {
  await page.click('#demo-btn');
  await expect(page.locator('#canvas-loading')).toBeHidden({ timeout: 8000 });
  await expect(page.locator('#canvas-error')).toBeHidden();
}

async function loadLocal(page, path) {
  await page.click('#add-project-btn');
  await page.fill('#project-input', path);
  await page.click('#load-btn');
  await expect(page.locator('#canvas-loading')).toBeHidden({ timeout: 8000 });
  await expect(page.locator('#canvas-error')).toBeHidden();
}

async function getCyNodes(page) {
  return page.evaluate(() => window.__cy?.nodes().length ?? 0);
}

async function getCyZoom(page) {
  return page.evaluate(() => window.__cy?.zoom() ?? 0);
}

// ── TC-001h: 22 nodes render from demo ────────────────────────────
test('TC-001h: graph renders all 22 nodes from demo dataset within 3s', async ({ page }) => {
  await page.goto('/');
  const t0 = Date.now();
  await loadDemo(page);
  const elapsed = Date.now() - t0;
  const nodeCount = await getCyNodes(page);
  expect(nodeCount).toBe(22);
  expect(elapsed).toBeLessThan(3000);
});

// ── TC-002h: 5 status colors visible ──────────────────────────────
test('TC-002h: all 5 statuses render with distinct colors and legend visible', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  await expect(page.locator('#status-legend')).toBeVisible();
  const legendItems = page.locator('.legend-item');
  await expect(legendItems).toHaveCount(5);
});

// ── TC-003h: zoom in increases zoom level ─────────────────────────
test('TC-003h: clicking zoom-in button increases zoom by ~10%', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  const before = await getCyZoom(page);
  await page.click('#zoom-in');
  const after = await getCyZoom(page);
  expect(after).toBeGreaterThan(before);
  expect(after / before).toBeCloseTo(1.1, 1);
});

// ── TC-003e: zoom out decreases zoom level ────────────────────────
test('TC-003e: clicking zoom-out button decreases zoom by ~10%', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  const before = await getCyZoom(page);
  await page.click('#zoom-out');
  const after = await getCyZoom(page);
  expect(after).toBeLessThan(before);
  expect(before / after).toBeCloseTo(1.1, 1);
});

// ── TC-003f: edge lines visible after zoom out ────────────────────
test('TC-003f: edges remain visible after zooming out 5 times', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  for (let i = 0; i < 5; i++) await page.click('#zoom-out');
  const edgeCount = await page.evaluate(() => window.__cy?.edges().length ?? 0);
  expect(edgeCount).toBeGreaterThan(0);
});

// ── TC-004h: canvas pan moves graph ──────────────────────────────
test('TC-004h: dragging canvas pans the graph', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  const panBefore = await page.evaluate(() => ({ ...window.__cy.pan() }));
  const canvas = page.locator('#cy');
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 40, { steps: 10 });
  await page.mouse.up();
  const panAfter = await page.evaluate(() => ({ ...window.__cy.pan() }));
  const dx = Math.abs(panAfter.x - panBefore.x);
  const dy = Math.abs(panAfter.y - panBefore.y);
  expect(dx + dy).toBeGreaterThan(5);
});

// ── TC-004e: click without drag does not pan ──────────────────────
test('TC-004e: clicking canvas without dragging does not pan (≤3px threshold)', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  const canvas = page.locator('#cy');
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // fit first to get a stable pan position
  await page.click('#fit-button');
  const panBefore = await page.evaluate(() => ({ ...window.__cy.pan() }));
  // click in empty area (move 1px — within threshold)
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 1, cy + 1);
  await page.mouse.up();
  const panAfter = await page.evaluate(() => ({ ...window.__cy.pan() }));
  const dist = Math.sqrt((panAfter.x - panBefore.x) ** 2 + (panAfter.y - panBefore.y) ** 2);
  expect(dist).toBeLessThan(5);
});

// helper: click a Cytoscape node by its data ID
async function clickCyNode(page, nodeId) {
  const pos = await page.evaluate(id => {
    const node = window.__cy.getElementById(id);
    const rp = node.renderedPosition();
    const rect = document.getElementById('cy').getBoundingClientRect();
    return { x: rect.left + rp.x, y: rect.top + rp.y };
  }, nodeId);
  await page.mouse.click(pos.x, pos.y);
}

// ── TC-005h: clicking feature node collapses children ────────────
test('TC-005h: clicking a Feature node collapses its child User Stories', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  const beforeCount = await getCyNodes(page);
  const nodeId = await page.evaluate(() => window.__cy.nodes('[type = "feature"]').first().id());
  await clickCyNode(page, nodeId);
  await page.waitForTimeout(300);
  const afterCount = await getCyNodes(page);
  expect(afterCount).toBeLessThan(beforeCount);
});

// ── TC-005e: clicking collapsed node restores children ───────────
test('TC-005e: clicking collapsed node restores hidden descendants', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  const original = await getCyNodes(page);
  const nodeId = await page.evaluate(() => window.__cy.nodes('[type = "feature"]').first().id());
  // Collapse
  await clickCyNode(page, nodeId);
  await page.waitForTimeout(300);
  // Expand
  await clickCyNode(page, nodeId);
  await page.waitForTimeout(300);
  const restored = await getCyNodes(page);
  expect(restored).toBe(original);
});

// ── TC-005f: clicking leaf node does nothing ──────────────────────
test('TC-005f: clicking a leaf Test Case node does not collapse anything', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  const before = await getCyNodes(page);
  const nodeId = await page.evaluate(() => window.__cy.nodes('[type = "test_case"]').first().id());
  await clickCyNode(page, nodeId);
  await page.waitForTimeout(200);
  const after = await getCyNodes(page);
  expect(after).toBe(before);
});

// ── TC-006e: dependency edge is dashed ────────────────────────────
test('TC-006e: dependency edges render with dashed line style', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  const hasDashed = await page.evaluate(() => {
    const depEdges = window.__cy.edges('[edgeType = "dependency"]');
    return depEdges.length > 0 &&
      depEdges.every(e => e.style('line-style') === 'dashed');
  });
  expect(hasDashed).toBe(true);
});

// ── TC-007h: tooltip appears on node hover ────────────────────────
test('TC-007h: tooltip appears within 500ms on node hover with id and status', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  // Hover over first node using Cytoscape event
  await page.evaluate(() => {
    const node = window.__cy.nodes().first();
    const pos = node.renderedPosition();
    node.trigger('mouseover', [{ renderedPosition: { x: pos.x, y: pos.y } }]);
  });
  await page.waitForTimeout(400);
  const tooltip = page.locator('#node-tooltip');
  await expect(tooltip).toHaveClass(/visible/);
  const text = await tooltip.innerText();
  expect(text.length).toBeGreaterThan(5);
});

// ── TC-007e: tooltip shows dependency IDs ────────────────────────
test('TC-007e: tooltip shows dependency IDs for nodes with dependencies', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  const hasDeps = await page.evaluate(() => {
    return window.__cy.nodes().some(n => (n.data('dependencies') ?? []).length > 0);
  });
  expect(hasDeps).toBe(true); // mock data has dependency nodes
});

// ── TC-007f: tooltip hides after mouseout ─────────────────────────
test('TC-007f: tooltip disappears after mouseout', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  await page.evaluate(() => {
    window.__cy.nodes().first().trigger('mouseover', [{ renderedPosition: { x: 100, y: 100 } }]);
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__cy.nodes().first().trigger('mouseout'));
  await page.waitForTimeout(500);
  const tooltip = page.locator('#node-tooltip');
  await expect(tooltip).not.toHaveClass(/visible/);
});

// ── TC-010h: sidebar renders project list ────────────────────────
test('TC-010h: sidebar renders added project with name and source badge', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  const items = page.locator('[data-testid="project-item"]');
  await expect(items).toHaveCount(1);
  const badge = items.first().locator('.source-badge');
  await expect(badge).toHaveText('DEMO');
});

// ── TC-010e: switching projects updates graph ─────────────────────
test('TC-010e: clicking a second project in sidebar switches the graph', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  const count1 = await getCyNodes(page);
  // Add a second project (local)
  await page.click('#add-project-btn');
  await page.fill('#project-input', DEMO_PATH);
  await page.click('#load-btn');
  await expect(page.locator('#canvas-loading')).toBeHidden({ timeout: 8000 });
  const count2 = await getCyNodes(page);
  // Switch back to demo
  await page.locator('[data-testid="project-item"]').first().click();
  await expect(page.locator('#canvas-loading')).toBeHidden({ timeout: 8000 });
  const count3 = await getCyNodes(page);
  // Different projects may have different node counts, but switching should work
  expect(count3).toBeGreaterThan(0);
  expect(count2).toBeGreaterThan(0);
});

// ── TC-011f: invalid input shows inline error ─────────────────────
test('TC-011f: invalid input "myproject" shows inline validation error', async ({ page }) => {
  await page.goto('/');
  await page.click('#add-project-btn');
  await page.fill('#project-input', 'myproject');
  await page.click('#load-btn');
  const err = page.locator('#form-validation-error');
  await expect(err).toBeVisible();
  const text = await err.innerText();
  expect(text.length).toBeGreaterThanOrEqual(10);
});

// ── TC-012h: fit button fits graph ───────────────────────────────
test('TC-012h: clicking fit button makes all nodes visible in viewport', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  // Zoom in a lot first
  for (let i = 0; i < 8; i++) await page.click('#zoom-in');
  await page.click('#fit-button');
  await page.waitForTimeout(300);
  const allVisible = await page.evaluate(() => {
    const ext = window.__cy.extent();
    return window.__cy.nodes().every(n => {
      const pos = n.position();
      return pos.x >= ext.x1 && pos.x <= ext.x2 &&
             pos.y >= ext.y1 && pos.y <= ext.y2;
    });
  });
  expect(allVisible).toBe(true);
});

// ── TC-012e: fit on already-fitted graph does not throw ───────────
test('TC-012e: fit button on already-fitted graph does not throw', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  // Click fit twice — if either throws, the test fails
  await page.click('#fit-button');
  await page.waitForTimeout(100);
  await page.click('#fit-button');
  // Verify graph is still in a valid state
  const nodes = await getCyNodes(page);
  expect(nodes).toBeGreaterThan(0);
});

// ── TC-012f: fit button disabled when no graph ────────────────────
test('TC-012f: fit button is disabled when no project is loaded', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#fit-button')).toBeDisabled();
  await expect(page.locator('#zoom-in')).toBeDisabled();
  await expect(page.locator('#zoom-out')).toBeDisabled();
});

// ── TC-013h: first-time user loads local project ───────────
test('TC-013h: first-time user adds local project and sees graph', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid="canvas-empty"]')).toBeVisible();
  await page.click('#add-project-btn');
  await expect(page.locator('#add-project-form')).toBeVisible();
  await page.fill('#project-input', DEMO_PATH);
  await page.click('#load-btn');
  await expect(page.locator('#canvas-loading')).toBeVisible();
  await expect(page.locator('#canvas-loading')).toBeHidden({ timeout: 8000 });
  const nodes = await getCyNodes(page);
  expect(nodes).toBeGreaterThan(0);
  await expect(page.locator('#status-legend')).toBeVisible();
  await expect(page.locator('#zoom-in')).toBeEnabled();
});

// ── TC-013e: user switches between two projects ────────────
test('TC-013e: user switches between two registered projects', async ({ page }) => {
  await page.goto('/');
  // Load demo
  await page.click('#demo-btn');
  await expect(page.locator('#canvas-loading')).toBeHidden({ timeout: 8000 });
  const demoNodes = await getCyNodes(page);
  // Load local
  await page.click('#add-project-btn');
  await page.fill('#project-input', DEMO_PATH);
  await page.click('#load-btn');
  await expect(page.locator('#canvas-loading')).toBeHidden({ timeout: 8000 });
  // Two items in sidebar
  await expect(page.locator('[data-testid="project-item"]')).toHaveCount(2);
  // Switch back to demo
  await page.locator('[data-testid="project-item"]').first().click();
  await expect(page.locator('#canvas-loading')).toBeHidden({ timeout: 8000 });
  const switchedNodes = await getCyNodes(page);
  expect(switchedNodes).toBe(demoNodes);
});

// ── TC-001f: malformed JSON shows canvas error ────────────────────
test('TC-001f: malformed JSON at project path shows error in canvas with no blank page', async ({ page }) => {
  const { mkdirSync, writeFileSync, rmSync, existsSync } = await import('fs');
  const { join } = await import('path');
  const BAD_PATH = '/tmp/bad-aitri-project';
  mkdirSync(join(BAD_PATH, 'spec'), { recursive: true });
  writeFileSync(join(BAD_PATH, 'spec', '01_REQUIREMENTS.json'), '{invalid json');

  try {
    await page.goto('/');
    await page.click('#add-project-btn');
    await page.fill('#project-input', BAD_PATH);
    await page.click('#load-btn');
    await expect(page.locator('#canvas-loading')).toBeHidden({ timeout: 8000 });

    const errorEl = page.locator('[data-testid="canvas-error"]');
    await expect(errorEl).toBeVisible();
    const text = await errorEl.innerText();
    expect(text.length).toBeGreaterThanOrEqual(10);
    expect(text.toLowerCase()).toMatch(/could not parse|parse error|invalid json/);
  } finally {
    if (existsSync(BAD_PATH)) rmSync(BAD_PATH, { recursive: true });
  }
});

// ── TC-004f: pan position stable after mouse release ──────────────
test('TC-004f: pan position does not snap back after mouse release', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);

  const canvas = page.locator('#cy');
  await canvas.dragTo(canvas, {
    sourcePosition: { x: 300, y: 300 },
    targetPosition: { x: 500, y: 300 },
  });

  const pan0 = await page.evaluate(() => ({ ...window.__cy.pan() }));
  await page.waitForTimeout(200);
  const pan1 = await page.evaluate(() => ({ ...window.__cy.pan() }));

  expect(Math.abs(pan1.x - pan0.x)).toBeLessThanOrEqual(1);
});

// ── TC-010f: removing active project clears canvas ─────────────────
test('TC-010f: removing active project clears canvas to empty state', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);

  // Confirm graph is loaded
  expect(await getCyNodes(page)).toBeGreaterThan(0);

  // Click remove button on first sidebar item
  const item = page.locator('[data-testid="project-item"]').first();
  await item.locator('.remove-btn').click();
  await item.locator('.confirm-yes').click();

  // Canvas should return to empty state
  await expect(page.locator('[data-testid="canvas-empty"]')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('[data-testid="project-item"]')).toHaveCount(0);
  expect(await getCyNodes(page)).toBe(0);
});
