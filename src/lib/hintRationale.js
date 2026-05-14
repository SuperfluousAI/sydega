// Find a "why is this piece needed" rationale for a hint-placed node.
//
// The 💡 Hint button tells the player WHAT was placed ("Placed: Disk"); this
// helper supplies the WHY. The cheap path leans on data the puzzle already
// authors:
//   1. requirement predicates that match the placed type (e.g. `presence:
//      router`) → use that requirement's `lesson:` string
//   2. requirement label/lesson that mentions the component's label string
//      (e.g. "Add a Cache to..." mentions "Cache") → use that lesson
//   3. componentInfo[type].description as a generic fallback
//
// Nothing here requires new authoring — every shipped puzzle's existing
// `lesson:` strings are well-tuned to the WHY, since they're the same text
// shown when a requirement fails.

import { componentTypes, metaFor } from './componentTypes.js';
import { componentInfo, infoFor } from './componentInfo.js';

export function findHintRationale(puzzle, node) {
  if (!node) return null;
  const type = node.data?.type;
  if (!type) return null;
  const meta = metaFor(node);
  const role = node.data?.config?.role;

  // Candidate labels to search for in requirement text: the resolved meta
  // label if present, plus every role's label for role-aware types where the
  // node hasn't pinned a role. This makes the lookup robust whether the
  // placed node carries a config.role or not.
  const labels = [];
  if (meta?.label) labels.push(meta.label);
  const baseType = componentTypes[type];
  if (baseType?.roles) {
    for (const r of Object.values(baseType.roles)) {
      if (r?.label && !labels.includes(r.label)) labels.push(r.label);
    }
  }

  // ── 1. Presence-predicate match ─────────────────────────────────────────
  // Most lessons declare `{ kind: 'presence', type, min, role? }`. If the
  // placed node's type (and role, when set on both) matches, the
  // requirement's `lesson:` is the most precise rationale we have.
  if (Array.isArray(puzzle?.requirements)) {
    for (const r of puzzle.requirements) {
      const p = r.predicate;
      if (!p || p.kind !== 'presence') continue;
      if (p.type !== type) continue;
      if (p.role && role && p.role !== role) continue;
      if (r.lesson) return r.lesson;
    }
  }

  // ── 2. Label-mention match ──────────────────────────────────────────────
  // Older `test:`-shape requirements don't have a predicate but their
  // `label:` or `lesson:` often mentions the component by name. Match
  // case-insensitively as a whole word so "Cache" matches "Cache" but not
  // "CacheControl".
  if (labels.length && Array.isArray(puzzle?.requirements)) {
    const labelRx = new RegExp(`\\b(?:${labels.map(escapeRegex).join('|')})\\b`, 'i');
    for (const r of puzzle.requirements) {
      const hay = `${r.label || ''} ${r.lesson || ''}`;
      if (r.lesson && labelRx.test(hay)) return r.lesson;
    }
  }

  // ── 3. Generic componentInfo fallback ───────────────────────────────────
  // Try the role-specific entry first (`cache:internal`), then the resolved
  // info, then any role variant for role-aware types where the node has no
  // role config.
  const info = infoFor(node);
  if (info?.description) return info.description;
  if (baseType?.roles) {
    for (const r of Object.keys(baseType.roles)) {
      const key = `${type}:${r}`;
      if (componentInfo[key]?.description) return componentInfo[key].description;
    }
  }

  return null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Edge rationale — when a hint wires an edge, surface the target node's
// "why" since the connection's purpose is usually framed as "reach Y".
// Falls back to source rationale if target has none.
export function findHintEdgeRationale(puzzle, sourceNode, targetNode) {
  return (
    findHintRationale(puzzle, targetNode) ||
    findHintRationale(puzzle, sourceNode) ||
    null
  );
}
