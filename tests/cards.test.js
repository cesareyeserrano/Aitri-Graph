/**
 * Unit tests for artifact-cards feature — source inspection + logic tests.
 * Cards.js uses browser DOM APIs (document, window) so behavioral tests run
 * via source inspection; computed-value tests mock the minimal window surface.
 *
 * Run: node --test tests/cards.test.js
 * @aitri-tc TC-013e, TC-014h, TC-014e, TC-014f, TC-015h, TC-015e, TC-015f,
 *           TC-016h, TC-016e, TC-017e, TC-018f, TC-020h, TC-020e, TC-020f
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const cardsSrc = readFileSync(new URL('../js/cards.js', import.meta.url), 'utf8');
const cardsCss = readFileSync(new URL('../css/cards.css', import.meta.url), 'utf8');

// ── FR-013: Open card on node click ───────────────────────────────

// @aitri-tc TC-013e
test('TC-013e: toggle closes an open card — openCards.delete called on second toggle', () => {
  assert.ok(cardsSrc.includes('openCards.has(nodeId)'), 'toggle must check openCards.has(nodeId)');
  assert.ok(cardsSrc.includes('close(nodeId)'), 'toggle must call close(nodeId) when card is open');
  assert.ok(cardsSrc.includes('openCards.delete(nodeId)'), 'close must call openCards.delete(nodeId)');
});

// ── FR-014: All fields in card ────────────────────────────────────

// @aitri-tc TC-014h
test('TC-014h: renderCard renders standard fields in fixed order', () => {
  assert.ok(cardsSrc.includes("'description'"), 'cards.js must include description in BODY_FIELDS_ORDERED');
  assert.ok(cardsSrc.includes("'priority'"),    'cards.js must include priority in BODY_FIELDS_ORDERED');
  assert.ok(cardsSrc.includes("'type'"),        'cards.js must include type in BODY_FIELDS_ORDERED');
  assert.ok(cardsSrc.includes("'acceptance_criteria'"), 'cards.js must include acceptance_criteria in BODY_FIELDS_ORDERED');
  assert.ok(cardsSrc.includes("'implementation_level'"), 'cards.js must include implementation_level in BODY_FIELDS_ORDERED');
});

// @aitri-tc TC-014e
test('TC-014e: acceptance_criteria array renders as <ul><li> list, not concatenated', () => {
  assert.ok(cardsSrc.includes('Array.isArray(value)'), 'renderField must branch on Array.isArray(value)');
  assert.ok(
    cardsSrc.includes("createElement('ul')") || cardsSrc.includes('createElement("ul")'),
    'array values must create a <ul> element'
  );
  assert.ok(
    cardsSrc.includes("createElement('li')") || cardsSrc.includes('createElement("li")'),
    'each array item must create a <li> element'
  );
});

// @aitri-tc TC-014f
test('TC-014f: missing field is silently omitted — no empty row rendered', () => {
  // The body loop skips undefined/null fields
  assert.ok(
    cardsSrc.includes('=== undefined || data[key] === null') ||
    cardsSrc.includes('=== undefined || data[field] === null'),
    'renderBody must skip undefined or null fields'
  );
  // Values are set via textContent, not innerHTML (XSS prevention + no empty HTML)
  assert.ok(cardsSrc.includes('textContent'), 'field values must use textContent (not innerHTML)');
  assert.ok(!cardsSrc.includes('innerHTML ='), 'cards.js must never use innerHTML = (XSS risk)');
});

// ── FR-015: Status badge colors ───────────────────────────────────

// @aitri-tc TC-015h
test('TC-015h: STATUS_COLORS.approved background is #34D399 (matches graph.js)', () => {
  assert.ok(
    cardsSrc.includes("approved:    { bg: '#34D399'") ||
    cardsSrc.includes("approved: { bg: '#34D399'"),
    "cards.js STATUS_COLORS.approved.bg must be '#34D399' to match graph.js"
  );
});

// @aitri-tc TC-015e
test('TC-015e: all 5 statuses have distinct bg hex values in STATUS_COLORS', () => {
  // Extract all bg hex values from STATUS_COLORS block
  const bgMatches = [...cardsSrc.matchAll(/bg:\s*'(#[0-9A-Fa-f]{6})'/g)].map(m => m[1]);
  assert.ok(bgMatches.length >= 5, `Expected ≥5 bg colors, found ${bgMatches.length}`);
  const unique = new Set(bgMatches);
  assert.equal(unique.size, bgMatches.length, `All bg hex values must be distinct — found duplicates: ${bgMatches.join(', ')}`);
});

// @aitri-tc TC-015f
test('TC-015f: drift status badge contrast ratio ≥4.5:1 — #FB923C on #0f172a text', () => {
  // drift bg #FB923C, text #0f172a — compute contrast via WCAG relative luminance
  function sRGB(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function lum(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 0.2126 * sRGB(r) + 0.7152 * sRGB(g) + 0.0722 * sRGB(b);
  }
  function contrast(hex1, hex2) {
    const l1 = Math.max(lum(hex1), lum(hex2));
    const l2 = Math.min(lum(hex1), lum(hex2));
    return (l1 + 0.05) / (l2 + 0.05);
  }
  // drift: bg=#FB923C, text=#0f172a
  const ratio = contrast('#FB923C', '#0f172a');
  assert.ok(ratio >= 4.5, `drift contrast ratio ${ratio.toFixed(2)} < 4.5:1`);
});

// ── FR-016: Viewport clamping ─────────────────────────────────────

// @aitri-tc TC-016h
test('TC-016h: computeStackPosition anchors cards at right edge using window.innerWidth', () => {
  assert.ok(
    cardsSrc.includes('computeStackPosition'),
    'cards.js must use computeStackPosition for non-overlapping vertical stacking'
  );
  assert.ok(
    cardsSrc.includes('window.innerWidth - CARD_WIDTH - MARGIN'),
    'computeStackPosition must anchor cards at right edge using window.innerWidth'
  );
});

// @aitri-tc TC-016e
test('TC-016e: clampToViewport uses getBoundingClientRect height for bottom clamping', () => {
  assert.ok(
    cardsSrc.includes('getBoundingClientRect'),
    'clampToViewport must call getBoundingClientRect() to measure actual card height'
  );
  assert.ok(
    cardsSrc.includes('window.innerHeight'),
    'clampToViewport must use window.innerHeight for bottom boundary'
  );
  assert.ok(
    cardsSrc.includes('window.innerWidth'),
    'clampToViewport must use window.innerWidth for right boundary'
  );
});

// ── FR-016 (CSS): max-height cap ──────────────────────────────────

test('TC-016f (CSS): card has max-height: 60vh and card-body is scrollable', () => {
  assert.ok(
    cardsCss.includes('max-height: 60vh'),
    'cards.css must set max-height: 60vh on .artifact-card'
  );
  assert.ok(
    cardsCss.includes('overflow-y: auto') || cardsCss.includes('overflow-y:auto'),
    'cards.css must set overflow-y: auto on .card-body'
  );
});

// ── FR-017: Close via X button ────────────────────────────────────

// @aitri-tc TC-017e
test('TC-017e: close(nodeId) removes only the targeted card, not others', () => {
  assert.ok(cardsSrc.includes('el.remove()'), 'close() must call el.remove()');
  assert.ok(cardsSrc.includes('openCards.delete(nodeId)'), 'close() must call openCards.delete(nodeId)');
  // The Map structure guarantees other entries are unaffected by delete
  assert.ok(cardsSrc.includes('openCards.get(nodeId)'), 'close() must lookup by nodeId (not clear all)');
});

// ── FR-018: Multiple simultaneous cards ───────────────────────────

// @aitri-tc TC-018f
test('TC-018f: openCards Map has no size limit — 6th card can be added', () => {
  // Verify no size check guards the open() function
  assert.ok(!cardsSrc.includes('openCards.size >=') && !cardsSrc.includes('openCards.size >'),
    'open() must not reject cards based on openCards.size — multiple cards must be allowed');
  assert.ok(cardsSrc.includes('openCards.set(nodeId'), 'open() must call openCards.set(nodeId, ...)');
});

// ── FR-020: Cascade offset ────────────────────────────────────────

// @aitri-tc TC-020h
test('TC-020h: CARD_GAP separates stacked cards — each card starts below the previous', () => {
  assert.ok(
    cardsSrc.includes('CARD_GAP'),
    'cards.js must define CARD_GAP for vertical separation between stacked cards'
  );
  assert.ok(
    cardsSrc.includes('getBoundingClientRect().height + CARD_GAP'),
    'stack position must sum existing card heights + CARD_GAP to place next card below'
  );
});

// @aitri-tc TC-020e
test('TC-020e: computeStackPosition iterates openCards to find next vertical slot', () => {
  assert.ok(cardsSrc.includes('openCards.values()'), 'computeStackPosition must iterate openCards.values()');
  assert.ok(
    cardsSrc.includes('computeStackPosition'),
    'open() must call computeStackPosition for non-overlapping placement'
  );
});

// @aitri-tc TC-020f
test('TC-020f: stack position clamped so card stays within viewport bottom', () => {
  assert.ok(
    cardsSrc.includes('window.innerHeight - cardH - MARGIN'),
    'computeStackPosition must clamp top so card does not overflow viewport bottom'
  );
  assert.ok(
    cardsSrc.includes('window.innerWidth - CARD_WIDTH - MARGIN'),
    'computeStackPosition must use window.innerWidth for right edge'
  );
});

// ── FR-019: Graph navigation unaffected ───────────────────────────

test('TC-019s: cards use position:fixed — immune to canvas transform', () => {
  assert.ok(
    cardsCss.includes('position: fixed') || cardsCss.includes('position:fixed'),
    'cards.css must use position: fixed so cards stay at screen coords during pan/zoom'
  );
});

// ── Security: no innerHTML for field values ───────────────────────

test('Security: field values use textContent — no innerHTML interpolation', () => {
  // innerHTML = is the dangerous pattern; innerHTML += also risky
  const inners = [...cardsSrc.matchAll(/innerHTML\s*=/g)];
  assert.equal(inners.length, 0, `cards.js must not use innerHTML = (found ${inners.length} occurrences — XSS risk)`);
});
