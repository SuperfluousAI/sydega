// Regression test for the JS Sandbox track: every JS lesson's solution()
// canvas must pass every one of its testCases under the dataflow simulator.
// Catches the embarrassing case where a lesson ships with broken solution
// code or test cases that disagree with the solution.

import { describe, it, expect } from 'vitest';
import { simulate } from './simulator.js';
import { puzzles, puzzleOrder, evaluatePuzzle } from './puzzles.js';

const jsPuzzleIds = puzzleOrder.filter((id) => puzzles[id].track === 'javascript');

describe('JS Sandbox lessons — every solution passes its own test cases', () => {
  it('finds at least the 12 lessons promised in journal Part 24', () => {
    expect(jsPuzzleIds.length).toBeGreaterThanOrEqual(12);
  });

  it.each(jsPuzzleIds)('%s — solution() canvas passes every test case', (id) => {
    const puzzle = puzzles[id];
    expect(typeof puzzle.solution).toBe('function');
    const { nodes, edges } = puzzle.solution();
    const result = simulate(puzzle, nodes, edges);
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('dataflow');
    const ev = evaluatePuzzle(puzzle, result);
    if (!ev.passed) {
      // Surface which case failed for easier debugging.
      const failing = ev.results.find((r) => !r.passed);
      throw new Error(
        `${id} solution failed: ${failing?.label}. ` +
        `Actual: ${JSON.stringify(failing?.actual)}, Expected: ${JSON.stringify(failing?.expected)}`
      );
    }
    expect(ev.passed).toBe(true);
  });
});

describe('JS Sandbox lessons — starter code does NOT pass (otherwise the lesson is trivially solved)', () => {
  it.each(jsPuzzleIds)('%s — initial canvas fails at least one test case', (id) => {
    // Exception: J11 starts with two programs that are both identity,
    // and one of its test cases is { input: '', expected: '' }, which
    // identity → identity actually passes. So we expect at least one
    // FAILING case for the lesson to be non-trivial.
    const puzzle = puzzles[id];
    const nodes = puzzle.initialNodes();
    const edges = puzzle.initialEdges?.() || [];
    const result = simulate(puzzle, nodes, edges);
    expect(result.ok).toBe(true);
    const ev = evaluatePuzzle(puzzle, result);
    expect(ev.passed).toBe(false);
  });
});
