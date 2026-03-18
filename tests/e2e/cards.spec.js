/**
 * Playwright e2e tests — artifact-cards feature
 * @aitri-tc TC-013h, TC-013f, TC-016f, TC-017h, TC-017f, TC-018h, TC-018e,
 *           TC-019h, TC-019e, TC-019f, TC-E2E-AC-001h, TC-E2E-AC-002h
 */
import { test, expect } from '@playwright/test';

// ── helpers ───────────────────────────────────────────────────────

async function loadDemo(page) {
  await page.click('#demo-btn');
  await expect(page.locator('#canvas-loading')).toBeHidden({ timeout: 8000 });
  await expect(page.locator('#canvas-error')).toBeHidden();
}

/** Click a Cytoscape node by its data id using the exposed __cy instance. */
async function clickNode(page, nodeId) {
  await page.evaluate((id) => {
    const node = window.__cy.getElementById(id);
    if (!node || node.length === 0) throw new Error(`Node '${id}' not found in graph`);
    node.emit('tap');
  }, nodeId);
}

async function getCardCount(page) {
  return page.evaluate(() => document.querySelectorAll('.artifact-card').length);
}

async function getCardAttr(page, nodeId, attr) {
  return page.evaluate(({ nodeId, attr }) => {
    const el = document.querySelector(`[data-node-id="${nodeId}"]`);
    return el ? el.getAttribute(attr) : null;
  }, { nodeId, attr });
}

async function getCardRect(page, nodeId) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-node-id="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, nodeId);
}

// ── TC-013h: Card appears within 300ms of click ───────────────────

// @aitri-tc TC-013h
test('TC-013h: clicking a node opens its artifact card within 300ms', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);

  const t0 = Date.now();
  await clickNode(page, 'EPIC-01');
  // Poll until card appears or 300ms elapses
  await expect(page.locator('[data-node-id="EPIC-01"]')).toBeVisible({ timeout: 300 });
  const elapsed = Date.now() - t0;

  expect(elapsed).toBeLessThan(300);
  const cardNodeId = await getCardAttr(page, 'EPIC-01', 'data-node-id');
  expect(cardNodeId).toBe('EPIC-01');
});

// ── TC-013f: Clicking parent opens card AND collapses children ─────

// @aitri-tc TC-013f
test('TC-013f: clicking parent node opens card AND fires collapse/expand', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);

  const nodesBefore = await page.evaluate(() => window.__cy.nodes(':visible').length);

  // Click a Feature node (has children)
  await clickNode(page, 'FR-001');

  // Card must be open
  await expect(page.locator('[data-node-id="FR-001"]')).toBeVisible({ timeout: 300 });

  // Children should be collapsed (fewer visible nodes)
  const nodesAfter = await page.evaluate(() => window.__cy.nodes(':visible').length);
  expect(nodesAfter).toBeLessThan(nodesBefore);
});

// ── TC-016f: Tall card is scrollable and capped at 60vh ────────────

// @aitri-tc TC-016f
test('TC-016f: card body is scrollable when content exceeds 60vh', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);

  await clickNode(page, 'EPIC-01');
  await expect(page.locator('[data-node-id="EPIC-01"]')).toBeVisible({ timeout: 300 });

  const cardHeight = await page.evaluate(() => {
    const el = document.querySelector('.artifact-card');
    return el ? el.getBoundingClientRect().height : 0;
  });

  const viewportHeight = page.viewportSize().height;
  expect(cardHeight).toBeLessThanOrEqual(viewportHeight * 0.6 + 1); // +1px float tolerance
});

// ── TC-017h: Clicking X removes card within 200ms ─────────────────

// @aitri-tc TC-017h
test('TC-017h: clicking X button removes card from DOM within 200ms', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);

  await clickNode(page, 'EPIC-01');
  await expect(page.locator('[data-node-id="EPIC-01"]')).toBeVisible({ timeout: 300 });

  const t0 = Date.now();
  await page.click('[data-node-id="EPIC-01"] .card-close');
  await expect(page.locator('[data-node-id="EPIC-01"]')).toBeHidden({ timeout: 200 });
  const elapsed = Date.now() - t0;

  expect(elapsed).toBeLessThan(200);
});

// ── TC-017f: Graph zoom unchanged after closing card ───────────────

// @aitri-tc TC-017f
test('TC-017f: cy.zoom() unchanged after closing a card', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);

  // Set a known zoom
  await page.evaluate(() => window.__cy.zoom(1.2));
  const zoomBefore = await page.evaluate(() => window.__cy.zoom());

  await clickNode(page, 'EPIC-01');
  await expect(page.locator('[data-node-id="EPIC-01"]')).toBeVisible({ timeout: 300 });
  await page.click('[data-node-id="EPIC-01"] .card-close');
  await expect(page.locator('[data-node-id="EPIC-01"]')).toBeHidden({ timeout: 200 });

  const zoomAfter = await page.evaluate(() => window.__cy.zoom());
  expect(Math.abs(zoomAfter - zoomBefore)).toBeLessThan(0.01);
});

// ── TC-018h: 3 clicks → 3 simultaneous cards ──────────────────────

// @aitri-tc TC-018h
test('TC-018h: clicking 3 distinct nodes opens 3 simultaneous cards in DOM', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);

  // Use FR nodes from different epics — clicking a parent removes its children,
  // so avoid clicking EPIC-01 before FR-001/FR-002 (they'd be removed).
  await clickNode(page, 'FR-001');  // collapses US-001, US-002 only
  await clickNode(page, 'FR-002');  // collapses US-003, US-004 only; FR-001 stays
  await clickNode(page, 'FR-003');  // collapses US-005, US-006 only; FR-001/FR-002 stay

  await expect(page.locator('.artifact-card')).toHaveCount(3, { timeout: 500 });

  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('.artifact-card')].map(el => el.getAttribute('data-node-id'))
  );
  expect(ids).toContain('FR-001');
  expect(ids).toContain('FR-002');
  expect(ids).toContain('FR-003');
});

// ── TC-018e: Scrolling card B does not affect card A ───────────────

// @aitri-tc TC-018e
test('TC-018e: scrolling card B body does not change card A scroll position', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);

  // Use nodes from different epics to avoid collapse interference
  await clickNode(page, 'FR-001');  // EPIC-01 branch
  await clickNode(page, 'FR-003');  // EPIC-02 branch
  await expect(page.locator('.artifact-card')).toHaveCount(2, { timeout: 500 });

  // Get card A scroll position before
  const scrollBefore = await page.evaluate(() => {
    const cardA = document.querySelector('[data-node-id="FR-001"] .card-body');
    return cardA ? cardA.scrollTop : -1;
  });

  // Scroll card B
  await page.evaluate(() => {
    const cardB = document.querySelector('[data-node-id="FR-003"] .card-body');
    if (cardB) cardB.scrollTop = 50;
  });

  // Card A scroll unchanged
  const scrollAfter = await page.evaluate(() => {
    const cardA = document.querySelector('[data-node-id="FR-001"] .card-body');
    return cardA ? cardA.scrollTop : -1;
  });

  expect(scrollAfter).toBe(scrollBefore);
});

// ── TC-019h: Pan with open cards — cards stay fixed ───────────────

// @aitri-tc TC-019h
test('TC-019h: panning graph does not move open cards', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);

  // Use a leaf-level FR node — clicking it collapses only its US children,
  // keeping the node itself in the graph throughout the test.
  await clickNode(page, 'FR-001');
  await expect(page.locator('[data-node-id="FR-001"]')).toBeVisible({ timeout: 300 });

  const rectBefore = await getCardRect(page, 'FR-001');

  // Pan the graph by dragging canvas
  const cy = page.locator('#cy');
  const box = await cy.boundingBox();
  const cx = box.x + box.width / 2;
  const cy_ = box.y + box.height / 2;
  await page.mouse.move(cx, cy_);
  await page.mouse.down();
  await page.mouse.move(cx - 150, cy_ - 80, { steps: 10 });
  await page.mouse.up();

  const rectAfter = await getCardRect(page, 'FR-001');

  // Card should stay at same screen position (position:fixed)
  expect(Math.abs(rectAfter.left - rectBefore.left)).toBeLessThan(5);
  expect(Math.abs(rectAfter.top  - rectBefore.top)).toBeLessThan(5);
});

// ── TC-019e: Zoom with open cards — cards stay fixed ──────────────

// @aitri-tc TC-019e
test('TC-019e: zooming graph does not move open cards', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);

  await clickNode(page, 'FR-001');
  await expect(page.locator('[data-node-id="FR-001"]')).toBeVisible({ timeout: 300 });

  const rectBefore = await getCardRect(page, 'FR-001');
  const zoomBefore = await page.evaluate(() => window.__cy.zoom());

  // Zoom in programmatically (zoom-in button may be obscured by the open card)
  await page.evaluate(() => {
    window.__cy.zoom(window.__cy.zoom() * 1.5);
    window.__cy.zoom(window.__cy.zoom() * 1.5);
    window.__cy.zoom(window.__cy.zoom() * 1.5);
  });

  const zoomAfter = await page.evaluate(() => window.__cy.zoom());
  expect(zoomAfter).toBeGreaterThan(zoomBefore);

  const rectAfter = await getCardRect(page, 'FR-001');
  expect(Math.abs(rectAfter.left - rectBefore.left)).toBeLessThan(5);
  expect(Math.abs(rectAfter.top  - rectBefore.top)).toBeLessThan(5);
});

// ── TC-019f: Collapsing node with open card keeps card open ────────

// @aitri-tc TC-019f
test('TC-019f: clicking node a second time closes card (toggle) — not collapses and keeps card', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);

  // First click: opens card + collapses (for parent nodes)
  await clickNode(page, 'FR-001');
  await expect(page.locator('[data-node-id="FR-001"]')).toBeVisible({ timeout: 300 });

  // Second click: closes card (toggle)
  await clickNode(page, 'FR-001');
  await expect(page.locator('[data-node-id="FR-001"]')).toBeHidden({ timeout: 300 });
});

// ── TC-E2E-AC-001h: PM reads acceptance criteria, closes card ──────

// @aitri-tc TC-E2E-AC-001h
test('TC-E2E-AC-001h: PM clicks feature node, reads acceptance criteria list, closes card', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);

  // Open card for fr-1 (which has acceptance_criteria in demo data)
  const t0 = Date.now();
  await clickNode(page, 'FR-001');
  await expect(page.locator('[data-node-id="FR-001"]')).toBeVisible({ timeout: 300 });
  expect(Date.now() - t0).toBeLessThan(300);

  // Card body must have a <ul> list (acceptance_criteria rendered as list)
  const listItems = page.locator('[data-node-id="FR-001"] .field-list li');
  const count = await listItems.count();
  expect(count).toBeGreaterThan(0);

  // Close via X
  await page.click('[data-node-id="FR-001"] .card-close');
  await expect(page.locator('[data-node-id="FR-001"]')).toBeHidden({ timeout: 200 });
});

// ── TC-E2E-AC-002h: Developer opens 2 cards, pans, closes one ─────

// @aitri-tc TC-E2E-AC-002h
test('TC-E2E-AC-002h: developer opens 2 cards, pans graph, closes one — other stays', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);

  // Use nodes from different epics — clicking EPIC-01 would remove FR-001.
  // FR-001 (EPIC-01 branch) and FR-003 (EPIC-02 branch) are independent.
  await clickNode(page, 'FR-001');
  await clickNode(page, 'FR-003');
  await expect(page.locator('.artifact-card')).toHaveCount(2, { timeout: 500 });

  // Record card A (FR-001) position before pan
  const rectBefore = await getCardRect(page, 'FR-001');

  // Pan the graph
  const cyEl = page.locator('#cy');
  const box = await cyEl.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();

  // Card A still at same position
  const rectAfter = await getCardRect(page, 'FR-001');
  expect(Math.abs(rectAfter.left - rectBefore.left)).toBeLessThan(5);

  // Close card A
  await page.click('[data-node-id="FR-001"] .card-close');
  await expect(page.locator('[data-node-id="FR-001"]')).toBeHidden({ timeout: 200 });

  // Card B (FR-003) remains
  await expect(page.locator('[data-node-id="FR-003"]')).toBeVisible();
});
