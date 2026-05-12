import { describe, it, expect } from 'vitest';
import {
  exitSide,
  getFloatingEdgeEndpoints,
  perimeterIntersection,
  nodeCenter,
} from './edgeGeometry.js';

function n(id, x, y, w = 100, h = 100) {
  return { id, position: { x, y }, width: w, height: h };
}

describe('nodeCenter', () => {
  it('returns the geometric center', () => {
    expect(nodeCenter(n('a', 0, 0, 100, 100))).toEqual({ x: 50, y: 50 });
    expect(nodeCenter(n('a', 200, 100, 200, 50))).toEqual({ x: 300, y: 125 });
  });

  it('prefers positionAbsolute over position', () => {
    const node = { id: 'a', position: { x: 5, y: 5 }, positionAbsolute: { x: 100, y: 200 }, width: 100, height: 100 };
    expect(nodeCenter(node)).toEqual({ x: 150, y: 250 });
  });

  it('falls back to default size when width/height missing', () => {
    // Default 170×90 → center at +85,+45 from position
    expect(nodeCenter({ id: 'a', position: { x: 0, y: 0 } })).toEqual({ x: 85, y: 45 });
  });
});

describe('perimeterIntersection', () => {
  const node = n('a', 0, 0, 100, 100); // center (50,50), half-size 50

  it('point to the RIGHT exits the right edge', () => {
    const p = perimeterIntersection(node, { x: 500, y: 50 });
    expect(p.x).toBe(100);
    expect(p.y).toBe(50);
  });

  it('point to the LEFT exits the left edge', () => {
    const p = perimeterIntersection(node, { x: -500, y: 50 });
    expect(p.x).toBe(0);
    expect(p.y).toBe(50);
  });

  it('point ABOVE exits the top edge', () => {
    const p = perimeterIntersection(node, { x: 50, y: -500 });
    expect(p.x).toBe(50);
    expect(p.y).toBe(0);
  });

  it('point BELOW exits the bottom edge', () => {
    const p = perimeterIntersection(node, { x: 50, y: 500 });
    expect(p.x).toBe(50);
    expect(p.y).toBe(100);
  });

  it('diagonal external point — 45 degrees — exits at a corner', () => {
    // Square node, equal dx and dy → t = 50/dx = 50/dy → hits (100,100).
    const p = perimeterIntersection(node, { x: 500, y: 500 });
    expect(p.x).toBe(100);
    expect(p.y).toBe(100);
  });

  it('shallow angle exits on the side closer to direction of travel', () => {
    // Mostly horizontal: dx=100 dy=10 → tx = 50/100 = 0.5, ty = 50/10 = 5
    // → t=0.5 → x = 50 + 0.5*100 = 100, y = 50 + 0.5*10 = 55
    const p = perimeterIntersection(node, { x: 150, y: 60 });
    expect(p.x).toBe(100);
    expect(p.y).toBe(55);
  });

  it('degenerate (point at center) returns center without error', () => {
    const p = perimeterIntersection(node, { x: 50, y: 50 });
    expect(p).toEqual({ x: 50, y: 50 });
  });

  it('handles rectangular (non-square) nodes', () => {
    const wide = n('w', 0, 0, 200, 50); // center (100,25), half 100x25
    // Point to the right: should exit the right edge at x=200, y=25
    const p = perimeterIntersection(wide, { x: 500, y: 25 });
    expect(p.x).toBe(200);
    expect(p.y).toBe(25);
  });
});

describe('exitSide', () => {
  const node = n('a', 0, 0, 100, 100); // center (50,50)

  it('returns "right" when external point is to the right', () => {
    expect(exitSide(node, { x: 500, y: 50 })).toBe('right');
  });
  it('returns "left" when external point is to the left', () => {
    expect(exitSide(node, { x: -500, y: 50 })).toBe('left');
  });
  it('returns "top" when external point is above', () => {
    expect(exitSide(node, { x: 50, y: -500 })).toBe('top');
  });
  it('returns "bottom" when external point is below', () => {
    expect(exitSide(node, { x: 50, y: 500 })).toBe('bottom');
  });
  it('picks the side closer to the line direction', () => {
    // Mostly horizontal: dx=100, dy=10 → exits right.
    expect(exitSide(node, { x: 150, y: 60 })).toBe('right');
    // Mostly vertical: dx=10, dy=100 → exits bottom.
    expect(exitSide(node, { x: 60, y: 150 })).toBe('bottom');
  });
});

describe('getFloatingEdgeEndpoints', () => {
  it('horizontal pair: source-right meets target-left', () => {
    const a = n('a', 0, 0, 100, 100);   // center (50,50)
    const b = n('b', 200, 0, 100, 100); // center (250,50)
    const { source, target } = getFloatingEdgeEndpoints(a, b);
    expect(source).toEqual({ x: 100, y: 50 }); // right edge of a
    expect(target).toEqual({ x: 200, y: 50 }); // left edge of b
  });

  it('vertical pair: source-bottom meets target-top', () => {
    const a = n('a', 0, 0, 100, 100);     // center (50,50)
    const b = n('b', 0, 200, 100, 100);   // center (50,250)
    const { source, target } = getFloatingEdgeEndpoints(a, b);
    expect(source).toEqual({ x: 50, y: 100 });
    expect(target).toEqual({ x: 50, y: 200 });
  });

  it('symmetric: swapping source and target swaps endpoints', () => {
    const a = n('a', 0, 0, 100, 100);
    const b = n('b', 200, 0, 100, 100);
    const ab = getFloatingEdgeEndpoints(a, b);
    const ba = getFloatingEdgeEndpoints(b, a);
    expect(ab.source).toEqual(ba.target);
    expect(ab.target).toEqual(ba.source);
  });
});
