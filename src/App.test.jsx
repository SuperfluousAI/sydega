// Visual-contract tests for App-level wiring. These specifically catch the
// class of bug where a component test passes (the JSX renders) but the
// element doesn't appear in the running app because it's in the wrong
// parent, hidden, or mis-routed by App's state wiring.
//
// We mock reactflow to a minimal shell that just renders the nodes + edges
// it receives into the DOM with their `className` propagated. This is the
// part of reactflow's contract App.jsx depends on. The mock is enough to
// assert "is the gold flash class actually applied to the placed node?"
// and "is the canvas-hint-banner inside the canvas-wrap?"

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';

// Tests that need to fire drag handlers (drop-target highlight,
// reparenting, etc.) read the latest drag handlers from `rfHandlers`.
const rfHandlers = { onNodeDrag: null, onNodeDragStop: null };

vi.mock('reactflow', async () => {
  // Minimal shell. Renders nodes + edges as DOM elements so tests can
  // query for them and assert classNames. Ignores layout / handles /
  // edge geometry — those have their own focused tests.
  // eslint-disable-next-line react-refresh/only-export-components
  const ReactFlow = ({ nodes = [], edges = [], children, onNodeDrag, onNodeDragStop }) => {
    // Capture handlers on each render so tests always invoke the freshest
    // closure (App's useCallback rebinds when its dependency array changes).
    rfHandlers.onNodeDrag = onNodeDrag;
    rfHandlers.onNodeDragStop = onNodeDragStop;
    return (
      <div data-testid="rf-root">
        <div className="react-flow__viewport">
          {nodes.map((n) => {
            // Surface a few state-bearing data props as data-* attributes so
            // tests can assert visual contracts (drop-target class, shake
            // sides, etc.) without re-rendering the real SystemNode tree.
            const sides = n.data?.shakeSides;
            const shaking = sides && (sides.top || sides.right || sides.bottom || sides.left);
            return (
              <div
                key={n.id}
                data-id={n.id}
                data-type={n.data?.type}
                data-shaking={shaking ? 'true' : 'false'}
                className={`react-flow__node react-flow__node-system ${n.className || ''}`.trim()}
              />
            );
          })}
          {edges.map((e) => (
            <div
              key={e.id}
              data-edge-id={e.id}
              className={`react-flow__edge ${e.className || ''}`.trim()}
            />
          ))}
        </div>
        {children}
      </div>
    );
  };
  return {
    default: ReactFlow,
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    BaseEdge: () => null,
    EdgeLabelRenderer: ({ children }) => <>{children}</>,
    Handle: () => null,
    Position: { Top: 'top', Right: 'right', Bottom: 'bottom', Left: 'left' },
    addEdge: (params, eds) => [...eds, params],
    applyEdgeChanges: (_changes, eds) => eds,
    applyNodeChanges: (_changes, nds) => nds,
    useNodesState: (initial) => {
      // dummy — App passes nodes via props anyway
      return [initial, () => {}, () => {}];
    },
    useEdgesState: (initial) => [initial, () => {}, () => {}],
    useReactFlow: () => ({
      screenToFlowPosition: ({ x, y }) => ({ x, y }),
      flowToScreenPosition: ({ x, y }) => ({ x, y }),
      getNodes: () => [],
      getEdges: () => [],
      setNodes: () => {},
      setEdges: () => {},
      fitView: () => {},
      fitBounds: () => {},
      project: ({ x, y }) => ({ x, y }),
      getNode: () => null,
      zoomTo: () => {},
      setViewport: () => {},
    }),
    ReactFlowProvider: ({ children }) => <>{children}</>,
    useStore: (selector) => selector({
      transform: [0, 0, 1],
      width: 800,
      height: 600,
    }),
    useUpdateNodeInternals: () => () => {},
    getBezierPath: () => ['M0,0', 0, 0],
    getStraightPath: () => ['M0,0', 0, 0],
  };
});

// React Flow normally pulls in this CSS; the import is a noop in tests.
vi.mock('reactflow/dist/style.css', () => ({}));

import App from './App.jsx';

beforeEach(() => {
  // Reset persisted state so test runs are deterministic.
  localStorage.clear();
});

describe('App visual contract — hint button', () => {
  it('renders the Hint button inside .puzzle-actions on the default puzzle', () => {
    const { container } = render(<App />);
    const btn = container.querySelector('.hint-button');
    expect(btn).not.toBeNull();
    expect(btn.closest('.puzzle-actions')).not.toBeNull();
  });

  it('clicking Hint places the next canonical node AND flashes it gold', () => {
    const { container } = render(<App />);
    // Snapshot the initial nodes from the default lesson's initialNodes().
    const initialCount = container.querySelectorAll('.react-flow__node-system').length;
    act(() => {
      fireEvent.click(container.querySelector('.hint-button'));
    });
    const afterCount = container.querySelectorAll('.react-flow__node-system').length;
    expect(afterCount).toBe(initialCount + 1);
    // The added node carries the hint-flash class so CSS animation runs.
    const flashed = container.querySelectorAll('.react-flow__node-system.hint-flash');
    expect(flashed.length).toBe(1);
  });

  it('renders the canvas hint banner inside .canvas-wrap after a hint click', () => {
    const { container } = render(<App />);
    act(() => {
      fireEvent.click(container.querySelector('.hint-button'));
    });
    const banner = container.querySelector('.canvas-hint-banner');
    expect(banner).not.toBeNull();
    expect(banner.closest('.canvas-wrap')).not.toBeNull();
    expect(banner.querySelector('.canvas-hint-banner-title').textContent).toMatch(/💡|Placed|Wired/);
  });

  // VISUAL CONTRACT: the rationale subline must render on the canvas
  // banner — that's where the player reads WHY the piece is needed.
  it('renders a non-trivial rationale subline in the canvas banner', () => {
    const { container } = render(<App />);
    act(() => {
      fireEvent.click(container.querySelector('.hint-button'));
    });
    const bannerRationale = container.querySelector('.canvas-hint-banner-rationale');
    expect(bannerRationale).not.toBeNull();
    expect(bannerRationale.textContent.length).toBeGreaterThan(20);
  });

  // The sidebar hint duplicate was removed; the canvas banner is the single
  // source of truth so the fixed-height top pane can't clip the message.
  it('does NOT render a sidebar hint message in the top bar', () => {
    const { container } = render(<App />);
    act(() => {
      fireEvent.click(container.querySelector('.hint-button'));
    });
    expect(container.querySelector('.puzzle-hint-message')).toBeNull();
  });

  it('canvas hint banner persists until ✕ is clicked', () => {
    const { container } = render(<App />);
    act(() => {
      fireEvent.click(container.querySelector('.hint-button'));
    });
    expect(container.querySelector('.canvas-hint-banner')).not.toBeNull();
    act(() => {
      fireEvent.click(container.querySelector('.canvas-hint-banner-dismiss'));
    });
    expect(container.querySelector('.canvas-hint-banner')).toBeNull();
  });

  it('canvas hint banner is cleared when Reset is clicked', () => {
    const { container } = render(<App />);
    act(() => {
      fireEvent.click(container.querySelector('.hint-button'));
    });
    expect(container.querySelector('.canvas-hint-banner')).not.toBeNull();
    // Find the Reset button by text and click it.
    const resetBtn = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent.trim() === 'Reset');
    expect(resetBtn).toBeTruthy();
    act(() => { fireEvent.click(resetBtn); });
    expect(container.querySelector('.canvas-hint-banner')).toBeNull();
  });
});

describe('App visual contract — drop-target highlight', () => {
  // Lesson 1's initial canvas: a Computer container at (280,140) sized
  // 340×220, and a Program node at (80,200) that is NOT inside the
  // Computer. Dragging the Program's center over the Computer should
  // light up the Computer with class "drop-target".
  function getProgramDragNode(container) {
    // The mocked reactflow doesn't pass real node objects on drag — we
    // build one that matches what reactflow would supply: id + position
    // + data + parentNode.
    return {
      id: 'program-1',
      position: { x: 365, y: 205 }, // center at (450, 250), inside Computer's world bounds
      data: { type: 'program', config: {} },
      // parentNode left undefined — Program starts on canvas, not in any container.
    };
  }

  it('applies .drop-target class to the Computer when the dragged Program is hovered over it', () => {
    const { container } = render(<App />);
    expect(rfHandlers.onNodeDrag).toBeTruthy();
    // Before any drag: no drop-target class anywhere.
    expect(container.querySelector('.drop-target')).toBeNull();
    act(() => {
      rfHandlers.onNodeDrag(
        // Synthetic mouse event; the drag handler only reads clientX/Y for
        // the trash-hover check, which doesn't fire on Computer geometry.
        { clientX: 450, clientY: 250 },
        getProgramDragNode(container),
      );
    });
    const computer = container.querySelector('[data-id="computer-1"]');
    expect(computer).not.toBeNull();
    expect(computer.className).toMatch(/\bdrop-target\b/);
  });

  it('clears .drop-target on dragStop', () => {
    const { container } = render(<App />);
    act(() => {
      rfHandlers.onNodeDrag(
        { clientX: 450, clientY: 250 },
        getProgramDragNode(container),
      );
    });
    expect(container.querySelector('.drop-target')).not.toBeNull();
    act(() => {
      rfHandlers.onNodeDragStop(
        { clientX: 450, clientY: 250 },
        getProgramDragNode(container),
      );
    });
    expect(container.querySelector('.drop-target')).toBeNull();
  });

  it('does NOT highlight the current parent when a child is dragged within it', () => {
    // Synthetic CPU child of computer-1, still inside computer's bounds.
    // Dragging WITHIN the current parent shouldn't pulse the parent — only
    // hovering over a *different* container does.
    const { container } = render(<App />);
    const inParent = {
      id: 'cpu-test',
      position: { x: 10, y: 10 },  // local pos inside computer-1
      data: { type: 'cpu', config: {} },
      parentNode: 'computer-1',
    };
    act(() => {
      rfHandlers.onNodeDrag({ clientX: 0, clientY: 0 }, inParent);
    });
    expect(container.querySelector('.drop-target')).toBeNull();
  });
});

describe('App visual contract — auto-stack toggle', () => {
  it('renders the auto-stack checkbox in the palette by default ON', () => {
    const { container } = render(<App />);
    const cb = container.querySelector('.palette-auto-stack input[type="checkbox"]');
    expect(cb).not.toBeNull();
    expect(cb.checked).toBe(true);
  });

  it('persists OFF state across mounts via localStorage', () => {
    localStorage.setItem('sdg-auto-stack', '0');
    const { container } = render(<App />);
    const cb = container.querySelector('.palette-auto-stack input[type="checkbox"]');
    expect(cb.checked).toBe(false);
  });

  it('toggling the checkbox flips the App state', () => {
    const { container } = render(<App />);
    const cb = container.querySelector('.palette-auto-stack input[type="checkbox"]');
    expect(cb.checked).toBe(true);
    act(() => { fireEvent.click(cb); });
    expect(cb.checked).toBe(false);
    expect(localStorage.getItem('sdg-auto-stack')).toBe('0');
  });
});

describe('App visual contract — palette drag drop-target', () => {
  // Palette-to-canvas uses HTML5 drag events, not React Flow's onNodeDrag.
  // The drop-target highlight needs to fire from Canvas's onDragOver too,
  // not just from the in-canvas drag path. Cleared on dragLeave + drop.

  function fireDragOver(wrap, x, y) {
    const evt = new Event('dragover', { bubbles: true, cancelable: true });
    Object.assign(evt, {
      clientX: x,
      clientY: y,
      dataTransfer: { dropEffect: '', setData: () => {}, getData: () => '' },
    });
    wrap.dispatchEvent(evt);
  }

  it('pulses the Computer when the palette item is dragged over it', () => {
    const { container } = render(<App />);
    const wrap = container.querySelector('.canvas-wrapper');
    expect(wrap).not.toBeNull();
    // Inside computer-1 world bounds (280..620, 140..360).
    act(() => { fireDragOver(wrap, 450, 250); });
    const computer = container.querySelector('[data-id="computer-1"]');
    expect(computer.className).toMatch(/\bdrop-target\b/);
  });

  it('clears drop-target when the drag leaves the wrapper entirely', () => {
    const { container } = render(<App />);
    const wrap = container.querySelector('.canvas-wrapper');
    act(() => { fireDragOver(wrap, 450, 250); });
    expect(container.querySelector('.drop-target')).not.toBeNull();
    act(() => {
      const evt = new Event('dragleave', { bubbles: true, cancelable: true });
      // relatedTarget = document.body — outside the wrapper.
      Object.assign(evt, { relatedTarget: document.body });
      wrap.dispatchEvent(evt);
    });
    expect(container.querySelector('.drop-target')).toBeNull();
  });

  it('clears drop-target on drop', () => {
    const { container } = render(<App />);
    const wrap = container.querySelector('.canvas-wrapper');
    act(() => { fireDragOver(wrap, 450, 250); });
    expect(container.querySelector('.drop-target')).not.toBeNull();
    act(() => {
      const evt = new Event('drop', { bubbles: true, cancelable: true });
      Object.assign(evt, {
        clientX: 450,
        clientY: 250,
        // No payload — early-return path; we only care that drop-target clears.
        dataTransfer: { getData: () => '', setData: () => {} },
      });
      wrap.dispatchEvent(evt);
    });
    expect(container.querySelector('.drop-target')).toBeNull();
  });

  it('does NOT pulse anything when the drag is over empty canvas', () => {
    const { container } = render(<App />);
    const wrap = container.querySelector('.canvas-wrapper');
    // Far outside any container — no computer at (-500, -500).
    act(() => { fireDragOver(wrap, -500, -500); });
    expect(container.querySelector('.drop-target')).toBeNull();
  });
});

describe('App visual contract — child stays in parent past edge (leave margin)', () => {
  // Even with the child's center past the parent's edge, the child should
  // remain "inside" until the center crosses by more than LEAVE_MARGIN.
  // Manifests in App as: no .drop-target highlight while the child is
  // grazing the edge.
  it('child grazing parent edge does NOT trigger drop-target / shake', () => {
    const { container } = render(<App />);
    // computer-1 local bounds: 340×220. Child CPU is 170×90.
    // Place child so its center is 30px past parent's right edge
    // (LEAVE_MARGIN is 60, so still within margin → still inside).
    const child = {
      id: 'cpu-graze',
      // local x = parentW - childW/2 + 30 = 340 - 85 + 30 = 285
      position: { x: 285, y: 50 },
      data: { type: 'cpu', config: {} },
      parentNode: 'computer-1',
    };
    act(() => {
      rfHandlers.onNodeDrag({ clientX: 0, clientY: 0 }, child);
    });
    expect(container.querySelector('.drop-target')).toBeNull();
    expect(
      container.querySelector('[data-id="computer-1"]').getAttribute('data-shaking')
    ).toBe('false');
  });

  it('child past the leave margin DOES trigger drop-target/shake (no new parent → just shake)', () => {
    const { container } = render(<App />);
    const child = {
      id: 'cpu-leaving',
      // center.x = parentW + LEAVE_MARGIN + 50 well past margin.
      position: { x: 500, y: 50 },
      data: { type: 'cpu', config: {} },
      parentNode: 'computer-1',
    };
    act(() => {
      rfHandlers.onNodeDrag({ clientX: 0, clientY: 0 }, child);
    });
    expect(
      container.querySelector('[data-id="computer-1"]').getAttribute('data-shaking')
    ).toBe('true');
  });
});

describe('App visual contract — parent shake only when release will separate', () => {
  // Computer-1 in Lesson 1 sits at (280,140) with size 340×220 — local
  // bounds 0..340 (x) × 0..220 (y). A child's world position is parent.x +
  // child.localX (and y similarly). The shake should ONLY fire when the
  // child's release would actually break the parent/child bond — i.e., the
  // child's center resolves OUTSIDE computer-1's world bounds.

  it('does NOT shake the parent when the child hangs past the edge but release would NOT separate', () => {
    // Child of computer-1 with local position so the child OVERLAPS the
    // right edge but its CENTER is still inside the computer's world
    // bounds. findContainerAt resolves back to computer-1, so wouldSeparate
    // is false → no shake.
    const { container } = render(<App />);
    const child = {
      id: 'cpu-overhang',
      // CPU default size 170×90 (componentTypes nodeStyle fallback).
      // Local position (200, 50) → center local (285, 95). World center
      // (280+285, 140+95) = (565, 235) — inside computer's world bounds
      // (computer.right = 280+340 = 620; computer.bottom = 140+220 = 360).
      position: { x: 200, y: 50 },
      data: { type: 'cpu', config: {} },
      parentNode: 'computer-1',
    };
    act(() => {
      rfHandlers.onNodeDrag({ clientX: 565, clientY: 235 }, child);
    });
    const computer = container.querySelector('[data-id="computer-1"]');
    expect(computer.getAttribute('data-shaking')).toBe('false');
  });

  it('shakes the parent when the child is dragged so release WOULD separate', () => {
    // Local position so child's center is well past the parent's right
    // edge in world coords — release here would land on canvas (no container).
    const { container } = render(<App />);
    const child = {
      id: 'cpu-leaving',
      // Local position (400, 50) → world center (280+485, 140+95) =
      // (765, 235). Past computer's right edge (620) — findContainerAt
      // returns null → wouldSeparate true.
      position: { x: 400, y: 50 },
      data: { type: 'cpu', config: {} },
      parentNode: 'computer-1',
    };
    act(() => {
      rfHandlers.onNodeDrag({ clientX: 765, clientY: 235 }, child);
    });
    const computer = container.querySelector('[data-id="computer-1"]');
    expect(computer.getAttribute('data-shaking')).toBe('true');
  });

  it('clears shake on dragStop', () => {
    const { container } = render(<App />);
    const child = {
      id: 'cpu-leaving',
      position: { x: 400, y: 50 },
      data: { type: 'cpu', config: {} },
      parentNode: 'computer-1',
    };
    act(() => {
      rfHandlers.onNodeDrag({ clientX: 765, clientY: 235 }, child);
    });
    expect(container.querySelector('[data-id="computer-1"]').getAttribute('data-shaking')).toBe('true');
    act(() => {
      rfHandlers.onNodeDragStop({ clientX: 765, clientY: 235 }, child);
    });
    expect(container.querySelector('[data-id="computer-1"]').getAttribute('data-shaking')).toBe('false');
  });
});
