// Lesson L8.5 — Why Have Two. Tests the lesson's pedagogy directly:
//   1) the canonical solution passes all requirements,
//   2) the initial single-VPS state does NOT pass (the "≥ 2 VPSes" rule
//      is what teaches redundancy),
//   3) marking one VPS as failed leaves the other one serving the full
//      500 rps — proving the redundancy this lesson sells actually works
//      under the failure-injection feature.
//
// This is the load-bearing test for the *teaching*: if a future change
// breaks the simulator's failure-injection path for sinks, this test
// catches it and tells you the regression is "L8.5 stops teaching what
// it claims to."

import { describe, it, expect } from 'vitest';
import { puzzles, evaluatePuzzle } from '../puzzles.js';
import { simulate } from '../simulator.js';

const puzzle = puzzles.whyHaveTwo;

describe('L8.5 whyHaveTwo', () => {
  it('solution() passes all requirements', () => {
    const { nodes, edges } = puzzle.solution();
    const result = simulate(puzzle, nodes, edges);
    expect(result.ok).toBe(true);
    const ev = evaluatePuzzle(puzzle, result);
    expect(ev.passed).toBe(true);
    // Sanity: every requirement individually passes too.
    for (const row of ev.results) {
      expect(row.passed).toBe(true);
    }
  });

  it('initial state (single VPS) does NOT pass — the redundancy requirement bites', () => {
    const nodes = puzzle.initialNodes();
    const edges = puzzle.initialEdges();
    const result = simulate(puzzle, nodes, edges);
    expect(result.ok).toBe(true);
    // The capacity math works fine (500 rps into one cap-1000 VPS).
    expect(result.successRate).toBeGreaterThanOrEqual(0.99);
    // …but the "≥ 2 VPSes" presence predicate fails. That's the lesson:
    // a single-VPS topology *looks* healthy on a green-path run, yet the
    // puzzle refuses to mark it solved until you add redundancy.
    const ev = evaluatePuzzle(puzzle, result);
    expect(ev.passed).toBe(false);
    const redundancyRow = ev.results.find((r) => r.key === 'hasRedundantVps');
    expect(redundancyRow).toBeDefined();
    expect(redundancyRow.passed).toBe(false);
  });

  it('with the solution, failing one VPS keeps the other serving traffic (redundancy pays off)', () => {
    // The pedagogical payoff baked into the simulator: when one of the
    // two VPSes is marked data.failed = true, the LB routes all traffic
    // to the survivor. With cap 1000 and inbound 500 rps, the survivor
    // handles it cleanly — success rate stays high.
    const { nodes, edges } = puzzle.solution();
    const withOneFailed = nodes.map((n) =>
      n.id === 'vps-1' ? { ...n, data: { ...n.data, failed: true } } : n
    );
    const result = simulate(puzzle, withOneFailed, edges);
    expect(result.ok).toBe(true);
    // The survivor (cap 1000) absorbs the full 500 rps — no drops.
    expect(result.successRate).toBeGreaterThanOrEqual(0.99);
    expect(result.totalServed).toBeGreaterThanOrEqual(495);
    // Contrast: if we fail BOTH VPSes, the LB has nothing to route to and
    // every request strands. (Asserting the contrast keeps the "two is
    // enough, one is not" framing tight.)
    const bothFailed = nodes.map((n) =>
      n.data?.type === 'vps' ? { ...n, data: { ...n.data, failed: true } } : n
    );
    const result2 = simulate(puzzle, bothFailed, edges);
    expect(result2.ok).toBe(true);
    expect(result2.totalServed).toBe(0);
  });
});
