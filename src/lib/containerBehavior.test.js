// Container-behavior contract — tests one rule per describe block, mirroring
// CONTAINER_BEHAVIOR.md. These tests pin down the five behaviors so the
// implementation can be verified without manual trial-and-error.

import { describe, it, expect } from 'vitest';
import {
  computeOvershoot,
  computeLeavingSides,
  isStillInsideParent,
  clampChildLocalPosition,
  HEADER_ZONE,
  LEAVE_MARGIN,
} from './containerBehavior.js';
import { defaultsFor } from './componentTypes.js';

const PARENT_W = 760;
const PARENT_H = 360;
const CHILD_W = 170;
const CHILD_H = 90;

function container(id, type, x, y, width, height, extra = {}) {
  return {
    id,
    type: 'system',
    position: { x, y },
    style: { width, height },
    data: { type, config: { ...defaultsFor(type) } },
    ...extra,
  };
}

function child(id, type, parentId, x, y) {
  return {
    id,
    type: 'system',
    position: { x, y },
    data: { type, config: { ...defaultsFor(type) } },
    parentNode: parentId,
  };
}

// ─── R1: Frame extends past the overlapping side by overshoot + 16px ──────

describe('R1 — frame extension on the overlapping side', () => {
  const PADDING = 16;
  const parent = container('p', 'computer', 100, 100, PARENT_W, PARENT_H);

  it('child sticking out the LEFT extends the frame left by overshoot + 16', () => {
    const c = child('c', 'phone', 'p', -30, 100);
    const r = computeOvershoot(parent, [parent, c]);
    expect(r.left).toBe(30 + PADDING);
  });

  it('child sticking out the TOP extends the frame top by overshoot + 16', () => {
    const c = child('c', 'phone', 'p', 200, -20);
    const r = computeOvershoot(parent, [parent, c]);
    expect(r.top).toBe(20 + PADDING);
  });

  it('child sticking out the RIGHT extends the frame right by overshoot + 16', () => {
    // child x=700, width=170 → child.right = 870. parent width 760. overshoot = 110.
    const c = child('c', 'phone', 'p', 700, 100);
    const r = computeOvershoot(parent, [parent, c]);
    expect(r.right).toBe(110 + PADDING);
  });

  it('child sticking out the BOTTOM extends the frame bottom by overshoot + 16', () => {
    // child y=300, height=90 → child.bottom = 390. parent height 360. overshoot = 30.
    const c = child('c', 'phone', 'p', 100, 300);
    const r = computeOvershoot(parent, [parent, c]);
    expect(r.bottom).toBe(30 + PADDING);
  });

  it('child fully inside the parent produces zero on all sides', () => {
    const c = child('c', 'phone', 'p', 200, 100);
    const r = computeOvershoot(parent, [parent, c]);
    expect(r).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('child near the edge but not crossing it produces zero (no padding-zone trigger)', () => {
    // child at x=5 — within the parent's left edge but not negative.
    const c = child('c', 'phone', 'p', 5, 100);
    const r = computeOvershoot(parent, [parent, c]);
    expect(r.left).toBe(0);
  });
});

// ─── R2: When one side overlaps, the other three do not move ──────────────

describe('R2 — other sides do not move', () => {
  const parent = container('p', 'computer', 100, 100, PARENT_W, PARENT_H);

  it('only LEFT child → top/right/bottom are all zero', () => {
    const c = child('c', 'phone', 'p', -30, 150);
    const r = computeOvershoot(parent, [parent, c]);
    expect(r.top).toBe(0);
    expect(r.right).toBe(0);
    expect(r.bottom).toBe(0);
    expect(r.left).toBeGreaterThan(0);
  });

  it('only TOP child → right/bottom/left are all zero', () => {
    const c = child('c', 'phone', 'p', 200, -30);
    const r = computeOvershoot(parent, [parent, c]);
    expect(r.right).toBe(0);
    expect(r.bottom).toBe(0);
    expect(r.left).toBe(0);
    expect(r.top).toBeGreaterThan(0);
  });

  it('only RIGHT child → top/bottom/left are all zero', () => {
    const c = child('c', 'phone', 'p', 700, 150);
    const r = computeOvershoot(parent, [parent, c]);
    expect(r.top).toBe(0);
    expect(r.bottom).toBe(0);
    expect(r.left).toBe(0);
    expect(r.right).toBeGreaterThan(0);
  });

  it('only BOTTOM child → top/right/left are all zero', () => {
    const c = child('c', 'phone', 'p', 200, 300);
    const r = computeOvershoot(parent, [parent, c]);
    expect(r.top).toBe(0);
    expect(r.right).toBe(0);
    expect(r.left).toBe(0);
    expect(r.bottom).toBeGreaterThan(0);
  });
});

// ─── R3: Parent's underlying position/size never change ───────────────────
//
// This is a *negative* assertion — there should be no code in the project
// that mutates a container's `style.width/height` or `position.x/y` in
// response to its children moving. We assert this by importing the reflow
// function (kept as a passthrough) and confirming it returns nodes
// unchanged for any input.

describe('R3 — parent position and size never change in response to children', () => {
  const { reflowContainers } = require('./reflow.js');

  it('reflowContainers is a passthrough — does not mutate position', () => {
    const parent = container('p', 'computer', 100, 100, 760, 360);
    const c = child('c', 'phone', 'p', -50, -50); // way out of bounds
    const before = [parent, c];
    const after = reflowContainers(before);
    expect(after).toBe(before);
  });

  it('reflowContainers is a passthrough — does not mutate size', () => {
    const parent = container('p', 'computer', 100, 100, 760, 360);
    const c = child('c', 'phone', 'p', 1000, 1000); // way out of bounds
    const before = [parent, c];
    const after = reflowContainers(before);
    const reflowedParent = after.find((n) => n.id === 'p');
    expect(reflowedParent.style.width).toBe(760);
    expect(reflowedParent.style.height).toBe(360);
  });
});

// ─── R4: Detach when center crosses the BASELINE edge, on any side ────────

describe('R4 — child detaches when its center crosses the baseline edge', () => {
  const parent = container('p', 'computer', 100, 100, PARENT_W, PARENT_H);

  it('LEFT: center past left edge → leaving=true on left', () => {
    // child x=-100, w=170 → center.x = -15. Past the left edge (x=0).
    const c = child('c', 'phone', 'p', -100, 150);
    const sides = computeLeavingSides(c, parent);
    expect(sides.left).toBe(true);
    expect(sides.right).toBe(false);
  });

  it('TOP: center past top edge → leaving=true on top', () => {
    const c = child('c', 'phone', 'p', 200, -50);
    const sides = computeLeavingSides(c, parent);
    expect(sides.top).toBe(true);
  });

  it('RIGHT: center past right edge → leaving=true on right', () => {
    // child x=700, w=170 → center.x = 785. Parent width 760. Past right edge.
    const c = child('c', 'phone', 'p', 700, 150);
    const sides = computeLeavingSides(c, parent);
    expect(sides.right).toBe(true);
    expect(sides.left).toBe(false);
  });

  it('BOTTOM: center past bottom edge → leaving=true on bottom', () => {
    // child y=320, h=90 → center.y = 365. Parent height 360. Past bottom.
    const c = child('c', 'phone', 'p', 200, 320);
    const sides = computeLeavingSides(c, parent);
    expect(sides.bottom).toBe(true);
  });

  it('child fully inside → no side reports leaving', () => {
    const c = child('c', 'phone', 'p', 200, 150);
    const sides = computeLeavingSides(c, parent);
    expect(sides.top).toBe(false);
    expect(sides.right).toBe(false);
    expect(sides.bottom).toBe(false);
    expect(sides.left).toBe(false);
  });
});

// ─── R5: Vibrate only fires when LEAVING — not for small overshoots ───────

describe('R5 — vibrate is only triggered by a "leaving" drag', () => {
  const parent = container('p', 'computer', 100, 100, PARENT_W, PARENT_H);

  it('small overshoot where center is still inside → leaving sides are false', () => {
    // child x=-20, w=170 → center.x = 65. Still inside (cx > 0).
    // Frame extends (R1 fires) but no side is "leaving".
    const c = child('c', 'phone', 'p', -20, 150);
    const sides = computeLeavingSides(c, parent);
    const r = computeOvershoot(parent, [parent, c]);
    expect(r.left).toBeGreaterThan(0); // R1 still triggers
    expect(sides.left).toBe(false); // but R5 does not
  });

  it('large overshoot where center crosses edge → leaving side is true', () => {
    // child x=-100, w=170 → center.x = -15. Past edge.
    const c = child('c', 'phone', 'p', -100, 150);
    const sides = computeLeavingSides(c, parent);
    expect(sides.left).toBe(true);
  });
});

describe('isStillInsideParent — forgiving leave threshold', () => {
  const parent = container('p', 'computer', 100, 100, PARENT_W, PARENT_H);

  it('child fully inside is still inside', () => {
    const c = child('c', 'phone', 'p', 100, 100);  // center 185, 145 in local
    expect(isStillInsideParent(c, parent)).toBe(true);
  });

  it('child whose center has crossed the right edge but stays within LEAVE_MARGIN is STILL inside', () => {
    // PARENT_W = 760, CHILD_W = 170. Center.x = parentW + LEAVE_MARGIN/2 (well within margin).
    const localX = PARENT_W + LEAVE_MARGIN / 2 - CHILD_W / 2;
    const c = child('c', 'phone', 'p', localX, 100);
    expect(isStillInsideParent(c, parent)).toBe(true);
  });

  it('child whose center has crossed the right edge by MORE than LEAVE_MARGIN is OUT', () => {
    const localX = PARENT_W + LEAVE_MARGIN + 1 - CHILD_W / 2;
    const c = child('c', 'phone', 'p', localX, 100);
    expect(isStillInsideParent(c, parent)).toBe(false);
  });

  it('returns false when parent is null', () => {
    expect(isStillInsideParent({}, null)).toBe(false);
  });

  it('accepts a custom margin', () => {
    // Center at parentW + 30. With default LEAVE_MARGIN=60, still inside.
    // With margin=10, out.
    const c = child('c', 'phone', 'p', PARENT_W - CHILD_W / 2 + 30, 100);
    expect(isStillInsideParent(c, parent, 60)).toBe(true);
    expect(isStillInsideParent(c, parent, 10)).toBe(false);
  });
});

describe('clampChildLocalPosition — header zone reservation', () => {
  it('clamps y up to HEADER_ZONE when below it', () => {
    expect(clampChildLocalPosition({ x: 50, y: 0 })).toEqual({ x: 50, y: HEADER_ZONE });
    expect(clampChildLocalPosition({ x: 50, y: 10 })).toEqual({ x: 50, y: HEADER_ZONE });
  });

  it('leaves y alone when already at or above HEADER_ZONE', () => {
    expect(clampChildLocalPosition({ x: 50, y: HEADER_ZONE })).toEqual({ x: 50, y: HEADER_ZONE });
    expect(clampChildLocalPosition({ x: 50, y: 100 })).toEqual({ x: 50, y: 100 });
  });

  it('never modifies x', () => {
    expect(clampChildLocalPosition({ x: -50, y: 0 })).toEqual({ x: -50, y: HEADER_ZONE });
    expect(clampChildLocalPosition({ x: 999, y: 999 })).toEqual({ x: 999, y: 999 });
  });

  it('tolerates missing fields', () => {
    expect(clampChildLocalPosition({})).toEqual({ x: 0, y: HEADER_ZONE });
    expect(clampChildLocalPosition(null)).toEqual({ x: 0, y: HEADER_ZONE });
  });
});
