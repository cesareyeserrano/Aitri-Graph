/**
 * Unit tests — normalizer.js
 * Run: node --test tests/normalizer.test.js
 * @aitri-tc TC-001e, TC-002f, TC-006h, TC-006f
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../js/normalizer.js';

// ── TC-001e: hierarchy edges from FR→US→TC ─────────────────────
// @aitri-tc TC-001e
test('TC-001e: normalize produces correct hierarchy edges for FR→US→TC chain', () => {
  const artifacts = {
    requirements: {
      project_name: 'Test',
      functional_requirements: [{ id: 'FR-001', title: 'Search' }],
      user_stories: [{ id: 'US-001', requirement_id: 'FR-001', status: 'pending' }],
      test_cases_inline: [{ id: 'TC-001', requirement_id: 'FR-001', user_story_id: 'US-001', title: 'TC-001', status: 'pending' }],
    },
    testCases: null,
    aitriState: null,
  };

  const result = normalize(artifacts);
  const hierarchyEdges = result.edges.filter(e => e.edgeType === 'hierarchy');

  // EPIC-01 → FR-001
  assert.ok(hierarchyEdges.some(e => e.source === 'EPIC-01' && e.target === 'FR-001'),
    'EPIC-01 → FR-001 edge expected');
  // FR-001 → US-001
  assert.ok(hierarchyEdges.some(e => e.source === 'FR-001' && e.target === 'US-001'),
    'FR-001 → US-001 edge expected');
  // US-001 → TC-001
  assert.ok(hierarchyEdges.some(e => e.source === 'US-001' && e.target === 'TC-001'),
    'US-001 → TC-001 edge expected');
});

// ── TC-002f: unknown status defaults to 'pending' ─────────────
// @aitri-tc TC-002f
test('TC-002f: node with missing status field defaults to pending without throwing', () => {
  const artifacts = {
    requirements: {
      project_name: 'Test',
      functional_requirements: [{ id: 'FR-001', title: 'Feature' }],
      user_stories: [],
    },
    testCases: null,
    aitriState: null,
  };

  let result;
  assert.doesNotThrow(() => { result = normalize(artifacts); });
  const frNode = result.nodes.find(n => n.id === 'FR-001');
  assert.equal(frNode.status, 'pending', 'status should default to pending');
});

// ── TC-006h: dependency edge produced correctly ──────────────
// @aitri-tc TC-006h
test('TC-006h: normalize produces dependency edge for US-002 → US-001', () => {
  const artifacts = {
    requirements: {
      project_name: 'Test',
      functional_requirements: [{ id: 'FR-001', title: 'Feature' }],
      user_stories: [
        { id: 'US-001', requirement_id: 'FR-001', status: 'approved' },
        { id: 'US-002', requirement_id: 'FR-001', status: 'pending', dependencies: ['US-001'] },
      ],
    },
    testCases: null,
    aitriState: null,
  };

  const result = normalize(artifacts);
  const depEdges = result.edges.filter(e => e.edgeType === 'dependency');

  assert.equal(depEdges.length, 1, 'exactly 1 dependency edge expected');
  assert.equal(depEdges[0].source, 'US-002');
  assert.equal(depEdges[0].target, 'US-001');
});

// ── TC-006f: non-existent dependency ID is silently ignored ───
// @aitri-tc TC-006f
test('TC-006f: dependency referencing non-existent node ID does not crash and produces no edge', () => {
  const artifacts = {
    requirements: {
      project_name: 'Test',
      functional_requirements: [{ id: 'FR-001', title: 'Feature' }],
      user_stories: [
        { id: 'US-001', requirement_id: 'FR-001', dependencies: ['NON-EXISTENT-999'] },
      ],
    },
    testCases: null,
    aitriState: null,
  };

  let result;
  assert.doesNotThrow(() => { result = normalize(artifacts); });
  const danglingEdges = result.edges.filter(e => e.target === 'NON-EXISTENT-999');
  assert.equal(danglingEdges.length, 0, 'no edge should reference non-existent node');
});

// ── TC-008h: buildGitHubRawUrl constructs correct URL ─────────
// @aitri-tc TC-008h
test('TC-008h: buildGitHubRawUrl constructs correct raw.githubusercontent.com URL', async () => {
  const { buildGitHubRawUrl } = await import('../js/loader.js');
  const result = buildGitHubRawUrl('https://github.com/cesareyeserrano/Aitri', 'main', 'spec/01_REQUIREMENTS.json');
  assert.equal(result, 'https://raw.githubusercontent.com/cesareyeserrano/Aitri/main/spec/01_REQUIREMENTS.json');
});

// ── TC-011h: validateProjectInput — valid GitHub URL ──────────
// @aitri-tc TC-011h
test('TC-011h: validateProjectInput returns valid=true source=github for GitHub URL', async () => {
  const { validateProjectInput } = await import('../js/app.js');
  const result = validateProjectInput('https://github.com/cesareyeserrano/Aitri');
  assert.equal(result.valid, true);
  assert.equal(result.source, 'github');
});

// ── TC-011e: validateProjectInput — valid local path ──────────
// @aitri-tc TC-011e
test('TC-011e: validateProjectInput returns valid=true source=local for absolute path', async () => {
  const { validateProjectInput } = await import('../js/app.js');
  const result = validateProjectInput('/Users/cesareyeserrano/Documents/PROJECTS/Drafts/POC');
  assert.equal(result.valid, true);
  assert.equal(result.source, 'local');
});

// ── TC-011f: validateProjectInput — invalid input ─────────────
// @aitri-tc TC-011f
test('TC-011f: validateProjectInput returns valid=false with error.length>=10 for "myproject"', async () => {
  const { validateProjectInput } = await import('../js/app.js');
  const result = validateProjectInput('myproject');
  assert.equal(result.valid, false);
  assert.ok(result.error && result.error.length >= 10, `error message too short: "${result.error}"`);
});
