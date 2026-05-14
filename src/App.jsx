import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Canvas from './components/Canvas.jsx';
import Palette from './components/Palette.jsx';
import PropertyPanel from './components/PropertyPanel.jsx';
import PuzzleBar from './components/PuzzleBar.jsx';
import ResizeHandle from './components/ResizeHandle.jsx';

import { simulate } from './lib/simulator.js';
import { reflowContainers } from './lib/reflow.js';
import { prepopulateComputerHardware, snapAllParentedChildren, sortParentsFirst, worldPosition } from './lib/graph.js';
import { componentTypes, metaFor } from './lib/componentTypes.js';
import { findHintRationale, findHintEdgeRationale } from './lib/hintRationale.js';
import { computeOvershoot } from './lib/containerBehavior.js';
import { puzzles, puzzleOrder, defaultPuzzleId, evaluatePuzzle } from './lib/puzzles.js';

import './App.css';

function edgeKindLabel(kind) {
  return kind === 'read' ? 'R' : kind === 'write' ? 'W' : 'R+W';
}
function edgeKindColor(kind) {
  return kind === 'read' ? '#34d399' : kind === 'write' ? '#f59e0b' : '#6b7280';
}

// Frame extension is governed by computeOvershoot in containerBehavior.js
// (R1 + R2 from CONTAINER_BEHAVIOR.md). This module just imports and uses it.

export default function App() {
  const [activePuzzleId, setActivePuzzleId] = useState(() => {
    try {
      const saved = localStorage.getItem('sdg-active-puzzle');
      if (saved && puzzles[saved]) return saved;
    } catch { /* ignore */ }
    return defaultPuzzleId;
  });
  const puzzle = puzzles[activePuzzleId];
  // The currently-visible lesson track. Persisted so a mentee who closed
  // the tab on the JS track lands back there next time.
  const [activeTrack, setActiveTrack] = useState(() => {
    try {
      const saved = localStorage.getItem('sdg-active-track');
      if (saved === 'systems' || saved === 'javascript') return saved;
    } catch { /* ignore */ }
    return puzzle.track || 'systems';
  });
  useEffect(() => {
    try { localStorage.setItem('sdg-active-track', activeTrack); } catch { /* ignore */ }
  }, [activeTrack]);
  useEffect(() => {
    try { localStorage.setItem('sdg-active-puzzle', activePuzzleId); } catch { /* ignore */ }
  }, [activePuzzleId]);

  const [nodes, setNodes] = useState(() => puzzle.initialNodes());
  // Most puzzles start with no edges (the student wires them). Follow-up
  // lessons (L19.1 flash-sale, future L19.2 search, etc.) pre-populate the
  // parent puzzle's canonical edges so the student starts from a working
  // base and focuses on the new pattern instead of rebuilding L19.
  const [edges, setEdges] = useState(() => (puzzle.initialEdges?.() || []));
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [simResult, setSimResult] = useState(null);
  // Progressive-reveal hint state lives in `hintFlash` below; it carries
  // both the title ("Placed: Cache") and rationale (WHY that piece) plus
  // the id(s) for the gold pulse.

  // Snapshot-based undo/redo. Every state-mutating user action calls
  // `snapshot()` first, which pushes the current {nodes, edges} onto `past`
  // and clears `future`. Undo pops `past` → restores; pushes the popped
  // current to `future`. Redo reverses. Capped at 50 entries each. Puzzle
  // switch clears history.
  const HISTORY_LIMIT = 50;
  const [history, setHistory] = useState({ past: [], future: [] });
  const snapshot = useCallback(() => {
    setHistory((h) => ({
      past: [...h.past, { nodes, edges }].slice(-HISTORY_LIMIT),
      future: [],
    }));
  }, [nodes, edges]);
  const handleUndo = useCallback(() => {
    if (history.past.length === 0) return;
    const prev = history.past[history.past.length - 1];
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setHistory({
      past: history.past.slice(0, -1),
      future: [{ nodes, edges }, ...history.future].slice(0, HISTORY_LIMIT),
    });
    setSelectedNodeId(null);
  }, [history, nodes, edges]);
  const handleRedo = useCallback(() => {
    if (history.future.length === 0) return;
    const next = history.future[0];
    setNodes(next.nodes);
    setEdges(next.edges);
    setHistory({
      past: [...history.past, { nodes, edges }].slice(-HISTORY_LIMIT),
      future: history.future.slice(1),
    });
    setSelectedNodeId(null);
  }, [history, nodes, edges]);
  const [completedPuzzleIds, setCompletedPuzzleIds] = useState(() => {
    try {
      const raw = localStorage.getItem('sdg-completed');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const handleClearCompletion = useCallback((pid) => {
    setCompletedPuzzleIds((ids) => ids.filter((id) => id !== pid));
  }, []);
  const [celebrationKey, setCelebrationKey] = useState(0);
  // { id, sides: { top, right, bottom, left } } | null — which container is
  // currently being "tugged" by a child being dragged past its edges.
  const [shakingState, setShakingState] = useState(null);
  // Container id (or null) the currently-dragged child is hovered over as a
  // candidate new parent. Drives the gold-mint pulse on the target. Canvas
  // reports it on each drag tick; cleared on dragStop.
  const [dropTargetId, setDropTargetId] = useState(null);
  // { parentId, x, y, key } | null — ripple effect when a child attaches to a parent.
  const [ripple, setRipple] = useState(null);
  const rippleCounter = useRef(0);
  const triggerRipple = useCallback((parentId, relativePos) => {
    rippleCounter.current += 1;
    const key = rippleCounter.current;
    setRipple({ parentId, x: relativePos.x, y: relativePos.y, key });
    setTimeout(() => {
      setRipple((current) => (current && current.key === key ? null : current));
    }, 1100);
  }, []);

  // Sibling-scoot animation: collect ids that just got scooted; CSS adds a
  // transform transition to those nodes for the duration.
  const [scootingIds, setScootingIds] = useState([]);
  const triggerScoot = useCallback((ids) => {
    setScootingIds(ids);
    setTimeout(() => {
      setScootingIds((current) => (current === ids ? [] : current));
    }, 280);
  }, []);

  // Hint banner state. Persists until cleared by: another Hint click,
  // Reset, Show Solution, puzzle switch, or the user dismissing via ✕.
  // The node/edge gold-pulse animation runs only for the first ~3s after a
  // hint placement (CSS keyframe count limits it) so the player isn't stuck
  // staring at a perpetually-pulsing node, but the banner text stays put.
  const [hintFlash, setHintFlash] = useState({ nodeIds: [], edgeIds: [], title: null, rationale: null, key: 0 });
  const hintFlashCounter = useRef(0);
  const triggerHintFlash = useCallback((payload) => {
    hintFlashCounter.current += 1;
    setHintFlash({ ...payload, key: hintFlashCounter.current });
  }, []);
  const dismissHintFlash = useCallback(() => {
    setHintFlash((cur) => ({ nodeIds: [], edgeIds: [], title: null, rationale: null, key: cur.key }));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('sdg-completed', JSON.stringify(completedPuzzleIds));
    } catch {
      // ignore quota / private-mode failures
    }
  }, [completedPuzzleIds]);

  // Palette collapse state — persisted to localStorage so the user's
  // preference survives reloads. Default expanded so first-time visitors
  // see the palette content.
  const [paletteCollapsed, setPaletteCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sdg-palette-collapsed') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('sdg-palette-collapsed', paletteCollapsed ? '1' : '0');
    } catch {
      // ignore
    }
  }, [paletteCollapsed]);

  // Auto-stack: when ON, child positions inside a parent snap to a 20px
  // grid on drop / drag-stop, and the parent reflow keeps things tidy.
  // Default ON for new visitors; toggle in the Palette under "Components".
  const [autoStack, setAutoStack] = useState(() => {
    try {
      const raw = localStorage.getItem('sdg-auto-stack');
      // Default true; only off when the value is exactly '0'.
      return raw !== '0';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('sdg-auto-stack', autoStack ? '1' : '0');
    } catch {
      // ignore
    }
  }, [autoStack]);

  // Drag-to-resize sizes for the three layout chrome regions. Each is
  // persisted to localStorage so a user's preferred layout sticks across
  // reloads. Clamping is enforced inside the resize handles.
  const loadNum = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      const n = raw != null ? Number(raw) : NaN;
      return Number.isFinite(n) ? n : fallback;
    } catch {
      return fallback;
    }
  };
  const [topPaneHeight, setTopPaneHeight] = useState(() => loadNum('sdg-top-pane-height', 280));
  const [paletteWidth, setPaletteWidth] = useState(() => loadNum('sdg-palette-width', 220));
  const [rightStackWidth, setRightStackWidth] = useState(() => loadNum('sdg-right-stack-width', 320));
  const [rightStackCollapsed, setRightStackCollapsed] = useState(() => {
    try { return localStorage.getItem('sdg-right-stack-collapsed') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('sdg-top-pane-height', String(topPaneHeight)); } catch { /* ignore */ }
  }, [topPaneHeight]);
  useEffect(() => {
    try { localStorage.setItem('sdg-palette-width', String(paletteWidth)); } catch { /* ignore */ }
  }, [paletteWidth]);
  useEffect(() => {
    try { localStorage.setItem('sdg-right-stack-width', String(rightStackWidth)); } catch { /* ignore */ }
  }, [rightStackWidth]);
  useEffect(() => {
    try { localStorage.setItem('sdg-right-stack-collapsed', rightStackCollapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [rightStackCollapsed]);

  // Containers grow their actual width/height to fit children on the
  // right/bottom side. Never shifts position — left/top growth is purely
  // a visual frame extension applied at render time below.
  useEffect(() => {
    const reflowed = reflowContainers(nodes);
    if (reflowed.some((n, i) => n !== nodes[i])) {
      setNodes(reflowed);
    }
  }, [nodes]);

  // When autoStack flips OFF→ON, snap every existing parented child to the
  // grid in one shot. Subsequent drops/drag-stops handle ongoing snapping.
  // Doesn't run on initial mount (the prevAutoStack ref is seeded equal to
  // autoStack, so the first effect-fire is a no-op).
  const prevAutoStackRef = useRef(autoStack);
  useEffect(() => {
    const prev = prevAutoStackRef.current;
    prevAutoStackRef.current = autoStack;
    if (!autoStack || prev === autoStack) return;
    setNodes((ns) => {
      const snapped = snapAllParentedChildren(ns);
      if (snapped === ns) return ns;
      // Snapping may have changed child positions enough that the parent's
      // bounding-box reflow needs to re-run for an exact fit.
      return reflowContainers(snapped);
    });
  }, [autoStack]);

  const handleAddHardware = useCallback((computerId) => {
    snapshot();
    setNodes((ns) => sortParentsFirst(prepopulateComputerHardware(ns, computerId)));
  }, [snapshot]);

  const handleSetPort = useCallback((nodeId, port) => {
    snapshot();
    setNodes((ns) =>
      ns.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, config: { ...n.data.config, port } } }
          : n
      )
    );
  }, [snapshot]);

  const handleReparent = useCallback((nodeId, newParentId) => {
    snapshot();
    setNodes((ns) => {
      const node = ns.find((n) => n.id === nodeId);
      if (!node) return ns;
      const currentParentId = node.parentNode || null;
      if (newParentId === currentParentId) return ns;
      const nodeWorld = worldPosition(node, ns);
      let newPos;
      if (newParentId) {
        const target = ns.find((n) => n.id === newParentId);
        if (!target) return ns;
        const targetWorld = worldPosition(target, ns);
        newPos = { x: 12, y: 32 };
        const candidateRel = {
          x: nodeWorld.x - targetWorld.x,
          y: nodeWorld.y - targetWorld.y,
        };
        if (candidateRel.x >= 0 && candidateRel.y >= 0) newPos = candidateRel;
      } else {
        newPos = nodeWorld;
      }
      const updated = ns.map((n) =>
        n.id === nodeId
          ? { ...n, parentNode: newParentId || undefined, extent: undefined, position: newPos }
          : n
      );
      return sortParentsFirst(updated);
    });
  }, [snapshot]);

  // Always-on simulation used for per-node display (so the Computer header
  // updates as you edit RAM, etc.). The Run button still controls the
  // "evaluate against puzzle requirements" flow in the PuzzleBar.
  const liveSim = useMemo(() => simulate(puzzle, nodes, edges), [puzzle, nodes, edges]);

  const displayNodes = useMemo(() => {
    const containers = nodes.filter((n) => componentTypes[n.data.type]?.container);
    return nodes.map((n) => {
      const meta = componentTypes[n.data.type];
      // Re-parent menu options: "canvas" + every other container that isn't this node
      // and isn't a descendant of this node (containers shouldn't be put in themselves).
      const reparentTargets = [
        { id: null, label: 'On canvas' },
        ...containers
          .filter((c) => c.id !== n.id && c.parentNode !== n.id)
          .map((c) => ({ id: c.id, label: `In ${componentTypes[c.data.type].label}` })),
      ];
      const data = {
        ...n.data,
        // `failed` from n.data flows through automatically via the spread,
        // but read it locally so SystemNode and any descendant can render
        // the offline treatment without having to look it up themselves.
        sim: liveSim?.ok ? liveSim.perNode[n.id] : undefined,
        parentId: n.parentNode || null,
        shakeSides: shakingState?.id === n.id ? shakingState.sides : null,
        // Overshoot is computed from data so it persists across drag boundaries —
        // the frame stays extended as long as a child is sticking out, even after release.
        overshoot: meta?.container ? computeOvershoot(n, nodes) : null,
        ripple: ripple?.parentId === n.id ? { x: ripple.x, y: ripple.y, key: ripple.key } : null,
        reparentTargets: meta?.container && n.parentNode == null
          ? reparentTargets.filter((t) => t.id !== null) // top-level container can't go to canvas (it's already there)
          : reparentTargets,
        onReparent: (targetId) => handleReparent(n.id, targetId),
        // Computer gets the "Add hardware" menu action.
        onAddHardware: n.data.type === 'computer'
          ? () => handleAddHardware(n.id)
          : undefined,
        // Anything that has a `port` in its config gets the "Set port" menu.
        onSetPort: n.data.config?.port != null
          ? (port) => handleSetPort(n.id, port)
          : undefined,
        // Generic config-change callback used by in-node editors (currently
        // just textInput's value field). Mirrors handleConfigChange's effect
        // without snapshotting — the textInput edits a string in real time
        // and snapshotting every keystroke would flood the undo stack.
        onConfigChange: (nextCfg) =>
          setNodes((ns) =>
            ns.map((nn) =>
              nn.id === n.id ? { ...nn, data: { ...nn.data, config: nextCfg } } : nn
            )
          ),
      };
      const classes = [];
      if (scootingIds.includes(n.id)) classes.push('scooting');
      if (hintFlash.nodeIds.includes(n.id)) classes.push('hint-flash');
      if (dropTargetId === n.id) classes.push('drop-target');
      // ALWAYS set className (use undefined when no classes). Canvas writes
      // displayNodes back into App's raw `nodes` via setNodes(scootedNodes),
      // so leaving className unset here would leak the previous frame's
      // className into the next render — eg. .drop-target persisting after
      // dragStop. Setting `undefined` clears any stale value.
      const className = classes.length ? classes.join(' ') : undefined;
      return { ...n, data, className };
    });
  }, [nodes, liveSim, handleReparent, handleAddHardware, handleSetPort, shakingState, ripple, scootingIds, hintFlash, dropTargetId]);


  const displayEdges = useMemo(() => {
    const failedIds = new Set(nodes.filter((n) => n.data?.failed).map((n) => n.id));
    return edges.map((e) => {
      const kind = e.data?.kind || 'both';
      const failed = failedIds.has(e.source) || failedIds.has(e.target);
      const flashing = hintFlash.edgeIds.includes(e.id);
      const color = failed ? '#444' : flashing ? '#fbbf24' : edgeKindColor(kind);
      // Arrow direction is rendered by FloatingEdge itself (it owns its
      // SVG marker def with orient="auto-start-reverse" so markerStart and
      // markerEnd are visual mirrors). App.jsx just supplies stroke color +
      // labels; FloatingEdge reads data.arrows for the toggled state.
      const baseStyle = failed
        ? { stroke: color, strokeWidth: 2, strokeDasharray: '6 4', opacity: 0.5 }
        : { stroke: color, strokeWidth: 2 };
      return {
        ...e,
        // Force the floating edge type so every edge anchors to node perimeters
        // instead of to fixed handle dots — even edges that came from an older
        // shape (puzzle.initialNodes(), pre-floating sessions).
        type: 'floating',
        // CSS-driven animation in FloatingEdge replaces React Flow's built-in.
        animated: false,
        label: edgeKindLabel(kind),
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 4,
        labelStyle: { fill: '#0b0a1a', fontSize: 10, fontWeight: 700 },
        labelBgStyle: { fill: color, opacity: failed ? 0.4 : 1 },
        style: flashing ? { ...baseStyle, strokeWidth: 4 } : baseStyle,
        className: flashing ? 'hint-flash-edge' : undefined,
      };
    });
  }, [edges, nodes, hintFlash]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const handleConfigChange = useCallback((id, nextCfg) => {
    snapshot();
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, config: nextCfg } } : n))
    );
  }, [snapshot]);

  // Failure injection: mark a node failed (sim filters it out, UI grays it out).
  // Reversible by clicking the button again. Per-session only — not persisted.
  const handleToggleFailed = useCallback((id) => {
    snapshot();
    setNodes((ns) =>
      ns.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, failed: !n.data.failed } } : n
      )
    );
  }, [snapshot]);

  const handleDeleteNode = useCallback(
    (id) => {
      snapshot();
      setNodes((ns) => {
        const removed = ns.find((n) => n.id === id);
        const px = removed?.position?.x || 0;
        const py = removed?.position?.y || 0;
        return ns
          .filter((n) => n.id !== id)
          .map((n) =>
            n.parentNode === id
              ? {
                  ...n,
                  position: { x: (n.position?.x || 0) + px, y: (n.position?.y || 0) + py },
                  parentNode: undefined,
                  extent: undefined,
                }
              : n
          );
      });
      setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
      if (selectedNodeId === id) setSelectedNodeId(null);
    },
    [selectedNodeId, snapshot]
  );

  const handleRun = useCallback(() => {
    const result = simulate(puzzle, nodes, edges);
    setSimResult(result);
    if (result?.ok) {
      const ev = evaluatePuzzle(puzzle, result);
      if (ev.passed) {
        setCelebrationKey((k) => k + 1);
        setCompletedPuzzleIds((ids) =>
          ids.includes(puzzle.id) ? ids : [...ids, puzzle.id]
        );
      }
    }
  }, [puzzle, nodes, edges]);

  const handleReset = useCallback(() => {
    snapshot();
    setNodes(puzzle.initialNodes());
    setEdges(puzzle.initialEdges?.() || []);
    setSelectedNodeId(null);
    setSimResult(null);
    dismissHintFlash();
  }, [puzzle, snapshot, dismissHintFlash]);

  const handleShowSolution = useCallback(() => {
    // Replace the canvas state with the puzzle's canonical passing graph.
    // Reset still works to go back to initialNodes if the player wants to try.
    if (typeof puzzle.solution !== 'function') return;
    snapshot();
    const { nodes: solNodes, edges: solEdges } = puzzle.solution();
    setNodes(sortParentsFirst(solNodes));
    setEdges(solEdges);
    setSelectedNodeId(null);
    setSimResult(null);
    dismissHintFlash();
  }, [puzzle, snapshot, dismissHintFlash]);

  // Progressive reveal: place the next missing canonical node, OR if all
  // canonical nodes are present, wire the next missing canonical edge whose
  // endpoints both exist. Lets a stuck beginner make one move forward without
  // dumping the entire solution on them.
  const handleHint = useCallback(() => {
    if (typeof puzzle.solution !== 'function') {
      triggerHintFlash({
        nodeIds: [], edgeIds: [],
        title: 'No canonical solution available for this lesson.',
        rationale: null,
      });
      return;
    }
    const { nodes: canonNodes, edges: canonEdges } = puzzle.solution();
    const currentNodeIds = new Set(nodes.map((n) => n.id));
    // Only place a node when its parent (if any) already exists on the canvas
    // — otherwise the child would dangle in canvas space with no frame.
    const missingNode = canonNodes.find(
      (n) => !currentNodeIds.has(n.id) && (!n.parentNode || currentNodeIds.has(n.parentNode))
    );
    if (missingNode) {
      snapshot();
      setNodes((ns) => sortParentsFirst([...ns, missingNode]));
      const labelMeta = metaFor(missingNode) || componentTypes[missingNode.data?.type];
      const label = labelMeta?.label || missingNode.id;
      triggerHintFlash({
        nodeIds: [missingNode.id], edgeIds: [],
        title: `💡 Placed: ${label}`,
        rationale: findHintRationale(puzzle, missingNode),
      });
      return;
    }
    const currentEdgeKeys = new Set(
      edges.map((e) => `${e.source}→${e.target}:${e.data?.kind || 'both'}`)
    );
    const missingEdge = canonEdges.find((e) => {
      const key = `${e.source}→${e.target}:${e.data?.kind || 'both'}`;
      return (
        !currentEdgeKeys.has(key) &&
        currentNodeIds.has(e.source) &&
        currentNodeIds.has(e.target)
      );
    });
    if (missingEdge) {
      snapshot();
      setEdges((es) => [...es, missingEdge]);
      const sourceNode = nodes.find((n) => n.id === missingEdge.source);
      const targetNode = nodes.find((n) => n.id === missingEdge.target);
      const sourceLabel = (sourceNode && (metaFor(sourceNode)?.label)) || missingEdge.source;
      const targetLabel = (targetNode && (metaFor(targetNode)?.label)) || missingEdge.target;
      triggerHintFlash({
        nodeIds: [missingEdge.source, missingEdge.target],
        edgeIds: [missingEdge.id],
        title: `💡 Wired: ${sourceLabel} → ${targetLabel}`,
        rationale: findHintEdgeRationale(puzzle, sourceNode, targetNode),
      });
      return;
    }
    triggerHintFlash({
      nodeIds: [], edgeIds: [],
      title: '💡 All canonical pieces are placed — click ▶ Run to verify.',
      rationale: null,
    });
  }, [puzzle, nodes, edges, snapshot, triggerHintFlash]);

  const handleSwitchPuzzle = useCallback(
    (pid) => {
      if (pid === activePuzzleId) return;
      const next = puzzles[pid];
      setActivePuzzleId(pid);
      setNodes(next.initialNodes());
      setEdges(next.initialEdges?.() || []);
      setSelectedNodeId(null);
      setSimResult(null);
      dismissHintFlash();
      // Puzzle switch is a context change, not an edit — clear undo history.
      setHistory({ past: [], future: [] });
    },
    [activePuzzleId, dismissHintFlash]
  );

  // Keyboard shortcuts: Cmd/Ctrl+Z = undo, Shift+Cmd/Ctrl+Z (or Cmd/Ctrl+Y) = redo.
  // Bypassed when focus is on an input/textarea/select so typing isn't intercepted.
  useEffect(() => {
    const handler = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key?.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  const evaluation = useMemo(
    () => (simResult ? evaluatePuzzle(puzzle, simResult) : { passed: false, results: [] }),
    [puzzle, simResult]
  );

  return (
    <div className="app">
      <div className="puzzle-bar-wrap" style={{ height: topPaneHeight }}>
        <PuzzleBar
          puzzle={puzzle}
          simResult={simResult}
          evaluation={evaluation}
          onRun={handleRun}
          onReset={handleReset}
          onShowSolution={handleShowSolution}
          onHint={handleHint}
          onUndo={handleUndo}
          canUndo={history.past.length > 0}
          celebrationKey={celebrationKey}
        />
        <ResizeHandle
          orientation="vertical"
          side="bottom"
          getCurrent={() => topPaneHeight}
          onChange={setTopPaneHeight}
          min={120}
          max={520}
        />
      </div>
      <div
        className="app-body"
        data-palette-collapsed={paletteCollapsed ? 'true' : 'false'}
        data-right-collapsed={rightStackCollapsed ? 'true' : 'false'}
        style={{
          gridTemplateColumns: `${paletteCollapsed ? 36 : paletteWidth}px 1fr ${rightStackCollapsed ? 36 : rightStackWidth}px`,
        }}
      >
        <div className="palette-wrap">
          <Palette
            puzzle={puzzle}
            onSwitchPuzzle={handleSwitchPuzzle}
            completedPuzzleIds={completedPuzzleIds}
            onClearCompletion={handleClearCompletion}
            collapsed={paletteCollapsed}
            onToggleCollapse={() => setPaletteCollapsed((v) => !v)}
            autoStack={autoStack}
            onToggleAutoStack={() => setAutoStack((v) => !v)}
            activeTrack={activeTrack}
            onSwitchTrack={(track) => {
              setActiveTrack(track);
              // If the current puzzle isn't in the new track, jump to the
              // first puzzle of the new track so the player sees content.
              const cur = puzzles[activePuzzleId];
              if ((cur?.track || 'systems') !== track) {
                const firstInTrack = puzzleOrder.find((pid) => {
                  const t = puzzles[pid].track || 'systems';
                  return t === track;
                });
                if (firstInTrack) handleSwitchPuzzle(firstInTrack);
              }
            }}
          />
          {!paletteCollapsed && (
            <ResizeHandle
              orientation="horizontal"
              side="right"
              getCurrent={() => paletteWidth}
              onChange={setPaletteWidth}
              min={160}
              max={420}
            />
          )}
        </div>
        <div className="canvas-wrap">
          <Canvas
            nodes={displayNodes}
            setNodes={setNodes}
            regions={puzzle.regions}
            onSnapshot={snapshot}
            edges={displayEdges}
            setEdges={setEdges}
            onSelectNode={setSelectedNodeId}
            onSetShaking={setShakingState}
            onSetDropTarget={setDropTargetId}
            onRipple={triggerRipple}
            onScoot={triggerScoot}
            onDeleteNode={handleDeleteNode}
            autoStack={autoStack}
            selectedNode={selectedNode}
          />
          {hintFlash.title && (
            <div
              key={`hint-banner-${hintFlash.key}`}
              className="canvas-hint-banner"
              role="status"
            >
              <button
                className="canvas-hint-banner-dismiss"
                onClick={dismissHintFlash}
                aria-label="Dismiss hint"
                title="Dismiss"
              >
                ✕
              </button>
              <div className="canvas-hint-banner-title">{hintFlash.title}</div>
              {hintFlash.rationale && (
                <div className="canvas-hint-banner-rationale">{hintFlash.rationale}</div>
              )}
            </div>
          )}
        </div>
        <div className={`app-right-stack${rightStackCollapsed ? ' app-right-stack--collapsed' : ''}`}>
          {rightStackCollapsed ? (
            <button
              type="button"
              className="right-stack-toggle right-stack-toggle--collapsed"
              onClick={() => setRightStackCollapsed(false)}
              aria-expanded="false"
              title="Expand properties"
            >
              ◂
            </button>
          ) : (
            <>
              <ResizeHandle
                orientation="horizontal"
                side="left"
                getCurrent={() => rightStackWidth}
                onChange={setRightStackWidth}
                min={240}
                max={640}
              />
              <button
                type="button"
                className="right-stack-toggle"
                onClick={() => setRightStackCollapsed(true)}
                aria-expanded="true"
                title="Collapse properties"
              >
                ▸
              </button>
              <PropertyPanel
                node={selectedNode}
                onChange={handleConfigChange}
                onDelete={handleDeleteNode}
                onToggleFailed={handleToggleFailed}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
