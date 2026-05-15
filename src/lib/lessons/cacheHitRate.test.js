// L6.5 — "What a Cache Hit Rate Means". Single-knob lesson; the student
// dials Cache.hitRate from 0 to >=0.8 to stop a deliberately undersized DB
// from dropping reads. These tests pin the contract:
//   1. solution() passes.
//   2. The initial (hitRate=0) canvas does NOT pass.
//   3. The arithmetic the lesson teaches is what the sim actually computes
//      — 500 r/s reads, DB capped at 100; hitRate=0 drops ~400, hitRate=0.8
//      drops ~0.
// If any of these flips, either the sim semantics changed or the lesson did
// — both warrant a deliberate look, not a silent green.

import { describe, it, expect } from 'vitest';
import { puzzles, evaluatePuzzle } from '../puzzles.js';
import { simulate } from '../simulator.js';
import { defaultsFor } from '../componentTypes.js';

const puzzle = puzzles.cacheHitRate;

// Build the initial canvas (matches what the student sees on load).
function initialCanvas() {
  const nodes = puzzle.initialNodes();
  const edges = puzzle.initialEdges();
  return { nodes, edges };
}

// Same canvas but with hitRate overridden — used for the math sweep.
function canvasWithHitRate(hitRate) {
  const { nodes, edges } = initialCanvas();
  const patched = nodes.map((n) => {
    if (n.data.type !== 'cache') return n;
    return { ...n, data: { ...n.data, config: { ...n.data.config, hitRate } } };
  });
  return { nodes: patched, edges };
}

describe('L6.5 cacheHitRate — contract', () => {
  it('canonical solution() passes evaluation', () => {
    const { nodes, edges } = puzzle.solution();
    const result = simulate(puzzle, nodes, edges);
    expect(result.ok).toBe(true);
    const ev = evaluatePuzzle(puzzle, result);
    expect(ev.passed).toBe(true);
  });

  it('initial canvas (hitRate=0) does NOT pass — that is the lesson', () => {
    const { nodes, edges } = initialCanvas();
    const result = simulate(puzzle, nodes, edges);
    expect(result.ok).toBe(true);
    const ev = evaluatePuzzle(puzzle, result);
    expect(ev.passed).toBe(false);
    // Specifically the successRate requirement should be the one failing —
    // hasCache + hasDatabase are wired from the start.
    const failing = ev.results.find((r) => !r.passed);
    expect(failing?.key).toBe('successRate');
  });

  it('initial Cache config really is hitRate=0 (lesson preconditions)', () => {
    // Belt-and-suspenders: if a future refactor changes the cache defaults
    // and forgets the override on this puzzle, the lesson silently becomes
    // trivially solvable. Pin the precondition.
    const cacheNode = puzzle.initialNodes().find((n) => n.data.type === 'cache');
    expect(cacheNode).toBeDefined();
    expect(cacheNode.data.config.hitRate).toBe(0);
    // Also confirm the DB is the intentionally-small one — capacity 100,
    // not the default 1000. If this drifts the math breaks.
    const dbNode = puzzle.initialNodes().find((n) => n.data.type === 'database');
    expect(dbNode.data.config.capacity).toBe(100);
    // Sanity: the default DB cap is 1000, so 100 is a deliberate override.
    expect(defaultsFor('database', 'metadata').capacity).toBe(1000);
  });
});

describe('L6.5 cacheHitRate — the math the lesson teaches', () => {
  // 500 reads/sec into a Cache → DB.
  // At hitRate=0  : cache absorbs 0, DB sees 500, DB cap 100 → drops ~400.
  // At hitRate=0.8: cache absorbs 400, DB sees 100, DB cap 100 → drops ~0.
  // At hitRate=1.0: cache absorbs 500, DB sees 0   → drops 0.
  //
  // Using `>=` and small floats (rather than exact equality) because the sim
  // does fractional accounting and we don't want test brittleness around
  // sub-1 r/s rounding noise.

  it('hitRate=0 → most reads are dropped (DB cap saturates)', () => {
    const { nodes, edges } = canvasWithHitRate(0);
    const result = simulate(puzzle, nodes, edges);
    expect(result.ok).toBe(true);
    // Expect ~400 r/s dropped. Use a loose lower bound — 350 leaves margin
    // for any future fairness/scheduling changes in the sim.
    expect(result.totalDropped).toBeGreaterThan(350);
    expect(result.successRate).toBeLessThan(0.5);
  });

  it('hitRate=0.8 → DB exactly at cap, drops collapse to ~0', () => {
    const { nodes, edges } = canvasWithHitRate(0.8);
    const result = simulate(puzzle, nodes, edges);
    expect(result.ok).toBe(true);
    // Cache absorbs 400, DB sees 100, DB cap 100. Nothing dropped.
    expect(result.totalDropped).toBeLessThan(1);
    expect(result.successRate).toBeGreaterThanOrEqual(0.99);
  });

  it('hitRate=1.0 → cache serves everything; DB sees nothing', () => {
    const { nodes, edges } = canvasWithHitRate(1.0);
    const result = simulate(puzzle, nodes, edges);
    expect(result.ok).toBe(true);
    expect(result.totalDropped).toBeLessThan(1);
    expect(result.successRate).toBeGreaterThanOrEqual(0.99);
  });

  it('threshold sweep — 0.8 is the lowest passing hitRate (within step granularity)', () => {
    // The lesson promises "≥0.8 passes" — verify each cardinal point. Below
    // 0.8 the DB sees >100 r/s and drops; at/above 0.8 it's at or under cap.
    const samples = [
      { hitRate: 0.0, shouldPass: false },
      { hitRate: 0.5, shouldPass: false },
      { hitRate: 0.7, shouldPass: false },
      { hitRate: 0.8, shouldPass: true },
      { hitRate: 0.9, shouldPass: true },
      { hitRate: 1.0, shouldPass: true },
    ];
    for (const { hitRate, shouldPass } of samples) {
      const { nodes, edges } = canvasWithHitRate(hitRate);
      const result = simulate(puzzle, nodes, edges);
      const ev = evaluatePuzzle(puzzle, result);
      expect(ev.passed, `hitRate=${hitRate} expected passed=${shouldPass}`).toBe(shouldPass);
    }
  });
});
