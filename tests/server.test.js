/**
 * Integration tests — server.js API endpoint
 * Run: node --test tests/server.test.js
 * Requires: node server.js running on localhost:3000 (or PORT env var)
 * @aitri-tc TC-009h, TC-009e, TC-009f, TC-NFR005h, TC-NFR005f
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

const PORT = process.env.PORT ?? 3000;
const BASE = `http://localhost:${PORT}`;

// ── Test fixtures ─────────────────────────────────────────────────

const VALID_PROJECT_PATH = '/tmp/aitri-test-project';
const NO_ARTIFACTS_PATH  = '/tmp/aitri-no-artifacts';
const NONEXISTENT_PATH   = '/tmp/aitri-does-not-exist-xyz789';

before(() => {
  // Create valid test project
  mkdirSync(join(VALID_PROJECT_PATH, 'spec'), { recursive: true });
  writeFileSync(join(VALID_PROJECT_PATH, 'spec', '01_REQUIREMENTS.json'), JSON.stringify({
    project_name: 'Test Project',
    functional_requirements: [{ id: 'FR-001', title: 'Feature One' }],
    user_stories: [],
  }));

  // Create path with no artifacts
  mkdirSync(NO_ARTIFACTS_PATH, { recursive: true });
});

after(() => {
  if (existsSync(VALID_PROJECT_PATH)) rmSync(VALID_PROJECT_PATH, { recursive: true });
  if (existsSync(NO_ARTIFACTS_PATH))  rmSync(NO_ARTIFACTS_PATH,  { recursive: true });
});

// ── TC-009h: valid path returns 200 with artifacts ─────────────
// @aitri-tc TC-009h
test('TC-009h: GET /api/project returns 200 with artifacts for valid Aitri path', async () => {
  const res = await fetch(`${BASE}/api/project?path=${encodeURIComponent(VALID_PROJECT_PATH)}`);
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.source, 'local');
  assert.equal(body.artifacts.requirements.project_name, 'Test Project');
});

// ── TC-009e: missing optional files returns null fields ────────
// @aitri-tc TC-009e
test('TC-009e: GET /api/project returns 200 with testCases=null when 03_TEST_CASES.json absent', async () => {
  const res = await fetch(`${BASE}/api/project?path=${encodeURIComponent(VALID_PROJECT_PATH)}`);
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.artifacts.testCases, null);
  assert.equal(body.artifacts.aitriState, null);
});

// ── TC-009f: non-existent path returns 404 ─────────────────────
// @aitri-tc TC-009f
test('TC-009f: GET /api/project returns 404 for non-existent path', async () => {
  const res = await fetch(`${BASE}/api/project?path=${encodeURIComponent(NONEXISTENT_PATH)}`);
  assert.equal(res.status, 404);

  const body = await res.json();
  assert.ok(body.error && body.error.length >= 10, `error too short: "${body.error}"`);
});

// ── TC-NFR005h: path traversal returns 400 ────────────────────
// @aitri-tc TC-NFR005h
test('TC-NFR005h: GET /api/project?path=../../etc/passwd returns 400 with no file content', async () => {
  const res = await fetch(`${BASE}/api/project?path=../../etc/passwd`);
  assert.equal(res.status, 400);

  const body = await res.json();
  assert.equal(body.error, 'Invalid path: traversal not allowed');
  // Ensure no /etc/passwd content leaked
  assert.ok(!JSON.stringify(body).includes('root:'), 'response must not contain /etc/passwd content');
});

// ── TC-NFR005f: relative path returns 400 ─────────────────────
// @aitri-tc TC-NFR005f
test('TC-NFR005f: GET /api/project?path=relative/path returns 400', async () => {
  const res = await fetch(`${BASE}/api/project?path=relative/path/without/slash`);
  assert.equal(res.status, 400);

  const body = await res.json();
  assert.equal(body.error, 'Invalid path: must be absolute');
});

// ── No artifacts returns 422 ───────────────────────────────────
test('server returns 422 for path without spec/01_REQUIREMENTS.json', async () => {
  const res = await fetch(`${BASE}/api/project?path=${encodeURIComponent(NO_ARTIFACTS_PATH)}`);
  assert.equal(res.status, 422);

  const body = await res.json();
  assert.ok(body.error.includes('No Aitri artifacts'), `expected no-artifacts message, got: "${body.error}"`);
});
