/**
 * ArtifactNormalizer — transforms raw Aitri artifact data into GraphData.
 * @aitri-trace FR-ID: FR-001, FR-006, US-ID: US-001, US-006, TC-ID: TC-001e, TC-006h, TC-006f
 */

const VALID_STATUSES = new Set(['pending', 'in_progress', 'approved', 'complete', 'drift']);

/**
 * Derive a safe status value. Falls back to 'pending' for unknown values.
 * @aitri-trace TC-ID: TC-002f
 */
function safeStatus(value) {
  return VALID_STATUSES.has(value) ? value : 'pending';
}

/**
 * Derive status from .aitri pipeline state for a given phase number.
 * Phase 1 = requirements/user-stories, Phase 3 = test cases.
 */
function deriveFromAitri(aitriState, phase) {
  if (!aitriState) return 'pending';
  const approved  = aitriState.approvedPhases  ?? [];
  const completed = aitriState.completedPhases ?? [];
  const drift     = aitriState.driftPhases     ?? [];
  const current   = aitriState.currentPhase;
  if (drift.includes(phase))     return 'drift';
  if (completed.includes(phase)) return 'complete';
  if (approved.includes(phase))  return 'approved';
  if (current === phase)         return 'in_progress';
  return 'pending';
}

/**
 * Extract project name from artifacts.
 */
function extractName(artifacts) {
  return (
    artifacts.requirements?.project_name ??
    artifacts.name ??
    'Unnamed Project'
  );
}

/**
 * Normalize raw ArtifactData into GraphData for Cytoscape.
 * Handles: explicit epics field, functional_requirements, user_stories,
 * test_cases_inline (mock), testCases.test_cases (full pipeline), dependencies.
 *
 * @param {object} artifacts - { requirements, testCases, aitriState }
 * @returns {{ projectId: string, nodes: GraphNode[], edges: GraphEdge[] }}
 * @aitri-trace FR-ID: FR-001, FR-006, TC-ID: TC-001e, TC-006h, TC-006f
 */
export function normalize(artifacts) {
  const req = artifacts.requirements ?? {};
  const tc  = artifacts.testCases ?? null;
  const ai  = artifacts.aitriState ?? null;

  const nodes = [];
  const edges = [];
  const nodeIds = new Set();

  function addNode(node) {
    nodes.push(node);
    nodeIds.add(node.id);
  }

  function addEdge(source, target, edgeType) {
    if (!nodeIds.has(source) || !nodeIds.has(target)) return; // skip dangling edges
    edges.push({
      id: `e-${source}-${target}-${edgeType}`,
      source,
      target,
      edgeType,
    });
  }

  // ── Phase 1 status (applies to FRs + USs) ──
  const p1Status = deriveFromAitri(ai, 1);
  const p3Status = deriveFromAitri(ai, 3);

  // ── Epics ──────────────────────────────────────────────────────
  const epics = req.epics ?? [];
  if (epics.length === 0) {
    // Synthetic single epic from project name
    addNode({
      id: 'EPIC-01',
      label: truncate(extractName(artifacts), 18),
      fullTitle: extractName(artifacts),
      type: 'epic',
      status: safeStatus(p1Status),
      parentId: null,
      dependencies: [],
      collapsed: false,
    });
  } else {
    epics.forEach(e => {
      addNode({
        id: e.id,
        label: truncate(e.title ?? e.id, 18),
        fullTitle: e.title ?? e.id,
        type: 'epic',
        status: safeStatus(e.status ?? p1Status),
        parentId: null,
        dependencies: [],
        collapsed: false,
      });
    });
  }

  // ── Features (functional_requirements) ────────────────────────
  const frs = req.functional_requirements ?? [];
  frs.forEach(fr => {
    const epicId = fr.epic_id ?? (epics.length === 0 ? 'EPIC-01' : epics[0].id);
    addNode({
      id: fr.id,
      label: truncate(fr.title ?? fr.id, 16),
      fullTitle: fr.title ?? fr.id,
      type: 'feature',
      status: safeStatus(fr.status ?? p1Status),
      parentId: epicId,
      dependencies: fr.dependencies ?? [],
      collapsed: false,
    });
  });

  // ── User Stories ──────────────────────────────────────────────
  const uss = req.user_stories ?? [];
  uss.forEach(us => {
    const label = us.i_want
      ? truncate(us.i_want, 18)
      : (us.id ?? 'User Story');
    addNode({
      id: us.id,
      label,
      fullTitle: us.as_a ? `As a ${us.as_a}, ${us.i_want}` : (us.id ?? 'User Story'),
      type: 'user_story',
      status: safeStatus(us.status ?? p1Status),
      parentId: us.requirement_id ?? null,
      dependencies: us.dependencies ?? [],
      collapsed: false,
    });
  });

  // ── Test Cases ─────────────────────────────────────────────────
  // From mock.json inline test cases
  const inlineTCs = req.test_cases_inline ?? [];
  // From 03_TEST_CASES.json
  const pipelineTCs = tc?.test_cases ?? [];
  const allTCs = [...inlineTCs, ...pipelineTCs];

  allTCs.forEach(t => {
    const parentId = t.user_story_id ?? t.requirement_id ?? null;
    addNode({
      id: t.id,
      label: t.id,
      fullTitle: t.title ?? t.id,
      type: 'test_case',
      status: safeStatus(t.status ?? p3Status),
      parentId,
      dependencies: t.dependencies ?? [],
      collapsed: false,
    });
  });

  // ── Hierarchy edges ────────────────────────────────────────────
  nodes.forEach(node => {
    if (node.parentId && nodeIds.has(node.parentId)) {
      addEdge(node.parentId, node.id, 'hierarchy');
    }
  });

  // ── Dependency edges ──────────────────────────────────────────
  nodes.forEach(node => {
    (node.dependencies ?? []).forEach(depId => {
      if (nodeIds.has(depId)) {
        addEdge(node.id, depId, 'dependency');
      }
      // Silently skip non-existent dependency targets (TC-006f)
    });
  });

  return { nodes, edges };
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}
