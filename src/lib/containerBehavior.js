// The two pure functions that govern how a parent container reacts to its
// children, per CONTAINER_BEHAVIOR.md:
//
//   computeOvershoot(container, allNodes)
//     → { top, right, bottom, left } per-side pixel amounts the frame should
//        visually extend past the container's underlying bounds (R1 / R2).
//
//   computeLeavingSides(child, parent)
//     → { top, right, bottom, left } booleans indicating which sides the
//        child's center has crossed (R4 / R5).
//
// Both functions operate on the container's UNDERLYING (static, baseline)
// bounds — neither reads or assumes any frame-level visual extension. R3
// is enforced by the absence of any size/position mutation in this module.

import { componentTypes } from './componentTypes.js';

export const OVERSHOOT_PADDING = 16;

// Reserved zone at the top of every container for its header label
// (Computer's color banner, etc.). Children can't be placed at local y less
// than this — clamped on drop / drag-stop. Sized generously so the header
// has visible breathing room above the top of the first child row.
export const HEADER_ZONE = 36;

// How far past the parent's underlying edge the child's center must travel
// before separation triggers. Without this, light edge-grazing during a
// resize / reorder gesture would yank the child out of the parent.
export const LEAVE_MARGIN = 60;

const FALLBACK_CHILD_W = 170;
const FALLBACK_CHILD_H = 90;
const FALLBACK_CONTAINER_W = 320;
const FALLBACK_CONTAINER_H = 200;

function childSize(node) {
  const meta = componentTypes[node.data.type];
  return {
    w: node.style?.width || meta?.nodeStyle?.width || FALLBACK_CHILD_W,
    h: node.style?.height || meta?.nodeStyle?.height || FALLBACK_CHILD_H,
  };
}

function containerSize(container) {
  const meta = componentTypes[container.data.type];
  return {
    w: container.style?.width || meta?.nodeStyle?.width || FALLBACK_CONTAINER_W,
    h: container.style?.height || meta?.nodeStyle?.height || FALLBACK_CONTAINER_H,
  };
}

// R1 + R2 — per-side frame extension. Each side is independent.
export function computeOvershoot(container, allNodes) {
  const meta = componentTypes[container.data.type];
  if (!meta?.container) return null;
  const { w, h } = containerSize(container);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let hasChild = false;
  for (const c of allNodes) {
    if (c.parentNode !== container.id) continue;
    hasChild = true;
    const { w: cw, h: ch } = childSize(c);
    const cx = c.position?.x || 0;
    const cy = c.position?.y || 0;
    if (cx < minX) minX = cx;
    if (cx + cw > maxX) maxX = cx + cw;
    if (cy < minY) minY = cy;
    if (cy + ch > maxY) maxY = cy + ch;
  }
  if (!hasChild) return { top: 0, right: 0, bottom: 0, left: 0 };

  return {
    top: minY < 0 ? -minY + OVERSHOOT_PADDING : 0,
    right: maxX > w ? maxX - w + OVERSHOOT_PADDING : 0,
    bottom: maxY > h ? maxY - h + OVERSHOOT_PADDING : 0,
    left: minX < 0 ? -minX + OVERSHOOT_PADDING : 0,
  };
}

// R4 + R5 — which sides has the child's center crossed?
// Uses the parent's UNDERLYING bounds, not anything frame-extended.
export function computeLeavingSides(child, parent) {
  const { w: parentW, h: parentH } = containerSize(parent);
  const { w: cw, h: ch } = childSize(child);
  const cx = (child.position?.x || 0) + cw / 2;
  const cy = (child.position?.y || 0) + ch / 2;
  return {
    top: cy < 0,
    right: cx > parentW,
    bottom: cy > parentH,
    left: cx < 0,
  };
}

// True when the child's center is still within the parent's underlying
// bounds PLUS a forgiving leave margin. Used by the wouldSeparate decision
// in Canvas so a child grazing an edge during resize / reorder doesn't get
// yanked out of the parent.
export function isStillInsideParent(child, parent, margin = LEAVE_MARGIN) {
  if (!parent) return false;
  const { w: parentW, h: parentH } = containerSize(parent);
  const { w: cw, h: ch } = childSize(child);
  const cx = (child.position?.x || 0) + cw / 2;
  const cy = (child.position?.y || 0) + ch / 2;
  return cx >= -margin && cx <= parentW + margin && cy >= -margin && cy <= parentH + margin;
}

// Clamp a child's local position so it can't overlap the parent's header.
// Only affects y (header is at the top); x stays where the player placed it.
export function clampChildLocalPosition(pos, zone = HEADER_ZONE) {
  return {
    x: pos?.x || 0,
    y: Math.max(zone, pos?.y || 0),
  };
}
