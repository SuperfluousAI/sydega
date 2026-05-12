// Helpers shared between the canvas drop logic and the App's re-parenting.

import { componentTypes } from './componentTypes.js';

// A node's top-left in world (canvas) coordinates. For parented nodes the
// stored `position` is relative to its parent, so walk up the chain.
export function worldPosition(node, nodes) {
  let x = node.position?.x || 0;
  let y = node.position?.y || 0;
  let currentParentId = node.parentNode;
  while (currentParentId) {
    const parent = nodes.find((n) => n.id === currentParentId);
    if (!parent) break;
    x += parent.position?.x || 0;
    y += parent.position?.y || 0;
    currentParentId = parent.parentNode;
  }
  return { x, y };
}

// React Flow v11 requires parents to appear before their children in the
// nodes array. Stable-sort by depth so re-parents render correctly.
export function sortParentsFirst(nodes) {
  const depth = new Map();
  function depthOf(id, seen = new Set()) {
    if (depth.has(id)) return depth.get(id);
    if (seen.has(id)) return 0;
    seen.add(id);
    const n = nodes.find((x) => x.id === id);
    if (!n || !n.parentNode) {
      depth.set(id, 0);
      return 0;
    }
    const d = 1 + depthOf(n.parentNode, seen);
    depth.set(id, d);
    return d;
  }
  return [...nodes].sort((a, b) => depthOf(a.id) - depthOf(b.id));
}

// Set of node ids that are descendants of rootId (used to prevent putting
// a container into one of its own descendants).
export function descendants(nodes, rootId) {
  const out = new Set();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    for (const n of nodes) {
      if (n.parentNode === id && !out.has(n.id)) {
        out.add(n.id);
        stack.push(n.id);
      }
    }
  }
  return out;
}

// Push any siblings overlapping with `movedNodeId` out along the axis of
// minimum overlap, with a small gap. Only handles direct collisions with the
// moved node (no cascading). Returns the updated nodes array plus the ids
// that actually moved (so the caller can animate them).
const SIBLING_GAP = 8;

export function scootSiblings(nodes, movedNodeId) {
  const moved = nodes.find((n) => n.id === movedNodeId);
  if (!moved) return { nodes, scootedIds: [] };
  const parentId = moved.parentNode || null;
  const siblings = nodes.filter(
    (n) => n.id !== movedNodeId && (n.parentNode || null) === parentId
  );
  if (siblings.length === 0) return { nodes, scootedIds: [] };

  const movedBounds = nodeBounds(moved);
  let next = nodes;
  const scootedIds = [];

  for (const sibling of siblings) {
    const currentSib = next.find((n) => n.id === sibling.id);
    const sibBounds = nodeBounds(currentSib);
    if (!overlaps(movedBounds, sibBounds)) continue;

    const xOverlap = Math.min(
      movedBounds.right - sibBounds.left,
      sibBounds.right - movedBounds.left
    );
    const yOverlap = Math.min(
      movedBounds.bottom - sibBounds.top,
      sibBounds.bottom - movedBounds.top
    );

    let dx = 0;
    let dy = 0;
    if (xOverlap < yOverlap) {
      const sibCx = (sibBounds.left + sibBounds.right) / 2;
      const movCx = (movedBounds.left + movedBounds.right) / 2;
      if (sibCx <= movCx) {
        dx = movedBounds.left - sibBounds.right - SIBLING_GAP;
      } else {
        dx = movedBounds.right - sibBounds.left + SIBLING_GAP;
      }
    } else {
      const sibCy = (sibBounds.top + sibBounds.bottom) / 2;
      const movCy = (movedBounds.top + movedBounds.bottom) / 2;
      if (sibCy <= movCy) {
        dy = movedBounds.top - sibBounds.bottom - SIBLING_GAP;
      } else {
        dy = movedBounds.bottom - sibBounds.top + SIBLING_GAP;
      }
    }

    next = next.map((n) =>
      n.id === sibling.id
        ? {
            ...n,
            position: {
              x: (n.position?.x || 0) + dx,
              y: (n.position?.y || 0) + dy,
            },
          }
        : n
    );
    scootedIds.push(sibling.id);
  }

  return { nodes: next, scootedIds };
}

function nodeBounds(node) {
  const meta = componentTypes[node.data.type];
  const w = node.style?.width || meta?.nodeStyle?.width || 170;
  const h = node.style?.height || meta?.nodeStyle?.height || 90;
  const x = node.position?.x || 0;
  const y = node.position?.y || 0;
  return { left: x, top: y, right: x + w, bottom: y + h };
}

function overlaps(a, b) {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

// Add CPU + RAM + Disk children to a Computer at sensible default positions
// inside it, so the player doesn't have to drag every part manually. Used by
// the Computer's dot-menu "Add hardware" action and by the palette
// "prepopulate" checkbox on drop. Returns a new nodes array.
//
// Also enlarges the Computer if its current bounds are too small to fit the
// three children laid out horizontally — otherwise children spill past the
// right edge, triggering the overshoot frame extension, which then visually
// covers the Computer's right handle. Tested in graph.test.js.
//
// Idempotent-ish: if the Computer already has children of a given type, we
// don't add a duplicate. This prevents the menu action from spamming parts
// when clicked twice.
const PREPOP_PADDING = 20;
const PREPOP_CHILD_W = 170;
const PREPOP_CHILD_H = 90;
const PREPOP_HEADER_OFFSET = 60;
const PREPOP_BOTTOM_PAD = 40;

export function prepopulateComputerHardware(nodes, computerId, now = Date.now()) {
  const computer = nodes.find((n) => n.id === computerId);
  if (!computer) return nodes;
  const existing = new Set(
    nodes.filter((n) => n.parentNode === computerId).map((n) => n.data.type)
  );

  // Horizontal layout: 3 children side-by-side, each PREPOP_CHILD_W wide,
  // PREPOP_PADDING between them. The Computer must be at least:
  //   3 × child_w + 4 × padding   wide
  //   header + child_h + bottom_pad  tall.
  const requiredW = PREPOP_PADDING + 3 * PREPOP_CHILD_W + 2 * PREPOP_PADDING + PREPOP_PADDING;
  const requiredH = PREPOP_HEADER_OFFSET + PREPOP_CHILD_H + PREPOP_BOTTOM_PAD;
  const curW = computer.style?.width || 340;
  const curH = computer.style?.height || 220;
  const newW = Math.max(curW, requiredW);
  const newH = Math.max(curH, requiredH);

  const placements = [
    { type: 'cpu',  config: { cores: 4 },  x: PREPOP_PADDING + 0 * (PREPOP_CHILD_W + PREPOP_PADDING) },
    { type: 'ram',  config: { gb: 8 },     x: PREPOP_PADDING + 1 * (PREPOP_CHILD_W + PREPOP_PADDING) },
    { type: 'disk', config: { gb: 100 },   x: PREPOP_PADDING + 2 * (PREPOP_CHILD_W + PREPOP_PADDING) },
  ];

  const additions = [];
  let nextId = now;
  for (const p of placements) {
    if (existing.has(p.type)) continue;
    additions.push({
      id: `${p.type}-${nextId++}-${Math.floor(Math.random() * 1000)}`,
      type: 'system',
      position: { x: p.x, y: PREPOP_HEADER_OFFSET },
      parentNode: computerId,
      data: { type: p.type, config: p.config },
    });
  }

  if (additions.length === 0 && newW === curW && newH === curH) return nodes;

  // Resize the Computer (only ever grow — never shrink the player's existing
  // box) and append the new children.
  const resized = nodes.map((n) =>
    n.id === computerId && (newW !== curW || newH !== curH)
      ? { ...n, style: { ...(n.style || {}), width: newW, height: newH } }
      : n
  );
  return [...resized, ...additions];
}

// Innermost container (smallest area) whose world bounds contain `position`.
export function findContainerAt(nodes, position, skipId = null) {
  const descSet = skipId ? descendants(nodes, skipId) : new Set();
  let best = null;
  let bestArea = Infinity;
  for (const n of nodes) {
    if (n.id === skipId) continue;
    if (descSet.has(n.id)) continue;
    const meta = componentTypes[n.data.type];
    if (!meta?.container) continue;
    const w = n.style?.width || meta.nodeStyle?.width || 320;
    const h = n.style?.height || meta.nodeStyle?.height || 200;
    const { x: nx, y: ny } = worldPosition(n, nodes);
    if (
      position.x >= nx &&
      position.x <= nx + w &&
      position.y >= ny &&
      position.y <= ny + h
    ) {
      const area = w * h;
      if (area < bestArea) {
        bestArea = area;
        best = n;
      }
    }
  }
  return best;
}
