// Tests for the step-aware hint matcher in src/lib/hint.js.
//
// The matcher's contract: given a puzzle's canonical solution() + the
// player's current canvas, return the next thing they should do. The
// match is by type + role + parent-type, NOT by node id, so user-placed
// nodes (which have generated ids, not canonical ones like `cpu-1`) are
// recognized as filling canonical slots.

import { describe, it, expect } from 'vitest';
import { findNextHint, matchCanonToUser } from './hint.js';
import { puzzles } from './puzzles.js';

function node(id, type, configOverrides = {}, position = { x: 0, y: 0 }, extra = {}) {
  return {
    id,
    type: 'system',
    position,
    data: { type, config: { ...configOverrides } },
    ...extra,
  };
}

function edge(from, to, kind) {
  return {
    id: `${from}->${to}`,
    source: from,
    target: to,
    ...(kind ? { data: { kind } } : {}),
  };
}

describe('matchCanonToUser — by type, role, and parent-type (not id)', () => {
  it('matches a user node with a generated id to a canonical node with a fixed id', () => {
    const canon = [node('cpu-1', 'cpu', { cores: 4 })];
    const user = [node('cpu-abc12345', 'cpu', { cores: 4 })];
    const { matched, unmatched } = matchCanonToUser(user, canon);
    expect(matched.get('cpu-1')).toBe('cpu-abc12345');
    expect(unmatched).toHaveLength(0);
  });

  it('matches by parent-type, not parent-id', () => {
    const canon = [
      node('computer-1', 'computer'),
      { ...node('cpu-1', 'cpu'), parentNode: 'computer-1' },
    ];
    const user = [
      node('user-computer-XYZ', 'computer'),
      { ...node('user-cpu-XYZ', 'cpu'), parentNode: 'user-computer-XYZ' },
    ];
    const { matched, unmatched } = matchCanonToUser(user, canon);
    expect(matched.size).toBe(2);
    expect(unmatched).toHaveLength(0);
  });

  it('does NOT match a node of the right type but wrong parent-type', () => {
    const canon = [
      node('computer-1', 'computer'),
      { ...node('cpu-1', 'cpu'), parentNode: 'computer-1' },
    ];
    const user = [
      node('user-computer', 'computer'),
      // CPU is top-level — same type, wrong parent (none vs computer).
      node('user-cpu', 'cpu'),
    ];
    const { matched, looseMatches, unmatched } = matchCanonToUser(user, canon);
    expect(matched.get('computer-1')).toBe('user-computer');
    expect(matched.has('cpu-1')).toBe(false);
    expect(looseMatches.get('cpu-1')).toBe('user-cpu');
    expect(unmatched.map((n) => n.id)).toContain('cpu-1');
  });

  it('matches role-aware types only when the role agrees', () => {
    const canon = [
      { ...node('svc-1', 'service'), data: { type: 'service', config: { role: 'appServer' } } },
      { ...node('svc-2', 'service'), data: { type: 'service', config: { role: 'worker' } } },
    ];
    const user = [
      { ...node('user-svc-A', 'service'), data: { type: 'service', config: { role: 'worker' } } },
    ];
    const { matched, unmatched } = matchCanonToUser(user, canon);
    // The single worker user-side fills the worker slot — appServer is still missing.
    expect(matched.get('svc-2')).toBe('user-svc-A');
    expect(matched.has('svc-1')).toBe(false);
    expect(unmatched.find((n) => n.id === 'svc-1')).toBeDefined();
  });
});

// THE BUG THE USER REPORTED: on Lesson 1, if you place a CPU and click
// Hint, the old code added a SECOND CPU (because it matched by id). With
// the new matcher, the Hint should advance to the next missing slot — RAM.
describe('findNextHint — L1 with a CPU already placed advances to RAM', () => {
  it('places RAM next, not a duplicate CPU', () => {
    const puzzle = puzzles.buildComputer;
    // Mimic the user's canvas: the L1 initial nodes (Computer + Program)
    // plus a CPU the user placed inside the Computer.
    const initial = puzzle.initialNodes();
    const userCpu = {
      id: 'cpu-user-placed',
      type: 'system',
      position: { x: 20, y: 50 },
      data: { type: 'cpu', config: { cores: 4 } },
      parentNode: initial.find((n) => n.data.type === 'computer').id,
    };
    const nodes = [...initial, userCpu];
    const action = findNextHint({ puzzle, nodes, edges: [], simResult: null });
    expect(action.action).toBe('place');
    // The next missing canonical piece in L1 is RAM.
    expect(action.node.data.type).toBe('ram');
    // And it's parented to the user's actual Computer id, not 'computer-1'.
    expect(action.node.parentNode).toBe(initial.find((n) => n.data.type === 'computer').id);
  });

  it('with CPU + RAM placed, advances to Disk', () => {
    const puzzle = puzzles.buildComputer;
    const initial = puzzle.initialNodes();
    const computerId = initial.find((n) => n.data.type === 'computer').id;
    const userCpu = { id: 'cpu-X', type: 'system', position: { x: 0, y: 0 },
      data: { type: 'cpu', config: { cores: 4 } }, parentNode: computerId };
    const userRam = { id: 'ram-X', type: 'system', position: { x: 0, y: 0 },
      data: { type: 'ram', config: { gb: 8 } }, parentNode: computerId };
    const action = findNextHint({
      puzzle, nodes: [...initial, userCpu, userRam], edges: [], simResult: null,
    });
    expect(action.action).toBe('place');
    expect(action.node.data.type).toBe('disk');
  });
});

describe('findNextHint — `move` action when right type, wrong parent', () => {
  it('suggests moving a top-level CPU into a Computer (not placing a 2nd CPU)', () => {
    const puzzle = puzzles.buildComputer;
    const initial = puzzle.initialNodes();
    // CPU placed top-level by mistake.
    const orphanCpu = { id: 'cpu-orphan', type: 'system', position: { x: 30, y: 30 },
      data: { type: 'cpu', config: { cores: 4 } } };
    const nodes = [...initial, orphanCpu];
    const action = findNextHint({ puzzle, nodes, edges: [], simResult: null });
    expect(action.action).toBe('move');
    expect(action.nodeId).toBe('cpu-orphan');
    expect(action.targetParentType).toBe('computer');
  });
});

describe('findNextHint — Layer 2: per-puzzle override wins when defined', () => {
  it('uses puzzle.hint() return value verbatim', () => {
    const puzzle = {
      ...puzzles.buildComputer,
      hint: () => ({
        action: 'message',
        title: 'Custom override fired.',
        rationale: 'For this puzzle the override said so.',
      }),
    };
    const action = findNextHint({
      puzzle, nodes: puzzle.initialNodes(), edges: [], simResult: null,
    });
    expect(action.action).toBe('message');
    expect(action.title).toBe('Custom override fired.');
  });

  it('falls through to the default matcher when override returns null', () => {
    const puzzle = { ...puzzles.buildComputer, hint: () => null };
    const action = findNextHint({
      puzzle, nodes: puzzle.initialNodes(), edges: [], simResult: null,
    });
    // Default matcher should still find something to do (place CPU first).
    expect(action.action).toBe('place');
  });

  it('falls through to the default matcher when override throws', () => {
    const puzzle = {
      ...puzzles.buildComputer,
      hint: () => { throw new Error('boom'); },
    };
    const action = findNextHint({
      puzzle, nodes: puzzle.initialNodes(), edges: [], simResult: null,
    });
    expect(action.action).toBe('place');
  });
});

describe('findNextHint — Layer 3: failing-requirement fallback', () => {
  it('when canonical is fully placed but the puzzle isn\'t passing, shows the failing requirement', () => {
    // Build a synthetic puzzle whose canonical = current nodes (so no
    // canonical action remains), but whose requirement fails on the
    // simResult we pass in.
    const puzzle = {
      id: 'syntheticFailing',
      order: 1,
      kind: 'flow',
      requirements: [
        { key: 'fakeReq', label: 'Fake check', test: () => false, lesson: 'Do the thing.' },
      ],
      solution: () => ({ nodes: [], edges: [] }),
    };
    const action = findNextHint({
      puzzle,
      nodes: [],
      edges: [],
      simResult: { ok: true, kind: 'flow', successRate: 0 },
    });
    expect(action.action).toBe('message');
    expect(action.title).toBe('Fake check');
    expect(action.rationale).toBe('Do the thing.');
  });

  it('returns the "all checks pass" message when requirements all pass', () => {
    const puzzle = {
      id: 'syntheticPassing',
      order: 1,
      kind: 'flow',
      requirements: [
        { key: 'okReq', label: 'OK', test: () => true, lesson: 'unused' },
      ],
      solution: () => ({ nodes: [], edges: [] }),
    };
    const action = findNextHint({
      puzzle, nodes: [], edges: [],
      simResult: { ok: true, kind: 'flow', successRate: 1 },
    });
    expect(action.action).toBe('message');
    expect(action.title).toMatch(/click ▶ Run|All checks/i);
  });
});

describe('findNextHint — edge wiring after all nodes match', () => {
  it('suggests wiring an edge using the USER\'s node ids (not canonical ids)', () => {
    const puzzle = {
      id: 'wireTest',
      order: 1,
      kind: 'flow',
      requirements: [{ key: 'r', label: 'r', test: () => true }],
      solution: () => ({
        nodes: [
          node('client-1', 'client'),
          node('lb-1', 'loadBalancer'),
        ],
        edges: [edge('client-1', 'lb-1')],
      }),
    };
    const nodes = [
      node('user-client', 'client'),
      node('user-lb', 'loadBalancer'),
    ];
    const action = findNextHint({ puzzle, nodes, edges: [], simResult: null });
    expect(action.action).toBe('wire');
    expect(action.edge.source).toBe('user-client');
    expect(action.edge.target).toBe('user-lb');
  });

  it('skips edges already present (canonical → user edge match)', () => {
    const puzzle = {
      id: 'wireTest',
      order: 1,
      kind: 'flow',
      requirements: [{ key: 'r', label: 'r', test: () => true }],
      solution: () => ({
        nodes: [
          node('client-1', 'client'),
          node('lb-1', 'loadBalancer'),
          node('vps-1', 'vps'),
        ],
        edges: [edge('client-1', 'lb-1'), edge('lb-1', 'vps-1')],
      }),
    };
    const userNodes = [
      node('uc', 'client'),
      node('ulb', 'loadBalancer'),
      node('uv', 'vps'),
    ];
    const userEdges = [edge('uc', 'ulb')]; // already wired
    const action = findNextHint({
      puzzle, nodes: userNodes, edges: userEdges, simResult: null,
    });
    expect(action.action).toBe('wire');
    // First missing canonical edge is lb→vps; matcher should resolve to ulb→uv.
    expect(action.edge.source).toBe('ulb');
    expect(action.edge.target).toBe('uv');
  });
});
