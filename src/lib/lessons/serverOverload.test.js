// Targeted tests for L4.2 — "When the Server Can't Keep Up".
// The lesson teaches capacity-as-ceiling: a Client firing 1500 rps at a
// single VPS (cap 1000) drops ~500 rps. Two tweaks pass: raise capacity OR
// drop client rps. Canonical solution() raises capacity to 2000.
//
// What these tests pin down:
//   1. solution()'s graph passes the requirements (no drift between
//      canonical fix and the requirement thresholds).
//   2. The INITIAL canvas fails — otherwise the lesson is trivially solved
//      and there's no problem to teach.
//   3. The initial canvas's bottleneckLabel === 'VPS' — proves the
//      simulator genuinely models the overload (and the results panel
//      will point the student at the right node).

import { describe, it, expect } from 'vitest';
import { simulate } from '../simulator.js';
import { puzzles, evaluatePuzzle } from '../puzzles.js';

describe("L4.2 serverOverload — When the Server Can't Keep Up", () => {
  const puzzle = puzzles.serverOverload;

  it('exists in the puzzle registry with the right shape', () => {
    expect(puzzle).toBeDefined();
    expect(puzzle.id).toBe('serverOverload');
    expect(puzzle.kind).toBe('flow');
    expect(puzzle.difficulty).toBe('easy');
    expect(puzzle.track).toBe('systems');
  });

  it('solution() passes the puzzle requirements', () => {
    const { nodes, edges } = puzzle.solution();
    const result = simulate(puzzle, nodes, edges);
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('flow');
    const ev = evaluatePuzzle(puzzle, result);
    if (!ev.passed) {
      const failing = ev.results.find((r) => !r.passed);
      throw new Error(
        `serverOverload solution failed: ${failing?.label}. ` +
        `successRate=${result.successRate}, totalDropped=${result.totalDropped}`
      );
    }
    expect(ev.passed).toBe(true);
  });

  it('initial state does NOT pass — the lesson presents a real failing system', () => {
    const nodes = puzzle.initialNodes();
    const edges = puzzle.initialEdges?.() || [];
    const result = simulate(puzzle, nodes, edges);
    expect(result.ok).toBe(true);
    const ev = evaluatePuzzle(puzzle, result);
    expect(ev.passed).toBe(false);
    // Also pin down the exact-ish numbers so a future capacity/rps change
    // can't silently soften the lesson. 1500 rps in, 1000 cap → 500 dropped,
    // 1000/1500 ≈ 0.667 success.
    expect(result.totalDropped).toBeGreaterThan(490);
    expect(result.totalDropped).toBeLessThan(510);
    expect(result.successRate).toBeGreaterThan(0.65);
    expect(result.successRate).toBeLessThan(0.70);
  });

  it("initial state's bottleneckLabel is 'VPS' — the simulator identifies the overloaded node", () => {
    const nodes = puzzle.initialNodes();
    const edges = puzzle.initialEdges?.() || [];
    const result = simulate(puzzle, nodes, edges);
    expect(result.ok).toBe(true);
    expect(result.bottleneckLabel).toBe('VPS');
  });
});
