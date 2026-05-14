import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  useStore,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';

import SystemNode from './SystemNode.jsx';
import FloatingEdge from './FloatingEdge.jsx';
import ComponentInfo from './ComponentInfo.jsx';
import { componentTypes, defaultsFor } from '../lib/componentTypes.js';
import {
  findContainerAt,
  prepopulateComputerHardware,
  scootSiblings,
  snapChildPosition,
  sortParentsFirst,
  worldPosition,
} from '../lib/graph.js';
import { reflowContainers } from '../lib/reflow.js';
import { clampChildLocalPosition, computeLeavingSides, isStillInsideParent } from '../lib/containerBehavior.js';

const nodeTypes = { system: SystemNode };

// Visual zone overlays (e.g. Lesson 3's "Your LAN" / "The Internet"). Rendered
// as positioned divs behind the React Flow nodes, transformed by the viewport
// so they pan/zoom with the canvas. They live OUTSIDE React Flow's node system
// — never participate in interaction, never enter state, never get measured by
// React Flow. Pure decoration.
function CanvasRegions({ regions }) {
  // useStore subscribes to React Flow's internal transform; rerenders whenever
  // the canvas pans or zooms so the regions track the nodes.
  const tx = useStore((s) => s.transform[0]);
  const ty = useStore((s) => s.transform[1]);
  const zoom = useStore((s) => s.transform[2]);
  if (!Array.isArray(regions) || regions.length === 0) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 0,
      }}
    >
      {regions.map((r) => (
        <div
          key={r.id}
          style={{
            position: 'absolute',
            left: r.x * zoom + tx,
            top: r.y * zoom + ty,
            width: r.w * zoom,
            height: r.h * zoom,
            backgroundColor: `${r.color}14`, // ~8% alpha
            border: `1.5px dashed ${r.color}`,
            borderRadius: 16 * zoom,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 10 * zoom,
              left: 16 * zoom,
              color: r.color,
              fontSize: 11 * zoom,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              opacity: 0.85,
              whiteSpace: 'nowrap',
            }}
          >
            {r.label}
          </div>
        </div>
      ))}
    </div>
  );
}
const edgeTypes = { floating: FloatingEdge };
// FloatingEdge renders its own SVG markers per-edge (orient="auto-start-reverse")
// so source and target arrows are visual mirrors. Canvas only passes data and
// edge type through; arrow visuals are owned by FloatingEdge.
const defaultEdgeOptions = { type: 'floating' };

// At drag-start we compute 4 anchor points OUTSIDE the dragged node's screen
// rect — one per slot. The bin renders at trashAnchors[trashSlot]; it stays
// stationary for the rest of the drag and only relocates if the player both
// (a) hovers the bin for TRASH_RELOCATE_MS AND (b) keeps the cursor still
// during that window — the read is "they're parked over the trash,
// hesitating; nudge it so they don't accidentally delete." Cursor movement
// resets the timer.
//
// Anchoring to the node rect (not the cursor) guarantees the bin never
// overlaps the dragged component, regardless of where on the node the player
// grabbed — important because a Computer is 340×220, so a cursor-relative
// offset of 100px can still land the bin inside the component.
const TRASH_PADDING = 30;
const TRASH_BIN_W = 110;
const TRASH_BIN_H = 36;
const TRASH_RELOCATE_MS = 2000;
// Number of pre-computed bin positions per drag. Must match the array length
// returned by `anchorsFromRect`. The relocate timer cycles modulo this value.
// (Was previously referenced as `TRASH_SLOTS.length` but TRASH_SLOTS was never
// defined — caused a ReferenceError that crashed the whole React tree when
// the player hovered the bin for 2 seconds without moving.)
const TRASH_SLOT_COUNT = 4;

function anchorsFromRect(rect, viewportRect) {
  // The bin is positioned by its top-left corner (CSS left/top). For slots
  // where the bin sits to the LEFT or ABOVE the node, we subtract bin
  // size so the bin's RIGHT or BOTTOM edge lines up with the padding gap.
  const raw = [
    { x: rect.right + TRASH_PADDING,                y: rect.bottom + TRASH_PADDING },
    { x: rect.left - TRASH_PADDING - TRASH_BIN_W,   y: rect.top - TRASH_PADDING - TRASH_BIN_H },
    { x: rect.left - TRASH_PADDING - TRASH_BIN_W,   y: rect.bottom + TRASH_PADDING },
    { x: rect.right + TRASH_PADDING,                y: rect.top - TRASH_PADDING - TRASH_BIN_H },
  ];
  if (!viewportRect) return raw;
  // Score each slot by how far it would extend outside the canvas. Lower
  // is better; zero means fully inside. Stable sort keeps slot 0 first
  // when multiple ties exist.
  const SAFE_MARGIN = 8;
  const minX = viewportRect.left + SAFE_MARGIN;
  const minY = viewportRect.top + SAFE_MARGIN;
  const maxX = viewportRect.right - TRASH_BIN_W - SAFE_MARGIN;
  const maxY = viewportRect.bottom - TRASH_BIN_H - SAFE_MARGIN;
  const overflowOf = (a) =>
    Math.max(0, minX - a.x) +
    Math.max(0, minY - a.y) +
    Math.max(0, a.x - maxX) +
    Math.max(0, a.y - maxY);
  const sorted = raw
    .map((a, i) => ({ a, i, ov: overflowOf(a) }))
    .sort((p, q) => p.ov - q.ov)
    .map(({ a }) => a);
  // Clamp every slot to be safely inside the viewport — even the rotated
  // ones we might fall back to on long-hover should never clip.
  return sorted.map((a) => ({
    x: Math.max(minX, Math.min(maxX, a.x)),
    y: Math.max(minY, Math.min(maxY, a.y)),
  }));
}

// Reject a connection that's the wrong way around. A valid edge goes from a
// node that hasOutput to a node that hasInput. In loose mode the user can
// still try to wire e.g. Database → Client; this is where we say no.
function isValidConnectionForNodes(nodes) {
  return (params) => {
    const src = nodes.find((n) => n.id === params.source);
    const tgt = nodes.find((n) => n.id === params.target);
    if (!src || !tgt) return false;
    const sMeta = componentTypes[src.data?.type];
    const tMeta = componentTypes[tgt.data?.type];
    if (!sMeta || !tMeta) return false;
    return !!sMeta.hasOutput && !!tMeta.hasInput;
  };
}

function CanvasInner({
  nodes,
  setNodes,
  edges,
  setEdges,
  onSelectNode,
  onSetShaking,
  onRipple,
  onScoot,
  onDeleteNode,
  onSetDropTarget,
  autoStack = true,
  selectedNode,
  regions,
  onSnapshot,
}) {
  // Defensive: handlers below call onSnapshot before mutating state. Wrap in
  // a no-op fallback so this component works in isolation (e.g. in tests).
  const snapshot = onSnapshot || (() => {});
  const wrapperRef = useRef(null);
  const reactFlow = useReactFlow();

  // Fit the initial view to nodes + regions when the puzzle changes. React
  // Flow's `fitView` only sees real nodes; regions are overlay divs and would
  // start off-screen otherwise. We replace fitView with an explicit fitBounds
  // computed from the puzzle's union of node positions and region bounds.
  useEffect(() => {
    const points = [];
    for (const n of nodes) {
      const x = n.position?.x ?? 0;
      const y = n.position?.y ?? 0;
      const w = n.style?.width || n.width || 160;
      const h = n.style?.height || n.height || 90;
      points.push({ minX: x, minY: y, maxX: x + w, maxY: y + h });
    }
    if (Array.isArray(regions)) {
      for (const r of regions) {
        points.push({ minX: r.x, minY: r.y, maxX: r.x + r.w, maxY: r.y + r.h });
      }
    }
    if (points.length === 0) return;
    const minX = Math.min(...points.map((p) => p.minX));
    const minY = Math.min(...points.map((p) => p.minY));
    const maxX = Math.max(...points.map((p) => p.maxX));
    const maxY = Math.max(...points.map((p) => p.maxY));
    // Reserve canvas-space gutter at the top of the bounding box so the
    // ComponentInfo overlay (absolute-positioned at top of canvas-wrapper,
    // ~130-180px screen-space depending on content) doesn't sit over the
    // top row of nodes. By extending minY upward, fitBounds zooms out
    // enough that the visible top of the content sits BELOW the overlay.
    const TOP_GUTTER = 260;
    // setTimeout pushes the call past React Flow's own fitView so we win the
    // race; otherwise initial render briefly shows the smaller fit-to-nodes view.
    const id = setTimeout(() => {
      reactFlow.fitBounds(
        {
          x: minX,
          y: minY - TOP_GUTTER,
          width: maxX - minX,
          height: maxY - minY + TOP_GUTTER,
        },
        { padding: 0.08, duration: 0 }
      );
    }, 0);
    return () => clearTimeout(id);
    // We intentionally depend on `regions` (the puzzle's regions array) and
    // node count, not on node positions — we want this to run on puzzle
    // switch, not every time the player drags a node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions, nodes.length, reactFlow]);
  const trashRef = useRef(null);
  const trashTimerRef = useRef(null);
  const [trashHover, setTrashHover] = useState(false);
  // Trash drag-life state.
  // `draggingNodeId` is set while a node is being dragged (so the bin renders).
  // `trashAnchors` is the precomputed 4-slot screen positions for THIS drag,
  // derived from the dragged node's bounding rect at drag-start. The bin
  // renders at trashAnchors[trashSlot]; cursor movement does NOT update it.
  // `lastMoveAt` is bumped on every onNodeDrag; the relocate effect depends
  // on it so any cursor movement resets the 2s timer.
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [trashAnchors, setTrashAnchors] = useState(null);
  const [trashSlot, setTrashSlot] = useState(0);
  const [lastMoveAt, setLastMoveAt] = useState(0);
  const { screenToFlowPosition } = useReactFlow();
  const isValidConnection = useMemo(() => isValidConnectionForNodes(nodes), [nodes]);

  // Returns true if the given mouse-event screen coordinates lie within the
  // trash button's bounding rectangle. Used by onNodeDrag (to highlight) and
  // onNodeDragStop (to actually delete).
  const isOverTrash = useCallback((event) => {
    const el = trashRef.current;
    if (!el || !event) return false;
    const r = el.getBoundingClientRect();
    return (
      event.clientX >= r.left &&
      event.clientX <= r.right &&
      event.clientY >= r.top &&
      event.clientY <= r.bottom
    );
  }, []);

  const handleNodesChange = useCallback(
    (changes) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [setNodes]
  );

  const handleEdgesChange = useCallback(
    (changes) => setEdges((es) => applyEdgeChanges(changes, es)),
    [setEdges]
  );

  const handleConnect = useCallback(
    (params) => {
      snapshot();
      setEdges((es) =>
        addEdge(
          {
            ...params,
            type: 'floating',
            // Animation is driven by CSS class from arrows; the React-Flow
            // `animated` flag is no longer needed and would conflict.
            animated: false,
            data: {
              kind: 'both',
              // Default to a one-way A → B arrow (target-side dot only).
              // Default = bidirectional. Both endpoints have arrowheads and
              // the animation flows both ways. The player clicks an endpoint
              // dot to commit a specific direction.
              arrows: { source: true, target: true },
            },
          },
          es
        )
      );
    },
    [setEdges, snapshot]
  );

  const handleEdgeClick = useCallback(
    (_event, edge) => {
      snapshot();
      setEdges((es) =>
        es.map((e) => {
          if (e.id !== edge.id) return e;
          const kind = e.data?.kind || 'both';
          const next = kind === 'both' ? 'read' : kind === 'read' ? 'write' : 'both';
          return { ...e, data: { ...(e.data || {}), kind: next } };
        })
      );
    },
    [setEdges, snapshot]
  );

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    // Palette-to-canvas drag is HTML5, not React Flow — so the drop-target
    // pulse from handleNodeDrag never fires. Mirror it here: project the
    // cursor into flow space, find the container under it, and highlight.
    if (!onSetDropTarget) return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const container = findContainerAt(nodes, position);
    onSetDropTarget(container?.id || null);
  }, [nodes, onSetDropTarget, screenToFlowPosition]);

  const handleDragLeave = useCallback((event) => {
    // dragleave fires whenever the cursor crosses a child boundary too, so
    // only clear when leaving the canvas wrapper itself — relatedTarget is
    // outside the wrapper (or null when leaving the browser window).
    if (!onSetDropTarget) return;
    const wrap = wrapperRef.current;
    if (!wrap) return;
    if (!event.relatedTarget || !wrap.contains(event.relatedTarget)) {
      onSetDropTarget(null);
    }
  }, [onSetDropTarget]);

  const handleDrop = useCallback(
    (event) => {
      event.preventDefault();
      if (onSetDropTarget) onSetDropTarget(null);
      const typeKey = event.dataTransfer.getData('application/sdgame-type');
      if (!typeKey) return;
      snapshot();
      const role = event.dataTransfer.getData('application/sdgame-role') || undefined;
      const prepopulate = event.dataTransfer.getData('application/sdgame-prepopulate') === '1';
      const meta = componentTypes[typeKey];
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      // Include role in the id prefix so multiple services on the same canvas
      // get visually-distinguishable ids in logs/tests (service-appServer-...).
      const idPrefix = role ? `${typeKey}-${role}` : typeKey;
      const id = `${idPrefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // A container CAN be dropped into another container (e.g. Computer into Router).
      // We just need to skip self when looking up the target (the node doesn't exist yet
      // for new drops anyway, but findContainerAt also serves the reparent path).
      //
      // Use the dropped component's CENTER (cursor + nodeStyle/2) instead of the
      // raw cursor when deciding which container it lands in. With cursor-only,
      // dropping near the edge of a container could land the cursor just outside
      // the container's bounds — even though visually the component would land
      // inside. That mismatch pushed the would-be parent away via the top-level
      // sibling-scoot, making it appear to "sink lower" on each near-miss drop.
      // handleNodeDragStop already uses center; this brings handleDrop in line.
      const dropW = meta?.nodeStyle?.width || 170;
      const dropH = meta?.nodeStyle?.height || 90;
      const center = { x: position.x + dropW / 2, y: position.y + dropH / 2 };
      const container = findContainerAt(nodes, center);

      const containerWorld = container ? worldPosition(container, nodes) : null;
      // Compute local position inside the container, then clamp to keep the
      // child below the container's header. If auto-stack is on, snap after
      // clamping so the snapped position still respects HEADER_ZONE. Top-
      // level drops (no container) keep their exact coords.
      let finalPos;
      if (container) {
        const localPos = { x: position.x - containerWorld.x, y: position.y - containerWorld.y };
        const clamped = clampChildLocalPosition(localPos);
        finalPos = autoStack ? snapChildPosition(clamped) : clamped;
      } else {
        finalPos = position;
      }
      const newNode = {
        id,
        type: 'system',
        position: finalPos,
        ...(meta?.nodeStyle ? { style: meta.nodeStyle } : {}),
        ...(container ? { parentNode: container.id } : {}),
        data: { type: typeKey, config: defaultsFor(typeKey, role) },
      };
      let withNewNode = [...nodes, newNode];
      // If the palette had "prepopulate" checked when this Computer was
      // dragged, immediately add CPU + RAM + Disk children. Pure function;
      // sort by depth so React Flow renders parents before children.
      if (prepopulate && typeKey === 'computer') {
        withNewNode = sortParentsFirst(prepopulateComputerHardware(withNewNode, id));
      }
      const { nodes: scootedNodes, scootedIds } = scootSiblings(withNewNode, id);
      const finalNodes = reflowContainers(scootedNodes);
      setNodes(finalNodes);
      if (scootedIds.length > 0 && onScoot) onScoot(scootedIds);

      // Ripple at the (final, reflowed) position of the new child.
      if (container && onRipple) {
        const w = meta?.nodeStyle?.width || 170;
        const h = meta?.nodeStyle?.height || 90;
        const finalChild = finalNodes.find((n) => n.id === id);
        const pos = finalChild?.position || newNode.position;
        onRipple(container.id, { x: pos.x + w / 2, y: pos.y + h / 2 });
      }
    },
    [screenToFlowPosition, setNodes, nodes, onRipple, onScoot, snapshot, onSetDropTarget, autoStack]
  );

  const handleSelectionChange = useCallback(
    ({ nodes: selected }) => {
      onSelectNode(selected.length ? selected[0].id : null);
    },
    [onSelectNode]
  );

  const handleNodeDragStart = useCallback((event, node) => {
    // Snapshot pre-drag state for undo. Position updates during the drag
    // flow through React Flow's `applyNodeChanges` (frequent — not worth
    // snapshotting each); the drag-start captures the "before" state.
    snapshot();
    // Compute the bin's anchor positions from the dragged node's screen rect.
    // Anchoring to the rect (not the cursor) means the bin never overlaps the
    // node — regardless of where on the node the player grabbed.
    setDraggingNodeId(node.id);
    const nodeEl = wrapperRef.current?.querySelector(`.react-flow__node[data-id="${node.id}"]`);
    const rect = nodeEl?.getBoundingClientRect();
    if (rect) {
      const viewportRect = wrapperRef.current?.getBoundingClientRect();
      setTrashAnchors(anchorsFromRect(rect, viewportRect));
    } else {
      // Fall back to a cursor-relative offset if the DOM query fails — defensive,
      // shouldn't happen, but better than nothing rendering.
      setTrashAnchors([
        { x: event.clientX + 100, y: event.clientY + 100 },
        { x: event.clientX - 160, y: event.clientY - 120 },
        { x: event.clientX - 160, y: event.clientY + 100 },
        { x: event.clientX + 100, y: event.clientY - 120 },
      ]);
    }
    setTrashSlot(0);
    setTrashHover(false);
    setLastMoveAt(Date.now());
  }, [snapshot]);

  const handleNodeDrag = useCallback(
    (event, node) => {
      // Mark the cursor as having moved — restarts the 2s relocate timer.
      // Bin position itself is anchored, so we don't update it here.
      setLastMoveAt(Date.now());
      setTrashHover(isOverTrash(event));

      // Resolve, ONCE per drag tick, what container (if any) would become
      // the child's new parent if the user released right now. Used by both
      // the drop-target highlight (NEW container) and the leaving-shake
      // (current parent) so the two signals stay consistent — the parent
      // only shakes when releasing would actually separate the child.
      //
      // For a node that ALREADY has a parent, treat it as still-inside as
      // long as its center hasn't crossed the parent edge by LEAVE_MARGIN
      // pixels — keeps casual edge-grazing from inadvertently removing the
      // child. Only when the child is clearly past the margin do we
      // re-resolve the candidate parent via findContainerAt.
      const meta = componentTypes[node.data.type];
      const w = node.width || node.style?.width || meta?.nodeStyle?.width || 170;
      const h = node.height || node.style?.height || meta?.nodeStyle?.height || 90;
      const nodeWorld = worldPosition(node, nodes);
      const center = { x: nodeWorld.x + w / 2, y: nodeWorld.y + h / 2 };
      const currentParentId = node.parentNode || null;
      const currentParent = currentParentId
        ? nodes.find((n) => n.id === currentParentId)
        : null;
      const stillInsideCurrent = currentParent
        ? isStillInsideParent(node, currentParent)
        : false;
      let candidateParentId;
      if (stillInsideCurrent) {
        candidateParentId = currentParentId;
      } else {
        const target = findContainerAt(nodes, center, node.id);
        candidateParentId = target?.id || null;
      }
      const wouldSeparate = candidateParentId !== currentParentId;
      const overTrash = isOverTrash(event);

      // Drop-target highlight: pulse the NEW container only if release would
      // re-parent into it. Trash hover suppresses (release-over-trash
      // deletes, doesn't re-parent).
      if (onSetDropTarget) {
        onSetDropTarget(
          !overTrash && wouldSeparate && candidateParentId ? candidateParentId : null
        );
      }

      // Leaving-shake on the CURRENT parent. R5 used to fire as soon as the
      // child's center crossed the parent's underlying edge — but the player
      // can hang their cursor past the edge and release without actually
      // separating (findContainerAt still resolves back to the same parent
      // due to inclusive bounds). Gate the shake on `wouldSeparate` so the
      // tug-of-war animation only plays when releasing actually breaks the
      // parent/child bond.
      if (!onSetShaking) return;
      if (!node.parentNode || !wouldSeparate) {
        onSetShaking(null);
        return;
      }
      const parent = nodes.find((n) => n.id === node.parentNode);
      if (!parent) {
        onSetShaking(null);
        return;
      }
      const sides = computeLeavingSides(node, parent);
      const leaving = sides.top || sides.right || sides.bottom || sides.left;
      onSetShaking(leaving ? { id: parent.id, sides } : null);
    },
    [nodes, onSetShaking, isOverTrash, onSetDropTarget]
  );

  const handleNodeDragStop = useCallback(
    (event, node) => {
      if (onSetShaking) onSetShaking(null);
      if (onSetDropTarget) onSetDropTarget(null);

      // If the player released the node over the trash zone, delete it.
      // This is the drag-to-trash deletion UX. Short-circuit before the
      // reparent / scoot / reflow work since none of it matters once gone.
      const releaseOverTrash = isOverTrash(event);
      setTrashHover(false);
      setDraggingNodeId(null);
      setTrashAnchors(null);
      if (releaseOverTrash && onDeleteNode) {
        onDeleteNode(node.id);
        return;
      }

      const meta = componentTypes[node.data.type];
      const w = node.width || node.style?.width || meta?.nodeStyle?.width || 170;
      const h = node.height || node.style?.height || meta?.nodeStyle?.height || 90;
      const nodeWorld = worldPosition(node, nodes);
      const center = { x: nodeWorld.x + w / 2, y: nodeWorld.y + h / 2 };
      const currentParentId = node.parentNode || null;
      const currentParent = currentParentId
        ? nodes.find((n) => n.id === currentParentId)
        : null;
      // Match the drag-time policy: child stays in its current parent
      // unless its center has clearly crossed the leave margin. This keeps
      // the dragStop decision consistent with what the leaving-shake
      // showed during the gesture.
      const stillInsideCurrent = currentParent
        ? isStillInsideParent(node, currentParent)
        : false;
      let target = null;
      let newParentId = currentParentId;
      if (!stillInsideCurrent) {
        target = findContainerAt(nodes, center, node.id);
        newParentId = target?.id || null;
      } else {
        // Resolve the actual node ref for later local-coord math; the
        // "current parent" object we already have.
        target = currentParent;
      }
      const parentChanged = newParentId !== currentParentId;

      let next = nodes;
      let movedPos = node.position;

      if (parentChanged) {
        let newPos;
        if (target) {
          const targetWorld = worldPosition(target, nodes);
          newPos = { x: nodeWorld.x - targetWorld.x, y: nodeWorld.y - targetWorld.y };
          newPos = clampChildLocalPosition(newPos);
          if (autoStack) newPos = snapChildPosition(newPos);
        } else {
          newPos = nodeWorld;
        }
        movedPos = newPos;
        next = next.map((n) =>
          n.id === node.id
            ? { ...n, parentNode: newParentId || undefined, extent: undefined, position: newPos }
            : n
        );
        next = sortParentsFirst(next);
      } else if (newParentId) {
        // Same parent — always clamp header overlap; snap to grid only
        // when autoStack is on.
        const clamped = clampChildLocalPosition(node.position);
        const after = autoStack ? snapChildPosition(clamped) : clamped;
        if (after.x !== node.position.x || after.y !== node.position.y) {
          movedPos = after;
          next = next.map((n) =>
            n.id === node.id ? { ...n, position: after } : n
          );
        }
      }

      // Scoot any siblings the node now overlaps with (also handles
      // in-parent moves where parentChanged is false but the position changed).
      const { nodes: scootedNodes, scootedIds } = scootSiblings(next, node.id);
      // Reflow synchronously here so the visual snap (overshoot CSS vars
      // clearing) and the parent's actual reflow-shift land in the same
      // browser paint — otherwise there's a one-frame jump on release.
      const finalNodes = reflowContainers(scootedNodes);
      setNodes(finalNodes);
      if (scootedIds.length > 0 && onScoot) onScoot(scootedIds);

      // Use the reflowed position for the ripple so it appears at the
      // child's center within the final parent coordinate space.
      const finalChild = finalNodes.find((n) => n.id === node.id);
      const ripplePos = finalChild?.position || movedPos;
      if (parentChanged && newParentId && onRipple) {
        onRipple(newParentId, { x: ripplePos.x + w / 2, y: ripplePos.y + h / 2 });
      }
    },
    [nodes, setNodes, onSetShaking, onRipple, onScoot, isOverTrash, onDeleteNode, onSetDropTarget, autoStack]
  );

  // Relocate effect. The bin moves only when BOTH conditions hold for
  // TRASH_RELOCATE_MS straight: (a) the cursor overlaps the bin, AND
  // (b) the cursor isn't moving. We model "cursor stationary" by depending
  // on `lastMoveAt` — every cursor move bumps it, which re-runs the effect
  // and resets the timer. So 2s of no-movement + ongoing overlap is what
  // triggers the slide; jiggling the mouse keeps the bin in place.
  useEffect(() => {
    if (!trashHover) {
      if (trashTimerRef.current) {
        clearTimeout(trashTimerRef.current);
        trashTimerRef.current = null;
      }
      return;
    }
    trashTimerRef.current = setTimeout(() => {
      setTrashSlot((s) => (s + 1) % TRASH_SLOT_COUNT);
      trashTimerRef.current = null;
    }, TRASH_RELOCATE_MS);
    return () => {
      if (trashTimerRef.current) {
        clearTimeout(trashTimerRef.current);
        trashTimerRef.current = null;
      }
    };
  }, [trashHover, lastMoveAt]);

  const anchor = trashAnchors?.[trashSlot];

  return (
    <div
      ref={wrapperRef}
      className="canvas-wrapper"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Info pane lives INSIDE the canvas as a top overlay so the
          pedagogical context is right where the player is looking. */}
      <div className="canvas-info-overlay">
        <ComponentInfo node={selectedNode || null} />
      </div>
      {draggingNodeId && anchor && (
        <div
          ref={trashRef}
          className={`canvas-trash floating ${trashHover ? 'hot' : ''}`}
          style={{ left: anchor.x, top: anchor.y }}
          aria-label="Drop a node here to delete it"
          title="Drag a node here to delete"
        >
          <span className="canvas-trash-icon">🗑</span>
          <span className="canvas-trash-label">trash</span>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionMode="loose"
        isValidConnection={isValidConnection}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onSelectionChange={handleSelectionChange}
        onNodeDragStart={handleNodeDragStart}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onEdgeClick={handleEdgeClick}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} color="#2a2a35" />
        <CanvasRegions regions={regions} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor={(n) => '#444'} maskColor="rgba(0,0,0,0.6)" />
      </ReactFlow>
    </div>
  );
}

export default function Canvas(props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
