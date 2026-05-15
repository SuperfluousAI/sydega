// L4.1 — Your First Request. The first flow-track lesson the student sees,
// inserted between L4 (Point a Domain) and L5 (Add a Load Balancer). The
// pedagogy: introduce req/s, served, dropped, and the simplest possible
// Client → VPS shape before L5 cranks traffic past one VPS's capacity.
//
// Two tests:
// 1. The canonical solution() actually passes its own requirements when run
//    through the flow simulator. (The "solution drifted from requirements"
//    guard — same shape as the canonical-solution coverage in puzzles.test.js,
//    pinned to this lesson so future-me knows where to look if it breaks.)
// 2. The INITIAL state (Client + VPS, no wire) does NOT pass — the lesson is
//    non-trivial; the student has to wire them up to score.

import { describe, it, expect } from 'vitest';
import { simulate } from '../simulator.js';
import { puzzles, evaluatePuzzle } from '../puzzles.js';

describe('L4.1 Your First Request', () => {
  const puzzle = puzzles.yourFirstRequest;

  it('exists and is registered as a flow-kind systems lesson', () => {
    expect(puzzle).toBeDefined();
    expect(puzzle.kind).toBe('flow');
    expect(puzzle.track).toBe('systems');
    expect(puzzle.difficulty).toBe('easy');
  });

  it('canonical solution() passes every requirement', () => {
    const { nodes, edges } = puzzle.solution();
    const result = simulate(puzzle, nodes, edges);
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('flow');
    // Sanity: 300 rps against a 1000-cap VPS — nothing should drop.
    expect(result.totalDropped).toBe(0);
    expect(result.successRate).toBeGreaterThanOrEqual(0.99);

    const ev = evaluatePuzzle(puzzle, result);
    if (!ev.passed) {
      const failing = ev.results.find((r) => !r.passed);
      throw new Error(
        `yourFirstRequest solution failed requirement: ${failing?.label}`
      );
    }
    expect(ev.passed).toBe(true);
  });

  it('initial state (no wire) does NOT pass — the lesson is non-trivial', () => {
    // The student is handed a pre-placed Client and VPS with no edge between
    // them. Their one move is wiring the two together. Until they do, the
    // simulator sees a Client whose requests strand and a VPS receiving
    // nothing — success rate 0, served 0. Both requirements should be red.
    const nodes = puzzle.initialNodes();
    const edges = puzzle.initialEdges?.() || [];
    const result = simulate(puzzle, nodes, edges);
    expect(result.ok).toBe(true);
    const ev = evaluatePuzzle(puzzle, result);
    expect(ev.passed).toBe(false);
  });
});
