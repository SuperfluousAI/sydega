// Step-aware hint finder. Approach 3 (hybrid) from journal Part 25:
//
//   1. Per-puzzle override   — if puzzle.hint(...) is defined, it gets first
//                               say. Returns one of the four action shapes
//                               below, or null to fall through.
//
//   2. Type-aware matching   — match each canonical solution node 1-to-1 to
//      against canonical       a user node with the SAME type/role AND the
//                               same parent-type. The first canonical node
//                               that has no user match is what's missing.
//                               Same for edges, after all nodes are matched.
//
//   3. Failing-requirement   — if everything canonical is matched but the
//      fallback                puzzle isn't passing, show the first failing
//                               requirement's `lesson:` text as guidance.
//
// Returns an action object the caller (App.handleHint) translates into a
// gold-pulse + canvas banner. Shapes:
//
//   { action: 'place',   node, parentRebindId?, rationale }
//   { action: 'wire',    edge:{id,source,target,data?}, rationale }
//   { action: 'move',    nodeId, targetParentType, rationale }
//   { action: 'message', title, rationale }
//   null                 — no hint available
//
// The `move` action covers the case where the user placed the right TYPE
// of component but in the wrong place (e.g. CPU on canvas instead of
// inside a Computer). Rather than placing a second CPU, we tell them to
// drag their existing one in.

import { componentTypes, metaFor } from './componentTypes.js';
import { sortParentsFirst } from './graph.js';
import { findHintRationale, findHintEdgeRationale } from './hintRationale.js';
import { evaluatePuzzle } from './puzzles.js';

function typeOf(node) { return node.data?.type; }
function roleOf(node) { return node.data?.config?.role || null; }
function parentTypeOf(node, allNodes) {
  if (!node.parentNode) return null;
  const p = allNodes.find((n) => n.id === node.parentNode);
  return p ? typeOf(p) : null;
}
function labelOf(node) {
  return metaFor(node)?.label || componentTypes[typeOf(node)]?.label || typeOf(node);
}

// Match canonical nodes 1-to-1 to user nodes. Walks canonical parents-first
// so by the time we check a child's parent-type, the parent's match (if any)
// has already been recorded. Returns { matched, unmatched, looseMatches }
// where:
//   matched       : Map<canonId, userId>     — full match (type + role + parent-type)
//   unmatched     : canonical nodes with no match
//   looseMatches  : Map<canonId, userId>     — same type+role but parent-type mismatch
//                                              (used to suggest a `move` action)
export function matchCanonToUser(userNodes, canonNodes) {
  const matched = new Map();
  const looseMatches = new Map();
  const usedUserIds = new Set();
  const ordered = sortParentsFirst(canonNodes);
  for (const canon of ordered) {
    const canonType = typeOf(canon);
    const canonRole = roleOf(canon);
    const canonParentType = parentTypeOf(canon, canonNodes);

    // Pass 1: exact match (type + role + parent-type).
    let match = userNodes.find((u) => {
      if (usedUserIds.has(u.id)) return false;
      if (typeOf(u) !== canonType) return false;
      if (roleOf(u) !== canonRole) return false;
      return parentTypeOf(u, userNodes) === canonParentType;
    });
    if (match) {
      matched.set(canon.id, match.id);
      usedUserIds.add(match.id);
      continue;
    }

    // Pass 2: loose match — same type+role, wrong parent-type. Track for
    // the `move` action so we don't duplicate-place when the player just
    // put the right thing in the wrong place.
    match = userNodes.find((u) => {
      if (usedUserIds.has(u.id)) return false;
      if (typeOf(u) !== canonType) return false;
      if (roleOf(u) !== canonRole) return false;
      return true;
    });
    if (match) {
      looseMatches.set(canon.id, match.id);
      // Don't consume the user node — a future canon slot with the right
      // parent might still want to claim it via the `move` action.
    }
  }
  const unmatched = ordered.filter((c) => !matched.has(c.id));
  return { matched, unmatched, looseMatches };
}

// Returns a unique node id derived from `canonId`. If the canonical id is
// already in use on the canvas (e.g. the player named one of their nodes
// `cpu-1`), append a counter until free.
function freshId(canonId, userNodes) {
  const taken = new Set(userNodes.map((n) => n.id));
  if (!taken.has(canonId)) return canonId;
  for (let i = 2; ; i++) {
    const tryId = `${canonId}-${i}`;
    if (!taken.has(tryId)) return tryId;
  }
}

// Adjust a position so it doesn't collide with existing siblings (same
// parent, or top-level if parentId is undefined). Bumps x by 30 per
// collision until a free spot is found. Keeps it cheap — full sibling-
// scoot still runs on placement via the existing Canvas pipeline.
function nudgeAwayFromSiblings(pos, parentId, userNodes) {
  const candidates = userNodes.filter((n) =>
    parentId ? n.parentNode === parentId : !n.parentNode
  );
  const collidesWith = (p) =>
    candidates.some((c) => {
      const cx = c.position?.x || 0;
      const cy = c.position?.y || 0;
      return Math.abs(cx - p.x) < 30 && Math.abs(cy - p.y) < 30;
    });
  const out = { ...pos };
  let bumps = 0;
  while (collidesWith(out) && bumps < 20) {
    out.x += 30;
    bumps += 1;
  }
  return out;
}

// First canonical node with no user match. Builds a place/move action.
function findNextMissingNode(puzzle, userNodes, canonNodes) {
  const { matched, looseMatches } = matchCanonToUser(userNodes, canonNodes);
  const ordered = sortParentsFirst(canonNodes);
  for (const canon of ordered) {
    if (matched.has(canon.id)) continue;

    // If the user has a same-type-but-wrong-parent loose match, suggest
    // moving instead of placing a duplicate.
    if (looseMatches.has(canon.id)) {
      const userNodeId = looseMatches.get(canon.id);
      const userNode = userNodes.find((n) => n.id === userNodeId);
      const canonParentType = parentTypeOf(canon, canonNodes);
      return {
        action: 'move',
        nodeId: userNodeId,
        targetParentType: canonParentType,
        rationale:
          findHintRationale(puzzle, canon) ||
          `Move your ${labelOf(userNode)} into the ${canonParentType ? componentTypes[canonParentType]?.label : 'right place'}.`,
        targetLabel: labelOf(userNode),
        targetParentLabel: canonParentType ? componentTypes[canonParentType]?.label : null,
      };
    }

    // Standard place: take the canonical node as a template; rebind id +
    // parentNode to user's actual world.
    let parentId;
    if (canon.parentNode) {
      const userParentId = matched.get(canon.parentNode);
      if (!userParentId) {
        // Canonical parent itself isn't placed yet. Skip — parents-first
        // ordering means we'll reach the parent canon node first, in
        // which case the loop already returned.
        continue;
      }
      parentId = userParentId;
    }
    const fresh = freshId(canon.id, userNodes);
    const position = parentId
      ? canon.position
      : nudgeAwayFromSiblings(canon.position, undefined, userNodes);
    const nodeToPlace = {
      ...canon,
      id: fresh,
      position,
      parentNode: parentId || undefined,
    };
    return {
      action: 'place',
      node: nodeToPlace,
      rationale: findHintRationale(puzzle, canon),
    };
  }
  return null;
}

// After all nodes match, look for the first canonical edge whose endpoints
// resolve to user-side ids but have no matching user edge.
function findNextMissingEdge(puzzle, userNodes, userEdges, canonNodes, canonEdges) {
  const { matched } = matchCanonToUser(userNodes, canonNodes);
  const userEdgeKeys = new Set(
    userEdges.map((e) => `${e.source}→${e.target}:${e.data?.kind || 'both'}`)
  );
  for (const canonEdge of canonEdges) {
    const userSource = matched.get(canonEdge.source);
    const userTarget = matched.get(canonEdge.target);
    if (!userSource || !userTarget) continue;
    const kind = canonEdge.data?.kind || 'both';
    const key = `${userSource}→${userTarget}:${kind}`;
    if (userEdgeKeys.has(key)) continue;
    const sourceNode = userNodes.find((n) => n.id === userSource);
    const targetNode = userNodes.find((n) => n.id === userTarget);
    return {
      action: 'wire',
      edge: {
        id: `${userSource}→${userTarget}${canonEdge.data?.kind ? `:${canonEdge.data.kind}` : ''}`,
        source: userSource,
        target: userTarget,
        ...(canonEdge.data ? { data: canonEdge.data } : {}),
      },
      sourceLabel: labelOf(sourceNode),
      targetLabel: labelOf(targetNode),
      rationale: findHintEdgeRationale(puzzle, sourceNode, targetNode),
    };
  }
  return null;
}

// Layer 3 — if there's no canonical action left but the puzzle isn't
// passing, return the first failing requirement's lesson text as guidance.
function findFailingRequirementHint(puzzle, simResult) {
  if (!simResult || !simResult.ok) return null;
  const evaluation = evaluatePuzzle(puzzle, simResult);
  if (evaluation.passed) {
    return {
      action: 'message',
      title: 'All checks pass — click ▶ Run to verify.',
      rationale: null,
    };
  }
  const failing = evaluation.results.find((r) => !r.passed);
  if (!failing) return null;
  return {
    action: 'message',
    title: failing.label,
    rationale: failing.lesson || null,
  };
}

// Public entry point. Caller (App.handleHint) translates the returned
// action into the gold-pulse + canvas banner UI it already owns.
export function findNextHint({ puzzle, nodes, edges, simResult }) {
  // Layer 2 — per-puzzle override.
  if (typeof puzzle.hint === 'function') {
    try {
      const override = puzzle.hint({ nodes, edges, simResult });
      if (override) return override;
    } catch (e) {
      // A buggy per-puzzle hint() shouldn't break the Hint button. Drop
      // through to the default matcher. Surfaced to console for the author.
      // eslint-disable-next-line no-console
      console.warn(`puzzle.hint() threw — falling back to default matcher.`, e);
    }
  }

  // Layer 1 — type-aware match against canonical.
  if (typeof puzzle.solution === 'function') {
    const canon = puzzle.solution();
    const placeOrMove = findNextMissingNode(puzzle, nodes, canon.nodes);
    if (placeOrMove) return placeOrMove;
    const wire = findNextMissingEdge(puzzle, nodes, edges, canon.nodes, canon.edges);
    if (wire) return wire;
  }

  // Layer 3 — requirement fallback.
  const reqHint = findFailingRequirementHint(puzzle, simResult);
  if (reqHint) return reqHint;

  // Nothing to say.
  if (typeof puzzle.solution !== 'function') {
    return {
      action: 'message',
      title: 'No canonical solution available for this lesson.',
      rationale: null,
    };
  }
  return {
    action: 'message',
    title: 'Everything looks placed — click ▶ Run to test.',
    rationale: null,
  };
}
