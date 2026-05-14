import { describe, it, expect } from 'vitest';
import {
  prepopulateComputerHardware,
  scootSiblings,
  snapChildPosition,
  snapAllParentedChildren,
  snapToGrid,
} from './graph.js';

function node(id, type, configOverrides = {}, extra = {}) {
  return {
    id,
    type: 'system',
    position: { x: 0, y: 0 },
    data: { type, config: { ...configOverrides } },
    ...extra,
  };
}

function computer(id, w = 340, h = 220) {
  return {
    id,
    type: 'system',
    position: { x: 0, y: 0 },
    style: { width: w, height: h },
    data: { type: 'computer', config: {} },
  };
}

describe('prepopulateComputerHardware', () => {
  it('adds CPU, RAM, and Disk as children of the Computer', () => {
    const nodes = [node('pc', 'computer')];
    const out = prepopulateComputerHardware(nodes, 'pc', 1000);
    const children = out.filter((n) => n.parentNode === 'pc');
    const types = children.map((c) => c.data.type).sort();
    expect(types).toEqual(['cpu', 'disk', 'ram']);
  });

  it('uses sensible default hardware values', () => {
    const nodes = [node('pc', 'computer')];
    const out = prepopulateComputerHardware(nodes, 'pc', 2000);
    const cpu = out.find((n) => n.data.type === 'cpu');
    const ram = out.find((n) => n.data.type === 'ram');
    const disk = out.find((n) => n.data.type === 'disk');
    expect(cpu.data.config.cores).toBe(4);
    expect(ram.data.config.gb).toBe(8);
    expect(disk.data.config.gb).toBe(100);
  });

  it('does not duplicate hardware if the Computer already has that type', () => {
    const nodes = [
      node('pc', 'computer'),
      // Computer already has a CPU; only RAM + Disk should be added.
      node('cpu-existing', 'cpu', { cores: 16 }, { parentNode: 'pc' }),
    ];
    const out = prepopulateComputerHardware(nodes, 'pc', 3000);
    const cpus = out.filter((n) => n.data.type === 'cpu');
    expect(cpus).toHaveLength(1);
    expect(cpus[0].id).toBe('cpu-existing');
    expect(out.filter((n) => n.data.type === 'ram')).toHaveLength(1);
    expect(out.filter((n) => n.data.type === 'disk')).toHaveLength(1);
  });

  it('returns the same array reference when nothing was added AND no resize needed', () => {
    // All three present → no new additions. Computer is already big enough to
    // hold them, so no resize either → return input array unchanged.
    const nodes = [
      computer('pc', 600, 220),
      node('c', 'cpu', { cores: 4 }, { parentNode: 'pc' }),
      node('r', 'ram', { gb: 8 }, { parentNode: 'pc' }),
      node('d', 'disk', { gb: 100 }, { parentNode: 'pc' }),
    ];
    const out = prepopulateComputerHardware(nodes, 'pc', 4000);
    expect(out).toBe(nodes);
  });

  it('returns unchanged nodes when the computer id is unknown', () => {
    const nodes = [node('pc', 'computer')];
    const out = prepopulateComputerHardware(nodes, 'missing', 5000);
    expect(out).toBe(nodes);
  });

  describe('children fit inside the (possibly enlarged) Computer bounds', () => {
    // The bug this test catches: prepopulated children spilling past the
    // Computer's right edge, triggering the overshoot frame extension, which
    // then visually covers the Computer's right-side floating-handle.
    //
    // The contract: after prepopulate, every added child's bounding rect is
    // strictly inside the Computer's (final) bounding rect. The Computer
    // grows if needed to maintain this contract.
    const CHILD_W = 170;
    const CHILD_H = 90;

    function assertChildrenFit(out, computerId) {
      const computer = out.find((n) => n.id === computerId);
      const w = computer.style?.width || 340;
      const h = computer.style?.height || 220;
      const children = out.filter((n) => n.parentNode === computerId);
      expect(children.length).toBeGreaterThan(0);
      for (const c of children) {
        const cw = c.style?.width || CHILD_W;
        const ch = c.style?.height || CHILD_H;
        expect(c.position.x).toBeGreaterThanOrEqual(0);
        expect(c.position.y).toBeGreaterThanOrEqual(0);
        expect(c.position.x + cw).toBeLessThanOrEqual(w);
        expect(c.position.y + ch).toBeLessThanOrEqual(h);
      }
    }

    it('fits when starting from the default 340×220 Computer', () => {
      const out = prepopulateComputerHardware([computer('pc', 340, 220)], 'pc', 6000);
      assertChildrenFit(out, 'pc');
    });

    it('fits when starting from a smaller-than-default Computer', () => {
      const out = prepopulateComputerHardware([computer('pc', 200, 150)], 'pc', 7000);
      assertChildrenFit(out, 'pc');
    });

    it('does not shrink an already-large Computer', () => {
      const out = prepopulateComputerHardware([computer('pc', 1000, 500)], 'pc', 8000);
      const c = out.find((n) => n.id === 'pc');
      expect(c.style.width).toBe(1000);
      expect(c.style.height).toBe(500);
    });
  });
});

// ─── scootSiblings cascade ──────────────────────────────────────────────────
// `scootSiblings` must guarantee: after a child moves, NO two same-parent
// siblings overlap each other. That requires cascading pushes (A pushed by
// the moved node may now overlap B, which must also be pushed) plus a
// cleanup pass for any pre-existing overlaps.

// Helper to make a sibling at (x, y) with a fixed 100x100 footprint so the
// geometry math is easy to reason about.
function sib(id, parentId, x, y, w = 100, h = 100) {
  return {
    id,
    type: 'system',
    position: { x, y },
    parentNode: parentId,
    style: { width: w, height: h },
    data: { type: 'cpu', config: {} },
  };
}

function overlapsRect(a, b) {
  return !(
    a.position.x + a.style.width <= b.position.x ||
    a.position.x >= b.position.x + b.style.width ||
    a.position.y + a.style.height <= b.position.y ||
    a.position.y >= b.position.y + b.style.height
  );
}

describe('scootSiblings cascade', () => {
  it('pushes a directly-overlapping sibling away with a gap', () => {
    // Moved sibling A at (0,0); B at (50,0) overlaps along x.
    const nodes = [
      { id: 'pc', type: 'system', position: { x: 0, y: 0 }, style: { width: 1000, height: 1000 }, data: { type: 'computer', config: {} } },
      sib('a', 'pc', 0, 0),
      sib('b', 'pc', 50, 0),
    ];
    const { nodes: out, scootedIds } = scootSiblings(nodes, 'a');
    expect(scootedIds).toContain('b');
    const a = out.find((n) => n.id === 'a');
    const b = out.find((n) => n.id === 'b');
    expect(overlapsRect(a, b)).toBe(false);
    // Gap of 8 enforced.
    expect(b.position.x - (a.position.x + a.style.width)).toBeGreaterThanOrEqual(8);
  });

  it('cascades: A pushes B, B then pushes C', () => {
    // All three on the same row. A is moved (or "the seed"). B touches A;
    // C touches where B would land. Without cascade, B and C would overlap.
    const nodes = [
      { id: 'pc', type: 'system', position: { x: 0, y: 0 }, style: { width: 1000, height: 1000 }, data: { type: 'computer', config: {} } },
      sib('a', 'pc', 0, 0),
      sib('b', 'pc', 50, 0),
      sib('c', 'pc', 160, 0),
    ];
    const { nodes: out, scootedIds } = scootSiblings(nodes, 'a');
    expect(scootedIds).toEqual(expect.arrayContaining(['b', 'c']));
    const a = out.find((n) => n.id === 'a');
    const b = out.find((n) => n.id === 'b');
    const c = out.find((n) => n.id === 'c');
    expect(overlapsRect(a, b)).toBe(false);
    expect(overlapsRect(b, c)).toBe(false);
    expect(overlapsRect(a, c)).toBe(false);
  });

  it('three-deep cascade: A → B → C → D, no remaining overlaps', () => {
    const nodes = [
      { id: 'pc', type: 'system', position: { x: 0, y: 0 }, style: { width: 2000, height: 1000 }, data: { type: 'computer', config: {} } },
      sib('a', 'pc', 0, 0),
      sib('b', 'pc', 50, 0),
      sib('c', 'pc', 160, 0),
      sib('d', 'pc', 270, 0),
    ];
    const { nodes: out } = scootSiblings(nodes, 'a');
    const ids = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const x = out.find((n) => n.id === ids[i]);
        const y = out.find((n) => n.id === ids[j]);
        expect(overlapsRect(x, y)).toBe(false);
      }
    }
  });

  it('does nothing when there are no overlaps', () => {
    const nodes = [
      { id: 'pc', type: 'system', position: { x: 0, y: 0 }, style: { width: 1000, height: 1000 }, data: { type: 'computer', config: {} } },
      sib('a', 'pc', 0, 0),
      sib('b', 'pc', 200, 0),
    ];
    const { scootedIds } = scootSiblings(nodes, 'a');
    expect(scootedIds).toEqual([]);
  });

  it('ignores nodes that belong to a different parent', () => {
    const nodes = [
      { id: 'pc1', type: 'system', position: { x: 0, y: 0 }, style: { width: 500, height: 500 }, data: { type: 'computer', config: {} } },
      { id: 'pc2', type: 'system', position: { x: 600, y: 0 }, style: { width: 500, height: 500 }, data: { type: 'computer', config: {} } },
      sib('a', 'pc1', 0, 0),
      sib('b', 'pc2', 0, 0),  // overlaps 'a' in canvas space, but different parent — local position is 0,0 in pc2
    ];
    // Even though their absolute positions might overlap if you ignore the
    // parent, scoot is parent-scoped — `b` is not a sibling of `a`.
    const { scootedIds } = scootSiblings(nodes, 'a');
    expect(scootedIds).not.toContain('b');
  });

  it('resolves a pre-existing sibling overlap unrelated to the moved node', () => {
    // A is moved. B and C don't overlap A but DO overlap each other.
    const nodes = [
      { id: 'pc', type: 'system', position: { x: 0, y: 0 }, style: { width: 1000, height: 1000 }, data: { type: 'computer', config: {} } },
      sib('a', 'pc', 0, 0),
      sib('b', 'pc', 500, 0),
      sib('c', 'pc', 530, 0),  // overlaps b
    ];
    const { nodes: out, scootedIds } = scootSiblings(nodes, 'a');
    // The cleanup pass should resolve B-vs-C even though A wasn't involved.
    expect(scootedIds).toContain('c');
    const b = out.find((n) => n.id === 'b');
    const c = out.find((n) => n.id === 'c');
    expect(overlapsRect(b, c)).toBe(false);
  });

  it('never moves the originally-moved node itself', () => {
    const nodes = [
      { id: 'pc', type: 'system', position: { x: 0, y: 0 }, style: { width: 1000, height: 1000 }, data: { type: 'computer', config: {} } },
      sib('a', 'pc', 100, 100),
      sib('b', 'pc', 150, 100),
    ];
    const { nodes: out, scootedIds } = scootSiblings(nodes, 'a');
    const a = out.find((n) => n.id === 'a');
    expect(a.position).toEqual({ x: 100, y: 100 });
    expect(scootedIds).not.toContain('a');
  });

  it('terminates and returns deterministic state even with many tightly packed children', () => {
    // 8 siblings stacked along x with 30-unit offsets — each overlaps the
    // next. Moving the first should propagate scoots all the way down.
    const children = Array.from({ length: 8 }, (_, i) => sib(`c${i}`, 'pc', i * 30, 0));
    const nodes = [
      { id: 'pc', type: 'system', position: { x: 0, y: 0 }, style: { width: 5000, height: 1000 }, data: { type: 'computer', config: {} } },
      ...children,
    ];
    const { nodes: out } = scootSiblings(nodes, 'c0');
    // Verify pairwise non-overlap.
    const final = children.map((c) => out.find((n) => n.id === c.id));
    for (let i = 0; i < final.length; i++) {
      for (let j = i + 1; j < final.length; j++) {
        expect(overlapsRect(final[i], final[j])).toBe(false);
      }
    }
  });
});

describe('auto-stack snap helpers', () => {
  it('snapToGrid rounds to nearest multiple', () => {
    expect(snapToGrid(0)).toBe(0);
    expect(snapToGrid(7)).toBe(0);     // < 10 → 0
    expect(snapToGrid(10)).toBe(20);   // ties go up (Math.round)
    expect(snapToGrid(19)).toBe(20);
    expect(snapToGrid(31)).toBe(40);
    expect(snapToGrid(-7)).toBe(-0);   // negative
  });

  it('snapChildPosition snaps both x and y', () => {
    expect(snapChildPosition({ x: 23, y: 47 })).toEqual({ x: 20, y: 40 });
    expect(snapChildPosition({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(snapChildPosition({ x: 100, y: 60 })).toEqual({ x: 100, y: 60 });
  });

  it('snapChildPosition tolerates missing fields', () => {
    expect(snapChildPosition({})).toEqual({ x: 0, y: 0 });
    expect(snapChildPosition(null)).toEqual({ x: 0, y: 0 });
  });

  it('snapAllParentedChildren snaps every child but leaves top-level nodes alone', () => {
    const nodes = [
      { id: 'pc', type: 'system', position: { x: 41, y: 73 }, data: { type: 'computer', config: {} } },
      { id: 'a', type: 'system', position: { x: 23, y: 47 }, parentNode: 'pc', data: { type: 'cpu', config: {} } },
      { id: 'b', type: 'system', position: { x: 11, y: 38 }, parentNode: 'pc', data: { type: 'ram', config: {} } },
    ];
    const out = snapAllParentedChildren(nodes);
    expect(out[0].position).toEqual({ x: 41, y: 73 }); // pc untouched
    expect(out[1].position).toEqual({ x: 20, y: 40 });
    expect(out[2].position).toEqual({ x: 20, y: 40 });
  });

  it('snapAllParentedChildren returns the same array reference when nothing changes', () => {
    const nodes = [
      { id: 'a', type: 'system', position: { x: 20, y: 40 }, parentNode: 'pc', data: { type: 'cpu', config: {} } },
    ];
    expect(snapAllParentedChildren(nodes)).toBe(nodes);
  });
});
