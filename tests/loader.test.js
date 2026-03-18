/**
 * Unit / integration tests for js/loader.js
 * Tests GitHub fetch logic with mocked global.fetch.
 * Run: node --test tests/loader.test.js
 * @aitri-tc TC-008e, TC-008f
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// ── fetch mock helpers ────────────────────────────────────────────

function makeFetch(handler) {
  return async (url) => handler(url);
}

function makeResponse(status, body = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const VALID_REQ = {
  project_name: 'Test Repo',
  functional_requirements: [],
  user_stories: [],
};

// ── TC-008f: non-existent repo throws LoadError NOT_FOUND ─────────
// @aitri-tc TC-008f
test('TC-008f: non-existent GitHub repo (404 on both branches) throws LoadError NOT_FOUND', async () => {
  const { loadProject, LoadError } = await import('../js/loader.js');

  const savedFetch = globalThis.fetch;
  globalThis.fetch = makeFetch(() => makeResponse(404));

  try {
    await loadProject({ source: 'github', url: 'https://github.com/owner/nonexistent-repo' });
    assert.fail('Expected LoadError to be thrown');
  } catch (err) {
    assert.ok(err instanceof LoadError, `expected LoadError, got ${err.constructor.name}: ${err.message}`);
    assert.equal(err.code, 'NOT_FOUND', `expected code NOT_FOUND, got ${err.code}`);
    assert.ok(err.message.length >= 10, `error message too short: "${err.message}"`);
  } finally {
    globalThis.fetch = savedFetch;
  }
});

// ── TC-008e: fallback to master branch when main returns 404 ──────
// @aitri-tc TC-008e
test('TC-008e: loader falls back to master branch when main branch returns 404', async () => {
  const { loadProject } = await import('../js/loader.js');

  const fetchedUrls = [];
  const savedFetch = globalThis.fetch;

  globalThis.fetch = makeFetch((url) => {
    fetchedUrls.push(url);
    if (url.includes('/main/')) return makeResponse(404);
    if (url.includes('/master/')) return makeResponse(200, VALID_REQ);
    return makeResponse(404);
  });

  try {
    const result = await loadProject({ source: 'github', url: 'https://github.com/owner/legacy-repo' });
    const masterCalls = fetchedUrls.filter(u => u.includes('/master/'));
    assert.ok(masterCalls.length > 0, 'fetch was never called with a /master/ URL');
    assert.ok(result.artifacts.requirements !== null, 'requirements should be populated');
    assert.equal(result.source, 'github');
  } finally {
    globalThis.fetch = savedFetch;
  }
});
