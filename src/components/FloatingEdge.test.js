import { describe, it, expect } from 'vitest';
import { endpointClassName, arrowsOf } from './FloatingEdge.jsx';

// The either-or rule: at each endpoint, the player sees EITHER an arrowhead
// (rendered as the SVG markerEnd/markerStart) OR a clickable dot, never
// both. Both states are clickable so the player can toggle in both
// directions, but only one is visually rendered at a time.
//
// Caught: an earlier build rendered a filled dot ON TOP of the arrow,
// making both visible simultaneously. This test pins the rule down so
// that visual regression can't happen unnoticed.

describe('FloatingEdge endpoint affordance — either dot OR arrow, never both', () => {
  it('a side WITH an arrow renders the invisible "with-arrow" hot zone (no dot)', () => {
    expect(endpointClassName(true)).toBe('with-arrow');
  });

  it('a side WITHOUT an arrow renders the visible "as-dot" affordance', () => {
    expect(endpointClassName(false)).toBe('as-dot');
  });

  it('the two states are mutually exclusive classes (true ≠ false)', () => {
    expect(endpointClassName(true)).not.toBe(endpointClassName(false));
  });

  it.each([
    [{ source: false, target: false }, 'as-dot', 'as-dot'],
    [{ source: false, target: true  }, 'as-dot', 'with-arrow'],
    [{ source: true,  target: false }, 'with-arrow', 'as-dot'],
    [{ source: true,  target: true  }, 'with-arrow', 'with-arrow'],
  ])('arrows=%o → source=%s, target=%s', (arrows, expectSource, expectTarget) => {
    expect(endpointClassName(arrows.source)).toBe(expectSource);
    expect(endpointClassName(arrows.target)).toBe(expectTarget);
  });
});

describe('arrowsOf default — new edges are bidirectional', () => {
  it('returns { source: true, target: true } when data has no arrows', () => {
    expect(arrowsOf(undefined)).toEqual({ source: true, target: true });
    expect(arrowsOf({})).toEqual({ source: true, target: true });
    expect(arrowsOf({ kind: 'both' })).toEqual({ source: true, target: true });
  });

  it('returns the explicit arrows when present', () => {
    expect(arrowsOf({ arrows: { source: false, target: true } }))
      .toEqual({ source: false, target: true });
    expect(arrowsOf({ arrows: { source: true, target: false } }))
      .toEqual({ source: true, target: false });
    expect(arrowsOf({ arrows: { source: false, target: false } }))
      .toEqual({ source: false, target: false });
  });

  it('the bidirectional default has BOTH arrows on (symmetry)', () => {
    // Pins the operator's "default direction for a line between components
    // is bidirectional which also means there must be a directional arrow"
    // requirement: the default state has at least one arrow (in fact two).
    const d = arrowsOf(undefined);
    expect(d.source || d.target).toBe(true);
    expect(d.source).toBe(d.target);
  });
});
