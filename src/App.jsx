import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Canvas from './components/Canvas.jsx';
import Palette from './components/Palette.jsx';
import PropertyPanel from './components/PropertyPanel.jsx';
import PuzzleBar from './components/PuzzleBar.jsx';

import { simulate } from './lib/simulator.js';
import { reflowContainers } from './lib/reflow.js';
import { prepopulateComputerHardware, sortParentsFirst, worldPosition } from './lib/graph.js';
import { componentTypes } from './lib/componentTypes.js';
import { computeOvershoot } from './lib/containerBehavior.js';
import { puzzles, defaultPuzzleId, evaluatePuzzle } from './lib/puzzles.js';

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
  const [activePuzzleId, setActivePuzzleId] = useState(defaultPuzzleId);
  const puzzle = puzzles[activePuzzleId];

  const [nodes, setNodes] = useState(() => puzzle.initialNodes());
  const [edges, setEdges] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [simResult, setSimResult] = useState(null);

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
  const [celebrationKey, setCelebrationKey] = useState(0);
  // { id, sides: { top, right, bottom, left } } | null — which container is
  // currently being "tugged" by a child being dragged past its edges.
  const [shakingState, setShakingState] = useState(null);
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

  const [readingShownIds, setReadingShownIds] = useState(() => {
    try {
      const raw = localStorage.getItem('sdg-reading-shown');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [readingExpanded, setReadingExpanded] = useState(() => {
    const hasBackground = Array.isArray(puzzle.background) && puzzle.background.length > 0;
    if (!hasBackground) return false;
    try {
      const raw = localStorage.getItem('sdg-reading-shown');
      const seen = raw ? JSON.parse(raw) : [];
      return !seen.includes(puzzle.id);
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('sdg-completed', JSON.stringify(completedPuzzleIds));
    } catch {
      // ignore quota / private-mode failures
    }
  }, [completedPuzzleIds]);

  useEffect(() => {
    try {
      localStorage.setItem('sdg-reading-shown', JSON.stringify(readingShownIds));
    } catch {
      // ignore
    }
  }, [readingShownIds]);

  // When the reading panel opens, mark this puzzle as having been shown so
  // subsequent visits skip the auto-open.
  useEffect(() => {
    if (readingExpanded && !readingShownIds.includes(puzzle.id)) {
      setReadingShownIds((ids) => [...ids, puzzle.id]);
    }
  }, [readingExpanded, readingShownIds, puzzle.id]);

  // Containers grow their actual width/height to fit children on the
  // right/bottom side. Never shifts position — left/top growth is purely
  // a visual frame extension applied at render time below.
  useEffect(() => {
    const reflowed = reflowContainers(nodes);
    if (reflowed.some((n, i) => n !== nodes[i])) {
      setNodes(reflowed);
    }
  }, [nodes]);

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
      };
      const className = scootingIds.includes(n.id) ? 'scooting' : undefined;
      return { ...n, data, ...(className ? { className } : {}) };
    });
  }, [nodes, liveSim, handleReparent, handleAddHardware, handleSetPort, shakingState, ripple, scootingIds]);


  const displayEdges = useMemo(() => {
    const failedIds = new Set(nodes.filter((n) => n.data?.failed).map((n) => n.id));
    return edges.map((e) => {
      const kind = e.data?.kind || 'both';
      const failed = failedIds.has(e.source) || failedIds.has(e.target);
      const color = failed ? '#444' : edgeKindColor(kind);
      // Arrow direction is rendered by FloatingEdge itself (it owns its
      // SVG marker def with orient="auto-start-reverse" so markerStart and
      // markerEnd are visual mirrors). App.jsx just supplies stroke color +
      // labels; FloatingEdge reads data.arrows for the toggled state.
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
        style: failed
          ? { stroke: color, strokeWidth: 2, strokeDasharray: '6 4', opacity: 0.5 }
          : { stroke: color, strokeWidth: 2 },
      };
    });
  }, [edges, nodes]);

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
    setEdges([]);
    setSelectedNodeId(null);
    setSimResult(null);
  }, [puzzle, snapshot]);

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
  }, [puzzle, snapshot]);

  const handleSwitchPuzzle = useCallback(
    (pid) => {
      if (pid === activePuzzleId) return;
      const next = puzzles[pid];
      setActivePuzzleId(pid);
      setNodes(next.initialNodes());
      setEdges([]);
      setSelectedNodeId(null);
      setSimResult(null);
      // Puzzle switch is a context change, not an edit — clear undo history.
      setHistory({ past: [], future: [] });
      const hasBackground = Array.isArray(next.background) && next.background.length > 0;
      setReadingExpanded(hasBackground && !readingShownIds.includes(pid));
    },
    [activePuzzleId, readingShownIds]
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
      <PuzzleBar
        puzzle={puzzle}
        simResult={simResult}
        evaluation={evaluation}
        onRun={handleRun}
        onReset={handleReset}
        onShowSolution={handleShowSolution}
        onUndo={handleUndo}
        canUndo={history.past.length > 0}
        readingExpanded={readingExpanded}
        onToggleReading={() => setReadingExpanded((v) => !v)}
        celebrationKey={celebrationKey}
      />
      <div className="app-body">
        <Palette
          puzzle={puzzle}
          onSwitchPuzzle={handleSwitchPuzzle}
          completedPuzzleIds={completedPuzzleIds}
        />
        <Canvas
          nodes={displayNodes}
          setNodes={setNodes}
          regions={puzzle.regions}
          onSnapshot={snapshot}
          edges={displayEdges}
          setEdges={setEdges}
          onSelectNode={setSelectedNodeId}
          onSetShaking={setShakingState}
          onRipple={triggerRipple}
          onScoot={triggerScoot}
          onDeleteNode={handleDeleteNode}
          selectedNode={selectedNode}
        />
        <PropertyPanel
          node={selectedNode}
          onChange={handleConfigChange}
          onDelete={handleDeleteNode}
          onToggleFailed={handleToggleFailed}
        />
      </div>
    </div>
  );
}
