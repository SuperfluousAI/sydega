import { describe, it, expect } from 'vitest';
import { prepopulateComputerHardware } from './graph.js';

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
