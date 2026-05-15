// Lesson-specific tests for L6.7 "Latency Adds Up".
//
// The cross-puzzle contract in puzzles.test.js already verifies that
// solution() produces a graph that passes the requirements. These three
// tests are the *teaching contract* for THIS lesson: they prove the
// pedagogical claim ("the initial state is unsolved; the solution fixes
// the specific metric the lesson is about") is structurally enforced
// rather than aspirational. If someone tightens or loosens the latency
// threshold without thinking, these tests catch it.

import { describe, it, expect } from 'vitest';
import { puzzles, evaluatePuzzle } from '../puzzles.js';
import { simulate } from '../simulator.js';

const puzzle = puzzles.latencyAddsUp;

describe('L6.7 Latency Adds Up — lesson contract', () => {
  it('solution() satisfies every requirement', () => {
    const { nodes, edges } = puzzle.solution();
    const result = simulate(puzzle, nodes, edges);
    expect(result.ok).toBe(true);
    const ev = evaluatePuzzle(puzzle, result);
    expect(ev.passed).toBe(true);
  });

  it('initial state has avgLatency > 50 (puzzle is genuinely unsolved on load)', () => {
    // The whole pedagogical point of the lesson is that the player arrives
    // at a system that already runs (successful, no drops) but is too slow.
    // If a future tweak to default latencies brings the initial state under
    // the threshold, the lesson stops teaching anything. Lock the bar here.
    const nodes = puzzle.initialNodes();
    const edges = puzzle.initialEdges();
    const result = simulate(puzzle, nodes, edges);
    expect(result.ok).toBe(true);
    expect(result.avgLatency).toBeGreaterThan(50);
  });

  it('applying the solution drives avgLatency below 50 (the fix actually fixes the tested metric)', () => {
    const { nodes, edges } = puzzle.solution();
    const result = simulate(puzzle, nodes, edges);
    expect(result.ok).toBe(true);
    expect(result.avgLatency).toBeLessThan(50);
  });
});
