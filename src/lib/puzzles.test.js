import { describe, it, expect } from 'vitest';
import { puzzles, puzzleOrder, defaultPuzzleId, evaluatePuzzle, evaluatePredicate } from './puzzles.js';
import {
  componentTypes,
  defaultsFor,
  metaFor,
  paletteMetaFor,
  parsePaletteEntry,
} from './componentTypes.js';
import { componentInfo, infoFor } from './componentInfo.js';
import { simulate } from './simulator.js';

function node(id, type, configOverrides = {}, extra = {}) {
  // For role-aware types (service), defaultsFor needs the role to resolve
  // per-role defaults. If the caller put role in configOverrides, pass it
  // through so the defaults are correct.
  const role = configOverrides?.role;
  return {
    id,
    type: 'system',
    position: { x: 0, y: 0 },
    data: { type, config: { ...defaultsFor(type, role), ...configOverrides } },
    ...extra,
  };
}
function edge(from, to, kind) {
  return {
    id: `${from}->${to}`,
    source: from,
    target: to,
    ...(kind ? { data: { kind } } : {}),
  };
}

describe('puzzle contracts', () => {
  it('defaultPuzzleId points to a real puzzle', () => {
    expect(puzzles[defaultPuzzleId]).toBeDefined();
  });

  it('puzzleOrder lists only real puzzle ids', () => {
    for (const id of puzzleOrder) expect(puzzles[id]).toBeDefined();
  });

  it.each(puzzleOrder)('puzzle %s has all required fields', (id) => {
    const p = puzzles[id];
    expect(p.kind).toMatch(/^(composition|connectivity|flow)$/);
    expect(typeof p.title).toBe('string');
    expect(typeof p.blurb).toBe('string');
    expect(typeof p.order).toBe('number');
    expect(Array.isArray(p.allowedComponents)).toBe(true);
    expect(typeof p.initialNodes).toBe('function');
    expect(Array.isArray(p.requirements)).toBe(true);
    expect(p.requirements.length).toBeGreaterThan(0);
  });

  it.each(puzzleOrder)('puzzle %s allowedComponents references real types', (id) => {
    // Entries are either a typeKey string or an object { type, role } for
    // role-aware types like service. Both must resolve to a real component.
    for (const c of puzzles[id].allowedComponents) {
      const typeKey = typeof c === 'string' ? c : c.type;
      const role = typeof c === 'object' ? c.role : undefined;
      expect(componentTypes[typeKey]).toBeDefined();
      if (role) {
        expect(componentTypes[typeKey].roles?.[role]).toBeDefined();
      }
    }
  });

  it.each(puzzleOrder)('puzzle %s initialNodes returns valid nodes', (id) => {
    const nodes = puzzles[id].initialNodes();
    expect(Array.isArray(nodes)).toBe(true);
    for (const n of nodes) {
      expect(n.id).toBeDefined();
      expect(n.data).toBeDefined();
      expect(componentTypes[n.data.type]).toBeDefined();
    }
  });
});

describe('component type contracts', () => {
  it.each(Object.entries(componentTypes))('%s has the required fields', (key, meta) => {
    expect(['source', 'passthrough', 'cache', 'queue', 'sink', 'decorative']).toContain(meta.role);
    expect(Array.isArray(meta.props)).toBe(true);
    expect(typeof meta.hasInput).toBe('boolean');
    expect(typeof meta.hasOutput).toBe('boolean');
    // Role-aware types (e.g. service) don't carry a top-level label/color/
    // defaults — those live per role under `meta.roles`. Plain types do.
    if (meta.roles) {
      expect(typeof meta.roles).toBe('object');
      for (const [roleKey, roleEntry] of Object.entries(meta.roles)) {
        expect(typeof roleEntry.label).toBe('string');
        expect(typeof roleEntry.color).toBe('string');
        expect(roleEntry.defaults).toBeDefined();
      }
    } else {
      expect(typeof meta.label).toBe('string');
      expect(typeof meta.color).toBe('string');
      expect(meta.defaults).toBeDefined();
    }
  });

  it('defaultsFor materializes function-valued defaults per call', () => {
    // webServer.defaults.port is a function (random ephemeral port) — each
    // call should produce an integer in the dynamic-port range, and over
    // multiple calls should very likely produce at least one different value.
    const samples = Array.from({ length: 20 }, () => defaultsFor('webServer').port);
    for (const p of samples) {
      expect(Number.isInteger(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(49152);
      expect(p).toBeLessThanOrEqual(65535);
    }
    expect(new Set(samples).size).toBeGreaterThan(1);
  });

  it('router has a fixed port default of 80', () => {
    expect(defaultsFor('router').port).toBe(80);
  });
});

describe('puzzle.solution() returns a passing graph', () => {
  // Every puzzle's solution() must produce a graph that, when simulated and
  // evaluated, passes. Catches the bug class "solution drifted from puzzle
  // requirements" — e.g. someone tightens success rate thresholds without
  // updating the canonical solution.
  it.each(puzzleOrder)('%s: solution passes evaluation', (pid) => {
    const p = puzzles[pid];
    expect(typeof p.solution).toBe('function');
    const { nodes, edges } = p.solution();
    expect(Array.isArray(nodes)).toBe(true);
    expect(Array.isArray(edges)).toBe(true);
    const result = simulate(p, nodes, edges);
    expect(result.ok).toBe(true);
    const ev = evaluatePuzzle(p, result);
    expect(ev.passed).toBe(true);
  });
});

describe('componentInfo coverage — bottom info pane', () => {
  // The pedagogical pane (ComponentInfo) reads description / usage / connects
  // for the selected node. Every component the player can drop has to have
  // populated text — otherwise they see blanks. For role-aware types like
  // service, every role needs its own info entry keyed `type:role`.
  function infoKeys() {
    const out = [];
    for (const [typeKey, meta] of Object.entries(componentTypes)) {
      if (meta.roles) {
        for (const role of Object.keys(meta.roles)) out.push(`${typeKey}:${role}`);
      } else {
        out.push(typeKey);
      }
    }
    return out;
  }

  it.each(infoKeys())('%s has info.description and info.usage and info.connects', (typeKey) => {
    const info = componentInfo[typeKey];
    expect(info).toBeDefined();
    expect(typeof info.description).toBe('string');
    expect(info.description.length).toBeGreaterThan(0);
    expect(typeof info.usage).toBe('string');
    expect(info.usage.length).toBeGreaterThan(0);
    expect(typeof info.connects).toBe('string');
    expect(info.connects.length).toBeGreaterThan(0);
  });

  it('componentInfo does not list types that aren\'t in componentTypes', () => {
    // Reverse direction: every info key has to correspond to a real type
    // (and role, if compound). A typo'd key here would silently render
    // nothing in the pane.
    for (const k of Object.keys(componentInfo)) {
      if (k.includes(':')) {
        const [typeKey, role] = k.split(':');
        expect(componentTypes[typeKey]).toBeDefined();
        expect(componentTypes[typeKey].roles?.[role]).toBeDefined();
      } else {
        expect(componentTypes[k]).toBeDefined();
      }
    }
  });
});

describe('evaluatePuzzle', () => {
  const dummyPuzzle = {
    requirements: [
      { key: 'a', label: 'A', test: (r) => r.flag === true },
      { key: 'b', label: 'B', test: (r) => r.value > 5 },
    ],
  };

  it('passes when all requirements match', () => {
    const ev = evaluatePuzzle(dummyPuzzle, { ok: true, flag: true, value: 10 });
    expect(ev.passed).toBe(true);
  });

  it('fails when any requirement fails', () => {
    const ev = evaluatePuzzle(dummyPuzzle, { ok: true, flag: true, value: 1 });
    expect(ev.passed).toBe(false);
    expect(ev.results.filter((r) => !r.passed)).toHaveLength(1);
  });

  it('returns passed=false when sim errored', () => {
    const ev = evaluatePuzzle(dummyPuzzle, { ok: false, error: 'oops' });
    expect(ev.passed).toBe(false);
  });

  it('forwards req.lesson onto the result row', () => {
    const p = {
      requirements: [
        { key: 'a', label: 'A', lesson: 'why A matters', test: (r) => r.flag === true },
      ],
    };
    const ev = evaluatePuzzle(p, { ok: true, flag: false });
    expect(ev.results[0].passed).toBe(false);
    expect(ev.results[0].lesson).toBe('why A matters');
  });

  it('accepts declarative predicate: in place of test:', () => {
    const p = {
      requirements: [
        {
          key: 'hasLB',
          label: 'LB present',
          predicate: { kind: 'presence', type: 'loadBalancer', min: 1 },
        },
      ],
    };
    const withLB = { ok: true, nodesByType: { loadBalancer: 1, vps: 3 } };
    const noLB = { ok: true, nodesByType: { vps: 3 } };
    expect(evaluatePuzzle(p, withLB).passed).toBe(true);
    expect(evaluatePuzzle(p, noLB).passed).toBe(false);
  });
});

describe('evaluatePredicate (framework primitive)', () => {
  it('metric op >= passes when value meets threshold', () => {
    expect(
      evaluatePredicate(
        { kind: 'metric', name: 'successRate', op: '>=', value: 0.99 },
        { successRate: 0.995 }
      )
    ).toBe(true);
  });

  it('metric op >= fails when value is below threshold', () => {
    expect(
      evaluatePredicate(
        { kind: 'metric', name: 'successRate', op: '>=', value: 0.99 },
        { successRate: 0.5 }
      )
    ).toBe(false);
  });

  it('presence checks min count', () => {
    const p = { kind: 'presence', type: 'loadBalancer', min: 1 };
    expect(evaluatePredicate(p, { nodesByType: { loadBalancer: 1 } })).toBe(true);
    expect(evaluatePredicate(p, { nodesByType: { vps: 3 } })).toBe(false);
    expect(evaluatePredicate(p, { nodesByType: {} })).toBe(false);
    expect(evaluatePredicate(p, {})).toBe(false);
  });

  it('presence checks max count', () => {
    const p = { kind: 'presence', type: 'vps', max: 2 };
    expect(evaluatePredicate(p, { nodesByType: { vps: 1 } })).toBe(true);
    expect(evaluatePredicate(p, { nodesByType: { vps: 5 } })).toBe(false);
  });

  it('simFlag reads boolean fields off the sim result', () => {
    const p = { kind: 'simFlag', name: 'allHosted' };
    expect(evaluatePredicate(p, { allHosted: true })).toBe(true);
    expect(evaluatePredicate(p, { allHosted: false })).toBe(false);
  });

  it('throws on an unknown predicate kind', () => {
    expect(() => evaluatePredicate({ kind: 'mystery' }, {})).toThrow(/Unknown predicate kind/);
  });
});

describe('flow sim p99 latency — multiplier model (caveats.md #3)', () => {
  // Each component has an optional p99Latency field (default = 3× mean).
  // The sim accumulates p99 along the worst incoming path the same way it
  // accumulates mean. This is a deliberate steady-state approximation —
  // not real distribution math. The contract: avgP99Latency >= avgLatency
  // for any served traffic.

  it('avgP99Latency >= avgLatency for a served chain', () => {
    const p = puzzles.addLoadBalancer;
    const nodes = [
      node('c', 'client', { rps: 1000, readRatio: 1 }),
      node('lb', 'loadBalancer'),
      node('v1', 'vps'),
    ];
    const r = simulate(p, nodes, [edge('c', 'lb'), edge('lb', 'v1')]);
    expect(r.avgP99Latency).toBeGreaterThanOrEqual(r.avgLatency);
  });

  it('p99 propagates as the sum along the served path', () => {
    // Single sink, single path: p99 = LB.p99 + VPS.p99 = 3 + 75 = 78ms.
    // Mean = LB.latency + VPS.latency = 1 + 25 = 26ms.
    const p = puzzles.addLoadBalancer;
    const nodes = [
      node('c', 'client', { rps: 100, readRatio: 1 }),
      node('lb', 'loadBalancer'),
      node('v1', 'vps'),
    ];
    const r = simulate(p, nodes, [edge('c', 'lb'), edge('lb', 'v1')]);
    expect(r.avgLatency).toBeCloseTo(26, 5);
    expect(r.avgP99Latency).toBeCloseTo(78, 5);
  });

  it('respects explicit p99Latency override on a node', () => {
    // Set VPS p99 to 200 explicitly; expect p99 chain = 3 (LB) + 200 = 203.
    const p = puzzles.addLoadBalancer;
    const nodes = [
      node('c', 'client', { rps: 100, readRatio: 1 }),
      node('lb', 'loadBalancer'),
      node('v1', 'vps', { p99Latency: 200 }),
    ];
    const r = simulate(p, nodes, [edge('c', 'lb'), edge('lb', 'v1')]);
    expect(r.avgP99Latency).toBeCloseTo(203, 5);
  });

  it('falls back to 3× mean when p99Latency is missing from config', () => {
    // Build nodes that lack p99Latency entirely (defaultsFor would have set
    // it, so override via manual config to simulate legacy data).
    const p = puzzles.addLoadBalancer;
    const c = node('c', 'client', { rps: 100, readRatio: 1 });
    const lb = node('lb', 'loadBalancer');
    delete lb.data.config.p99Latency;
    const v1 = node('v1', 'vps');
    delete v1.data.config.p99Latency;
    const r = simulate(p, [c, lb, v1], [edge('c', 'lb'), edge('lb', 'v1')]);
    // LB mean=1, VPS mean=25 → p99 fallback = 3*1 + 3*25 = 78
    expect(r.avgP99Latency).toBeCloseTo(78, 5);
  });

  it('cache hits accumulate p99 only up to the cache (not downstream)', () => {
    // 95% hit rate: 95% of requests terminate at the cache with chain p99 =
    // LB(3) + Cache(6) = 9. 5% miss → continue to AppServer(60) + DB(90) =
    // chain p99 = 3 + 6 + 60 + 90 = 159. Weighted: 0.95*9 + 0.05*159 = 16.5
    const p = puzzles.urlShortener;
    const nodes = [
      node('c', 'client', { rps: 100, readRatio: 1 }),
      node('lb', 'loadBalancer'),
      node('cache', 'cache', { role: 'internal', hitRate: 0.95 }),
      node('app', 'service', { role: 'appServer' }),
      node('db', 'database'),
    ];
    const r = simulate(p, nodes, [
      edge('c', 'lb'),
      edge('lb', 'cache'),
      edge('cache', 'app'),
      edge('app', 'db'),
    ]);
    // Allow some tolerance for floating point.
    expect(r.avgP99Latency).toBeCloseTo(16.5, 0);
  });

  it('avgP99Latency is 0 when nothing was served', () => {
    const p = puzzles.addLoadBalancer;
    const r = simulate(p, [node('c', 'client', { rps: 100 })], []);
    expect(r.avgP99Latency).toBe(0);
  });
});

describe('role-aware component helpers (service type unification — caveats.md #8)', () => {
  // The service type is one component with per-role display/defaults. These
  // tests pin down the helpers that resolve role → label/color/defaults/info.

  describe('defaultsFor with role', () => {
    it('returns role-specific defaults for service:appServer', () => {
      const d = defaultsFor('service', 'appServer');
      expect(d.capacity).toBe(500);
      expect(d.latency).toBe(20);
      expect(d.p99Latency).toBe(60);
      expect(d.role).toBe('appServer');
    });

    it('returns role-specific defaults for service:worker', () => {
      const d = defaultsFor('service', 'worker');
      expect(d.capacity).toBe(50);
      expect(d.latency).toBe(100);
      expect(d.p99Latency).toBe(300);
      expect(d.role).toBe('worker');
    });

    it('returns no role when called without role on a role-aware type', () => {
      const d = defaultsFor('service');
      expect(d.role).toBeUndefined();
    });

    it('plain types still work unchanged', () => {
      const d = defaultsFor('client');
      expect(d.rps).toBe(100);
      expect(d.role).toBeUndefined();
    });
  });

  describe('metaFor on a node', () => {
    it('merges base + role overrides for a service node', () => {
      const n = { data: { type: 'service', config: { role: 'appServer' } } };
      const meta = metaFor(n);
      expect(meta.label).toBe('App Server');
      expect(meta.color).toBe('#10b981');
      expect(meta.role).toBe('appServer');
      expect(meta.hasInput).toBe(true);
      expect(meta.hasOutput).toBe(true);
    });

    it('honors a different role on the same type', () => {
      const n = { data: { type: 'service', config: { role: 'worker' } } };
      const meta = metaFor(n);
      expect(meta.label).toBe('Worker');
      expect(meta.role).toBe('worker');
    });

    it('falls back to base meta for plain types', () => {
      const n = { data: { type: 'client', config: {} } };
      expect(metaFor(n).label).toBe('Client');
    });

    it('returns null for unknown types', () => {
      expect(metaFor({ data: { type: 'nope', config: {} } })).toBeNull();
    });
  });

  describe('paletteMetaFor and parsePaletteEntry', () => {
    it('parses a string entry as { type, role: undefined }', () => {
      expect(parsePaletteEntry('client')).toEqual({ type: 'client', role: undefined });
    });

    it('parses an object entry as { type, role }', () => {
      expect(parsePaletteEntry({ type: 'service', role: 'appServer' })).toEqual({
        type: 'service',
        role: 'appServer',
      });
    });

    it('paletteMetaFor resolves an object entry to merged role meta', () => {
      const meta = paletteMetaFor({ type: 'service', role: 'worker' });
      expect(meta.label).toBe('Worker');
      expect(meta.color).toBe('#fbbf24');
    });

    it('paletteMetaFor resolves a string entry to base meta', () => {
      const meta = paletteMetaFor('client');
      expect(meta.label).toBe('Client');
    });
  });

  describe('infoFor a node', () => {
    it('finds role-specific info for service:appServer', () => {
      const info = infoFor({ data: { type: 'service', config: { role: 'appServer' } } });
      expect(info).toBe(componentInfo['service:appServer']);
      expect(info.description).toMatch(/application logic/i);
    });

    it('finds role-specific info for service:worker', () => {
      const info = infoFor({ data: { type: 'service', config: { role: 'worker' } } });
      expect(info).toBe(componentInfo['service:worker']);
      expect(info.description).toMatch(/background/i);
    });

    it('finds info for plain types', () => {
      const info = infoFor({ data: { type: 'database', config: {} } });
      expect(info).toBe(componentInfo.database);
    });

    it('finds role-specific info for cache:internal', () => {
      const info = infoFor({ data: { type: 'cache', config: { role: 'internal' } } });
      expect(info).toBe(componentInfo['cache:internal']);
    });

    it('finds role-specific info for cache:cdn', () => {
      const info = infoFor({ data: { type: 'cache', config: { role: 'cdn' } } });
      expect(info).toBe(componentInfo['cache:cdn']);
      expect(info.description).toMatch(/edge/i);
    });

    it('returns null for unknown types', () => {
      expect(infoFor({ data: { type: 'nope', config: {} } })).toBeNull();
    });
  });
});

describe('queue component type (Step 2 — async boundary scaffolding)', () => {
  // Step 2 just registers the type; Step 3 will wire async-path sim logic.
  it('queue is registered with role=queue', () => {
    expect(componentTypes.queue).toBeDefined();
    expect(componentTypes.queue.role).toBe('queue');
  });

  it('queue has both input and output handles', () => {
    expect(componentTypes.queue.hasInput).toBe(true);
    expect(componentTypes.queue.hasOutput).toBe(true);
  });

  it('queue defaults seed topic + Kafka-teaching-aid props', () => {
    const d = defaultsFor('queue');
    expect(d.topic).toBe('events');
    expect(d.replicationFactor).toBe(3);
    expect(d.acks).toBe('all');
  });

  it('queue has a componentInfo entry', () => {
    expect(componentInfo.queue).toBeDefined();
    expect(componentInfo.queue.description).toMatch(/buffer/i);
  });
});

describe('simulator emits nodesByType (framework primitive)', () => {
  it('counts nodes by data.type in flow sim results', () => {
    const p = puzzles.addLoadBalancer;
    const nodes = [
      node('c', 'client'),
      node('lb', 'loadBalancer'),
      node('v1', 'vps'),
      node('v2', 'vps'),
    ];
    const r = simulate(p, nodes, [edge('c', 'lb'), edge('lb', 'v1'), edge('lb', 'v2')]);
    expect(r.nodesByType).toEqual({ client: 1, loadBalancer: 1, vps: 2 });
  });

  it('populates nodesByType on composition results too', () => {
    const p = puzzles.buildComputer;
    const nodes = [node('pc', 'computer'), node('p', 'program')];
    const r = simulate(p, nodes, []);
    expect(r.nodesByType).toEqual({ computer: 1, program: 1 });
  });
});

// ─── Canonical solutions for each shipped puzzle ────────────────────────────
// These guard against regressions where a real solution stops passing — and
// against false positives where the empty/wrong configuration accidentally
// passes.

describe('canonical solutions', () => {
  it('Build a Computer: empty Computer + outside Program fails', () => {
    const p = puzzles.buildComputer;
    const r = simulate(p, p.initialNodes(), []);
    expect(evaluatePuzzle(p, r).passed).toBe(false);
  });

  it('Build a Computer: hardware + program inside the Computer passes', () => {
    const p = puzzles.buildComputer;
    const nodes = [
      node('pc', 'computer'),
      node('cpu', 'cpu', { cores: 4 }, { parentNode: 'pc' }),
      node('ram', 'ram', { gb: 8 }, { parentNode: 'pc' }),
      node('disk', 'disk', { gb: 100 }, { parentNode: 'pc' }),
      node(
        'prog',
        'program',
        { requires_cores: 4, requires_ram_gb: 8, requires_disk_gb: 50 },
        { parentNode: 'pc' }
      ),
    ];
    const r = simulate(p, nodes, []);
    expect(evaluatePuzzle(p, r).passed).toBe(true);
  });

  it('On the Home Network: Router + Computer (wired) + Phone (wired) + Web Server hosted passes', () => {
    // Canonical solution under the new wired-LAN model. The Computer is a
    // container holding hardware + the web server (Lesson 1 mechanics intact)
    // and is wired to the Router via an edge (new). The Phone is wired to the
    // Router directly. No parentNode relationship between devices and Router.
    const p = puzzles.homeNetwork;
    const nodes = [
      node('router-1', 'router', { cidr: '192.168.1.0/24' }),
      node('phone-1', 'phone'),
      node('computer-1', 'computer'),
      node('cpu-1', 'cpu', { cores: 4 }, { parentNode: 'computer-1' }),
      node('ram-1', 'ram', { gb: 8 }, { parentNode: 'computer-1' }),
      node('disk-1', 'disk', { gb: 50 }, { parentNode: 'computer-1' }),
      node('webserver-1', 'webServer', {
        requires_cores: 2, requires_ram_gb: 4, requires_disk_gb: 20,
      }, { parentNode: 'computer-1' }),
    ];
    const edges = [edge('computer-1', 'router-1'), edge('phone-1', 'router-1')];
    const r = simulate(p, nodes, edges);
    expect(evaluatePuzzle(p, r).passed).toBe(true);
  });

  it('On the Home Network: missing Router fails on hasRouter', () => {
    const p = puzzles.homeNetwork;
    const nodes = [
      node('phone-1', 'phone'),
      node('computer-1', 'computer'),
      node('cpu-1', 'cpu', { cores: 4 }, { parentNode: 'computer-1' }),
      node('ram-1', 'ram', { gb: 8 }, { parentNode: 'computer-1' }),
      node('disk-1', 'disk', { gb: 50 }, { parentNode: 'computer-1' }),
      node('webserver-1', 'webServer', {
        requires_cores: 2, requires_ram_gb: 4, requires_disk_gb: 20,
      }, { parentNode: 'computer-1' }),
    ];
    const r = simulate(p, nodes, []);
    const ev = evaluatePuzzle(p, r);
    expect(ev.passed).toBe(false);
    expect(ev.results.find((x) => x.key === 'hasRouter').passed).toBe(false);
  });

  it('On the Home Network: Computer not wired to Router fails', () => {
    // Router exists, Phone is wired, but Computer is floating with no edge to
    // the router → it's not on the LAN, so the Web Server can't be reached.
    const p = puzzles.homeNetwork;
    const nodes = [
      node('router-1', 'router'),
      node('phone-1', 'phone'),
      node('computer-1', 'computer'),
      node('cpu-1', 'cpu', { cores: 4 }, { parentNode: 'computer-1' }),
      node('ram-1', 'ram', { gb: 8 }, { parentNode: 'computer-1' }),
      node('disk-1', 'disk', { gb: 50 }, { parentNode: 'computer-1' }),
      node('webserver-1', 'webServer', {
        requires_cores: 2, requires_ram_gb: 4, requires_disk_gb: 20,
      }, { parentNode: 'computer-1' }),
    ];
    const edges = [edge('phone-1', 'router-1')];
    const r = simulate(p, nodes, edges);
    const ev = evaluatePuzzle(p, r);
    expect(ev.passed).toBe(false);
    expect(ev.results.find((x) => x.key === 'computerOnLan').passed).toBe(false);
  });

  it('On the Home Network: edge direction does not matter (router → phone counts)', () => {
    const p = puzzles.homeNetwork;
    const nodes = [
      node('router-1', 'router'),
      node('phone-1', 'phone'),
      node('computer-1', 'computer'),
      node('cpu-1', 'cpu', { cores: 4 }, { parentNode: 'computer-1' }),
      node('ram-1', 'ram', { gb: 8 }, { parentNode: 'computer-1' }),
      node('disk-1', 'disk', { gb: 50 }, { parentNode: 'computer-1' }),
      node('webserver-1', 'webServer', {
        requires_cores: 2, requires_ram_gb: 4, requires_disk_gb: 20,
      }, { parentNode: 'computer-1' }),
    ];
    // Reverse-direction edges: router → device. Membership should still hold.
    const edges = [edge('router-1', 'computer-1'), edge('router-1', 'phone-1')];
    const r = simulate(p, nodes, edges);
    expect(evaluatePuzzle(p, r).passed).toBe(true);
  });

  it('On the Home Network: sim result exposes router CIDR and connected device IPs', () => {
    const p = puzzles.homeNetwork;
    const nodes = [
      node('router-1', 'router', { cidr: '192.168.1.0/24' }),
      node('phone-1', 'phone'),
      node('computer-1', 'computer'),
    ];
    const edges = [edge('phone-1', 'router-1'), edge('computer-1', 'router-1')];
    const r = simulate(p, nodes, edges);
    expect(r.perNode['router-1'].kind).toBe('router');
    expect(r.perNode['router-1'].cidr).toBe('192.168.1.0/24');
    expect(r.perNode['router-1'].ip).toBe('192.168.1.1');
    const devIds = r.perNode['router-1'].devices.map((d) => d.id).sort();
    expect(devIds).toEqual(['computer-1', 'phone-1']);
    // Both devices must have IPs in the LAN range, and they must not collide.
    const ips = r.perNode['router-1'].devices.map((d) => d.ip);
    expect(new Set(ips).size).toBe(2);
    for (const ip of ips) expect(ip).toMatch(/^192\.168\.1\.\d+$/);
  });

  it('Reach the Internet: Router not wired to ISP fails', () => {
    // ISP exists on the canvas but no edge between Router and ISP.
    const p = puzzles.reachTheInternet;
    const nodes = [
      node('router-1', 'router'),
      node('computer-1', 'computer'),
      node('isp-1', 'isp'),
    ];
    const edges = [edge('computer-1', 'router-1')]; // no router→isp edge
    const r = simulate(p, nodes, edges);
    const ev = evaluatePuzzle(p, r);
    expect(ev.passed).toBe(false);
    expect(ev.results.find((rq) => rq.key === 'hasIsp').passed).toBe(true); // ISP exists
    expect(ev.results.find((rq) => rq.key === 'routerWiredToIsp').passed).toBe(false);
  });

  it('Reach the Internet: no ISP at all fails on hasIsp', () => {
    const p = puzzles.reachTheInternet;
    const nodes = [
      node('router-1', 'router'),
      node('computer-1', 'computer'),
    ];
    const edges = [edge('computer-1', 'router-1')];
    const r = simulate(p, nodes, edges);
    const ev = evaluatePuzzle(p, r);
    expect(ev.passed).toBe(false);
    expect(ev.results.find((rq) => rq.key === 'hasIsp').passed).toBe(false);
  });

  it('Reach the Internet: ISP node does NOT get a LAN IP (it lives outside the subnet)', () => {
    // Lesson 2's homeNetwork sim assigns LAN IPs to devices wired to a Router.
    // ISP is excepted: it represents the upstream side, not a device on the LAN.
    const p = puzzles.reachTheInternet;
    const nodes = [
      node('router-1', 'router', { cidr: '192.168.1.0/24' }),
      node('isp-1', 'isp'),
    ];
    const edges = [edge('router-1', 'isp-1')];
    const r = simulate(p, nodes, edges);
    const devices = r.perNode['router-1'].devices;
    expect(devices.find((d) => d.type === 'isp')).toBeUndefined();
  });

  it('Point a Domain at a VPS: matching chain passes', () => {
    const p = puzzles.pointDomain;
    const nodes = [
      node('v', 'visitor', { targetDomain: 'myapp.com' }),
      node('d', 'domain', { name: 'myapp.com' }),
      node('dns', 'dnsRecord', { recordType: 'A', value: '203.0.113.10' }),
      node('vps', 'vps', { ip: '203.0.113.10' }),
    ];
    const r = simulate(p, nodes, [edge('v', 'd'), edge('d', 'dns'), edge('dns', 'vps')]);
    expect(evaluatePuzzle(p, r).passed).toBe(true);
  });

  it('Point a Domain at a VPS: mismatched IP fails', () => {
    const p = puzzles.pointDomain;
    const nodes = [
      node('v', 'visitor', { targetDomain: 'myapp.com' }),
      node('d', 'domain', { name: 'myapp.com' }),
      node('dns', 'dnsRecord', { recordType: 'A', value: '9.9.9.9' }),
      node('vps', 'vps', { ip: '203.0.113.10' }),
    ];
    const r = simulate(p, nodes, [edge('v', 'd'), edge('d', 'dns'), edge('dns', 'vps')]);
    expect(evaluatePuzzle(p, r).passed).toBe(false);
  });

  it('Add a Load Balancer: single VPS at default capacity fails (overload)', () => {
    const p = puzzles.addLoadBalancer;
    const nodes = [
      node('c', 'client', { rps: 3000, readRatio: 1 }),
      node('vps', 'vps'),
    ];
    const r = simulate(p, nodes, [edge('c', 'vps')]);
    expect(evaluatePuzzle(p, r).passed).toBe(false);
  });

  it('Add a Load Balancer: LB + 3 VPSes passes', () => {
    const p = puzzles.addLoadBalancer;
    const nodes = [
      node('c', 'client', { rps: 3000, readRatio: 1 }),
      node('lb', 'loadBalancer'),
      node('v1', 'vps'),
      node('v2', 'vps'),
      node('v3', 'vps'),
    ];
    const r = simulate(p, nodes, [
      edge('c', 'lb'),
      edge('lb', 'v1'),
      edge('lb', 'v2'),
      edge('lb', 'v3'),
    ]);
    expect(evaluatePuzzle(p, r).passed).toBe(true);
  });

  it('Add a Load Balancer: Client wired directly to 3 VPSes FAILS on hasLB', () => {
    // The regression test for the framework conversation. Before this rule,
    // a Client fanned out to 3 VPSes met the throughput requirements and the
    // puzzle passed, defeating the lesson. The new `presence` predicate
    // requires at least one LB in the graph.
    const p = puzzles.addLoadBalancer;
    const nodes = [
      node('c', 'client', { rps: 3000, readRatio: 1 }),
      node('v1', 'vps'),
      node('v2', 'vps'),
      node('v3', 'vps'),
    ];
    const r = simulate(p, nodes, [edge('c', 'v1'), edge('c', 'v2'), edge('c', 'v3')]);
    const ev = evaluatePuzzle(p, r);
    expect(ev.passed).toBe(false);
    const hasLB = ev.results.find((x) => x.key === 'hasLB');
    expect(hasLB.passed).toBe(false);
    expect(hasLB.lesson).toMatch(/Load Balancer/);
  });

  it('URL Shortener: Client → LB → App → DB fails (bottleneck at App)', () => {
    const p = puzzles.urlShortener;
    const nodes = [
      node('c', 'client', { rps: 5000, readRatio: 0.95 }),
      node('lb', 'loadBalancer'),
      node('app', 'service', { role: 'appServer' }),
      node('db', 'database'),
    ];
    const r = simulate(p, nodes, [edge('c', 'lb'), edge('lb', 'app'), edge('app', 'db')]);
    expect(evaluatePuzzle(p, r).passed).toBe(false);
  });

  it('URL Shortener: Client → LB → Cache (95% hit) → App → DB passes', () => {
    const p = puzzles.urlShortener;
    const nodes = [
      node('c', 'client', { rps: 5000, readRatio: 0.95 }),
      node('lb', 'loadBalancer'),
      node('cache', 'cache', { role: 'internal', hitRate: 0.95 }),
      node('app', 'service', { role: 'appServer' }),
      node('db', 'database'),
    ];
    const r = simulate(p, nodes, [
      edge('c', 'lb'),
      edge('lb', 'cache'),
      edge('cache', 'app'),
      edge('app', 'db'),
    ]);
    expect(evaluatePuzzle(p, r).passed).toBe(true);
  });

  it('Replicate Your Reads: writes to Primary + reads through an LB to Replicas passes', () => {
    const p = puzzles.readReplicas;
    const nodes = [
      ...p.initialNodes(), // client, app (cap 3000)
      node('db', 'database'),
      node('rlb', 'loadBalancer'),
      node('r1', 'readReplica'),
      node('r2', 'readReplica'),
    ];
    const r = simulate(p, nodes, [
      edge('client-1', 'app-1'),
      edge('app-1', 'db', 'write'),
      edge('app-1', 'rlb', 'read'),
      edge('rlb', 'r1', 'read'),
      edge('rlb', 'r2', 'read'),
    ]);
    expect(evaluatePuzzle(p, r).passed).toBe(true);
  });

  it('Replicate Your Reads: single DB (writes + reads both) fails on read overload', () => {
    const p = puzzles.readReplicas;
    const nodes = [
      ...p.initialNodes(),
      node('db', 'database'),
    ];
    const r = simulate(p, nodes, [
      edge('client-1', 'app-1'),
      edge('app-1', 'db'), // both, no split
    ]);
    expect(evaluatePuzzle(p, r).passed).toBe(false);
  });

  it('Replicate Your Reads: routing writes to a Replica is invalid (writes dropped)', () => {
    const p = puzzles.readReplicas;
    const nodes = [
      ...p.initialNodes(),
      node('r1', 'readReplica'),
      node('r2', 'readReplica'),
    ];
    const r = simulate(p, nodes, [
      edge('client-1', 'app-1'),
      edge('app-1', 'r1'), // both, but replica rejects writes
      edge('app-1', 'r2'),
    ]);
    expect(evaluatePuzzle(p, r).passed).toBe(false);
    expect(r.writeSuccessRate).toBeLessThan(0.99);
  });

  it('URL Shortener (regression): Client → LB alone does NOT pass', () => {
    // This combination passed in v0 due to the "any leaf = served" bug.
    const p = puzzles.urlShortener;
    const nodes = [
      node('c', 'client', { rps: 5000, readRatio: 0.95 }),
      node('lb', 'loadBalancer'),
    ];
    const r = simulate(p, nodes, [edge('c', 'lb')]);
    expect(evaluatePuzzle(p, r).passed).toBe(false);
  });

  it('Async Notification Pipeline: sync DB path (no queue) fails p99 latency', () => {
    // The pedagogical trap: scaling app servers alone seems sufficient, but
    // sync hop to the Database puts p99 above the 100ms threshold.
    const p = puzzles.asyncNotifications;
    const nodes = [
      ...p.initialNodes(),
      node('lb', 'loadBalancer'),
      node('app-a', 'service', { role: 'appServer', capacity: 500 }),
      node('app-b', 'service', { role: 'appServer', capacity: 500 }),
      node('db', 'database'),
    ];
    const r = simulate(p, nodes, [
      edge('client-1', 'lb'),
      edge('lb', 'app-a'),
      edge('lb', 'app-b'),
      edge('app-a', 'db'),
      edge('app-b', 'db'),
    ]);
    const ev = evaluatePuzzle(p, r);
    expect(ev.passed).toBe(false);
    expect(r.avgP99Latency).toBeGreaterThan(100);
  });

  it('Async Notification Pipeline: queue with default-capacity workers fails background success', () => {
    // The headline async trap: sync looks 100% green, background drops 95%.
    const p = puzzles.asyncNotifications;
    const nodes = [
      ...p.initialNodes(),
      node('lb', 'loadBalancer'),
      node('app-a', 'service', { role: 'appServer', capacity: 500 }),
      node('app-b', 'service', { role: 'appServer', capacity: 500 }),
      node('q', 'queue'),
      node('w', 'service', { role: 'worker' }), // default capacity 50 — way too small
      node('db', 'database'),
    ];
    const r = simulate(p, nodes, [
      edge('client-1', 'lb'),
      edge('lb', 'app-a'),
      edge('lb', 'app-b'),
      edge('app-a', 'q'),
      edge('app-b', 'q'),
      edge('q', 'w'),
      edge('w', 'db'),
    ]);
    const ev = evaluatePuzzle(p, r);
    expect(r.successRate).toBeGreaterThanOrEqual(0.99); // sync side passes
    expect(r.backgroundSuccessRate).toBeLessThan(0.99); // but async drops 95%
    expect(ev.passed).toBe(false);
  });

  it('Add a CDN: no CDN, just scaled internal architecture → mean latency too high', () => {
    // Even with cache hit rate cranked to 0.99 (so reads pass), mean latency
    // is dominated by the LB+App+Cache chain (~23ms). The 5ms cap is what
    // forces the CDN.
    const p = puzzles.addCdn;
    const nodes = [
      ...p.initialNodes(),
      node('lb', 'loadBalancer'),
      node('app-a', 'service', { role: 'appServer', capacity: 10000 }),
      node('app-b', 'service', { role: 'appServer', capacity: 10000 }),
      node('cache', 'cache', { role: 'internal', hitRate: 0.99 }),
      node('db', 'database'),
    ];
    const r = simulate(p, nodes, [
      edge('client-1', 'lb', 'read'),
      edge('lb', 'app-a'),
      edge('lb', 'app-b'),
      edge('app-a', 'cache', 'read'),
      edge('app-b', 'cache', 'read'),
      edge('cache', 'db', 'read'),
    ]);
    expect(r.readSuccessRate).toBeGreaterThanOrEqual(0.99); // sync side passes
    expect(r.avgLatency).toBeGreaterThan(5); // but mean latency busts the budget
    expect(evaluatePuzzle(p, r).passed).toBe(false);
  });

  it('Add a CDN: CDN dropped but unwired → hasCdn passes but reads still fail', () => {
    // Sanity check: the presence predicate only counts node existence, not
    // wiring. A player who drops a CDN without wiring it still has 20k reads
    // hitting the LB directly, with all the latency that implies.
    const p = puzzles.addCdn;
    const nodes = [
      ...p.initialNodes(),
      node('cdn-unwired', 'cache', { role: 'cdn' }), // just sitting there
      node('lb', 'loadBalancer'),
      node('app', 'service', { role: 'appServer', capacity: 30000 }),
      node('cache', 'cache', { role: 'internal' }),
      node('db', 'database'),
    ];
    const r = simulate(p, nodes, [
      // CDN deliberately not wired in
      edge('client-1', 'lb', 'read'),
      edge('lb', 'app'),
      edge('app', 'cache', 'read'),
      edge('cache', 'db', 'read'),
    ]);
    const ev = evaluatePuzzle(p, r);
    // The hasCdn predicate passes (CDN node exists)
    expect(ev.results.find((rq) => rq.key === 'hasCdn').passed).toBe(true);
    // But mean latency fails because 20k reads pay the full chain
    expect(ev.results.find((rq) => rq.key === 'meanLatency').passed).toBe(false);
    expect(ev.passed).toBe(false);
  });

  it('TinyURL at Scale: no KGS → hasKgs predicate fails (Q1+Q2 not answered)', () => {
    const p = puzzles.tinyurlAtScale;
    const nodes = [
      ...p.initialNodes(),
      node('cdn', 'cache', { role: 'cdn' }),
      node('rl', 'rateLimiter'),
      node('lb', 'loadBalancer'),
      node('app', 'service', { role: 'appServer', capacity: 1000 }),
      node('cache', 'cache', { role: 'internal' }),
      node('db', 'database'),
      node('q', 'queue'),
      node('w', 'service', { role: 'worker', capacity: 500 }),
      node('analytics-db', 'database'),
    ];
    const r = simulate(p, nodes, [
      edge('visitors', 'cdn', 'read'),
      edge('cdn', 'rl', 'read'),
      edge('posters', 'rl', 'write'),
      edge('rl', 'lb'),
      edge('lb', 'app'),
      edge('app', 'cache', 'read'),
      edge('app', 'db', 'write'), // writes go straight to DB, no KGS
      edge('cache', 'db', 'read'),
      edge('analytics-gen', 'q'),
      edge('q', 'w'),
      edge('w', 'analytics-db'),
    ]);
    const ev = evaluatePuzzle(p, r);
    expect(ev.results.find((rq) => rq.key === 'hasKgs').passed).toBe(false);
  });

  it('TinyURL at Scale: KGS undersized → writes drop (Q1: scaling the key-vending layer)', () => {
    const p = puzzles.tinyurlAtScale;
    const nodes = [
      ...p.initialNodes(),
      node('cdn', 'cache', { role: 'cdn' }),
      node('rl', 'rateLimiter'),
      node('lb', 'loadBalancer'),
      node('app', 'service', { role: 'appServer', capacity: 1000 }),
      node('cache', 'cache', { role: 'internal' }),
      node('kgs', 'kgs', { capacity: 30 }), // way under 100 writes/sec needed
      node('db', 'database'),
      node('q', 'queue'),
      node('w', 'service', { role: 'worker', capacity: 500 }),
      node('analytics-db', 'database'),
    ];
    const r = simulate(p, nodes, [
      edge('visitors', 'cdn', 'read'),
      edge('cdn', 'rl', 'read'),
      edge('posters', 'rl', 'write'),
      edge('rl', 'lb'),
      edge('lb', 'app'),
      edge('app', 'cache', 'read'),
      edge('app', 'kgs', 'write'),
      edge('kgs', 'db', 'write'),
      edge('cache', 'db', 'read'),
      edge('analytics-gen', 'q'),
      edge('q', 'w'),
      edge('w', 'analytics-db'),
    ]);
    // 30 keys/sec served, 70 posters/sec drop. Plus 500 analytics events ack.
    // total writes = 600, served = 30 + 500 = 530. successRate = 88%.
    expect(r.writeSuccessRate).toBeLessThan(0.99);
    expect(evaluatePuzzle(p, r).passed).toBe(false);
  });

  it('TinyURL at Scale: KGS acceptsReads:false — accidentally routing reads through KGS drops them', () => {
    // Pedagogical: a player tries to pipe reads through the KGS (e.g. as a
    // shortcut). The KGS rejects reads via acceptsReads:false. Warning fires.
    const p = puzzles.tinyurlAtScale;
    const r = simulate(
      p,
      [
        node('v', 'client', { rps: 100, readRatio: 1 }),
        node('k', 'kgs'),
        node('db', 'database'),
      ],
      [edge('v', 'k'), edge('k', 'db')]
    );
    expect(r.warnings.some((w) => /KGS.*doesn't accept reads/.test(w))).toBe(true);
  });

  it('Stream Processing (Kafka): single Queue + N Workers can\'t replace partitioning', () => {
    // Pedagogical: students often want to "just add more workers" instead of
    // partitioning. With one Queue, only one async fanout slice exists, so
    // multiple downstream workers split the SAME stream — and any worker
    // missing capacity still drops events.
    const p = puzzles.streamProcessingAtScale;
    const nodes = [
      ...p.initialNodes(),
      node('lb', 'loadBalancer', {}, { capacity: 60000 }),
      node('q', 'queue'),
      node('w', 'service', { role: 'worker' }), // default cap 50, can't drain 60k
      node('db', 'database'),
    ];
    const r = simulate(p, nodes, [
      edge('events-svc-a', 'lb'),
      edge('events-svc-b', 'lb'),
      edge('events-svc-c', 'lb'),
      edge('lb', 'q'),
      edge('q', 'w'),
      edge('w', 'db'),
    ]);
    // hasPartitionedTopic fails (only 1 queue), and async backs up massively.
    const ev = evaluatePuzzle(p, r);
    expect(ev.results.find((rq) => rq.key === 'hasPartitionedTopic').passed).toBe(false);
    expect(r.backgroundSuccessRate).toBeLessThan(0.99);
    expect(ev.passed).toBe(false);
  });

  it('Stream Processing (Kafka): no Load Balancer (Partition Router) → predicate fails', () => {
    // Player wires producers directly to multiple Queues. Predicate forces
    // an explicit router so the architecture matches real Kafka.
    const p = puzzles.streamProcessingAtScale;
    const nodes = [
      ...p.initialNodes(),
      node('q0', 'queue'),
      node('q1', 'queue'),
      node('q2', 'queue'),
      node('q3', 'queue'),
      node('w0', 'service', { role: 'worker', capacity: 20000 }),
      node('w1', 'service', { role: 'worker', capacity: 20000 }),
      node('w2', 'service', { role: 'worker', capacity: 20000 }),
      node('w3', 'service', { role: 'worker', capacity: 20000 }),
      node('db', 'database', { capacity: 80000 }),
    ];
    const producerToQueues = ['events-svc-a', 'events-svc-b', 'events-svc-c'].flatMap((p) => [
      edge(p, 'q0'),
      edge(p, 'q1'),
      edge(p, 'q2'),
      edge(p, 'q3'),
    ]);
    const r = simulate(p, nodes, [
      ...producerToQueues,
      edge('q0', 'w0'),
      edge('q1', 'w1'),
      edge('q2', 'w2'),
      edge('q3', 'w3'),
      edge('w0', 'db'),
      edge('w1', 'db'),
      edge('w2', 'db'),
      edge('w3', 'db'),
    ]);
    const ev = evaluatePuzzle(p, r);
    expect(ev.results.find((rq) => rq.key === 'hasPartitionRouter').passed).toBe(false);
    expect(ev.passed).toBe(false);
  });

  it('Stream Processing (Kafka): no Storage downstream → hasStorage fails', () => {
    // Consumer group drains the partitions but events never land in durable
    // storage. Real stream pipelines always sink somewhere — S3, ES, a DW.
    const p = puzzles.streamProcessingAtScale;
    const nodes = [
      ...p.initialNodes(),
      node('lb', 'loadBalancer', {}, { capacity: 60000 }),
      node('q0', 'queue'),
      node('q1', 'queue'),
      node('q2', 'queue'),
      node('q3', 'queue'),
      node('w0', 'service', { role: 'worker', capacity: 20000 }),
      node('w1', 'service', { role: 'worker', capacity: 20000 }),
      node('w2', 'service', { role: 'worker', capacity: 20000 }),
      node('w3', 'service', { role: 'worker', capacity: 20000 }),
    ];
    const r = simulate(p, nodes, [
      edge('events-svc-a', 'lb'),
      edge('events-svc-b', 'lb'),
      edge('events-svc-c', 'lb'),
      edge('lb', 'q0'),
      edge('lb', 'q1'),
      edge('lb', 'q2'),
      edge('lb', 'q3'),
      edge('q0', 'w0'),
      edge('q1', 'w1'),
      edge('q2', 'w2'),
      edge('q3', 'w3'),
    ]);
    const ev = evaluatePuzzle(p, r);
    expect(ev.results.find((rq) => rq.key === 'hasStorage').passed).toBe(false);
    expect(ev.passed).toBe(false);
  });

  it('Stream Processing (Kafka): under-sized consumers (default Worker cap 50) → async drops', () => {
    // Architecture is right (router + partitioned topic + consumer group +
    // storage), but each Worker uses default capacity. 60k events / 6
    // partitions = 10k/sec/partition, way over the default cap of 50.
    const p = puzzles.streamProcessingAtScale;
    const nodes = [
      ...p.initialNodes(),
      node('lb', 'loadBalancer', {}, { capacity: 60000 }),
      node('q0', 'queue'),
      node('q1', 'queue'),
      node('q2', 'queue'),
      node('q3', 'queue'),
      node('q4', 'queue'),
      node('q5', 'queue'),
      node('w0', 'service', { role: 'worker' }), // default cap 50
      node('w1', 'service', { role: 'worker' }),
      node('w2', 'service', { role: 'worker' }),
      node('w3', 'service', { role: 'worker' }),
      node('w4', 'service', { role: 'worker' }),
      node('w5', 'service', { role: 'worker' }),
      node('db', 'database', { capacity: 60000 }),
    ];
    const r = simulate(p, nodes, [
      edge('events-svc-a', 'lb'),
      edge('events-svc-b', 'lb'),
      edge('events-svc-c', 'lb'),
      edge('lb', 'q0'),
      edge('lb', 'q1'),
      edge('lb', 'q2'),
      edge('lb', 'q3'),
      edge('lb', 'q4'),
      edge('lb', 'q5'),
      edge('q0', 'w0'),
      edge('q1', 'w1'),
      edge('q2', 'w2'),
      edge('q3', 'w3'),
      edge('q4', 'w4'),
      edge('q5', 'w5'),
      edge('w0', 'db'),
      edge('w1', 'db'),
      edge('w2', 'db'),
      edge('w3', 'db'),
      edge('w4', 'db'),
      edge('w5', 'db'),
    ]);
    const ev = evaluatePuzzle(p, r);
    // hasConsumerGroup predicate passes (6 workers exist) but the math
    // doesn't: defaults don't drain 10k events/sec per partition.
    expect(ev.results.find((rq) => rq.key === 'hasConsumerGroup').passed).toBe(true);
    expect(r.backgroundSuccessRate).toBeLessThan(0.99);
    expect(ev.results.find((rq) => rq.key === 'asyncSuccess').passed).toBe(false);
    expect(ev.passed).toBe(false);
  });

  it('Stream Processing (Kafka): single under-sized DB sink → async drops (cluster pattern matters)', () => {
    // Architecture is otherwise right (router + 6 partitions + consumer group),
    // but the sink layer is a single default-capacity DB instead of an
    // LB-fronted cluster. 60k events/sec aggregate vs default DB cap 1000 =
    // most of the load drops at the sink. Reinforces Lesson 6's cluster pattern.
    const p = puzzles.streamProcessingAtScale;
    const nodes = [
      ...p.initialNodes(),
      node('lb', 'loadBalancer', {}, { capacity: 60000 }),
      node('q0', 'queue'),
      node('q1', 'queue'),
      node('q2', 'queue'),
      node('q3', 'queue'),
      node('q4', 'queue'),
      node('q5', 'queue'),
      node('w0', 'service', { role: 'worker', capacity: 10000 }),
      node('w1', 'service', { role: 'worker', capacity: 10000 }),
      node('w2', 'service', { role: 'worker', capacity: 10000 }),
      node('w3', 'service', { role: 'worker', capacity: 10000 }),
      node('w4', 'service', { role: 'worker', capacity: 10000 }),
      node('w5', 'service', { role: 'worker', capacity: 10000 }),
      node('db', 'database'), // default cap 1000, way under 60k aggregate
    ];
    const r = simulate(p, nodes, [
      edge('events-svc-a', 'lb'),
      edge('events-svc-b', 'lb'),
      edge('events-svc-c', 'lb'),
      edge('lb', 'q0'),
      edge('lb', 'q1'),
      edge('lb', 'q2'),
      edge('lb', 'q3'),
      edge('lb', 'q4'),
      edge('lb', 'q5'),
      edge('q0', 'w0'),
      edge('q1', 'w1'),
      edge('q2', 'w2'),
      edge('q3', 'w3'),
      edge('q4', 'w4'),
      edge('q5', 'w5'),
      edge('w0', 'db'),
      edge('w1', 'db'),
      edge('w2', 'db'),
      edge('w3', 'db'),
      edge('w4', 'db'),
      edge('w5', 'db'),
    ]);
    const ev = evaluatePuzzle(p, r);
    expect(ev.results.find((rq) => rq.key === 'hasStorage').passed).toBe(true); // predicate passes (1 DB)
    expect(r.backgroundSuccessRate).toBeLessThan(0.99); // but math doesn't
    expect(ev.passed).toBe(false);
  });

  it('Stream Processing (Kafka): single consumer group → hasMultipleConsumerGroups fails', () => {
    // The student wires the canonical real-time pipeline but forgets the
    // analytics group entirely. This is the Lesson 8 trap re-packaged for
    // Kafka: one group is fine for "task queue" semantics but misses Kafka's
    // defining feature — independent consumer groups reading the same topic.
    const p = puzzles.streamProcessingAtScale;
    const nodes = [
      ...p.initialNodes(),
      node('lb', 'loadBalancer', {}, { capacity: 60000 }),
      node('q0', 'queue', {}, { topic: 'events', pubsub: true }),
      node('q1', 'queue', {}, { topic: 'events', pubsub: true }),
      node('q2', 'queue', {}, { topic: 'events', pubsub: true }),
      node('q3', 'queue', {}, { topic: 'events', pubsub: true }),
      node('q4', 'queue', {}, { topic: 'events', pubsub: true }),
      node('q5', 'queue', {}, { topic: 'events', pubsub: true }),
      node('w0', 'service', { role: 'worker', capacity: 10000, consumerGroup: 'realtime' }),
      node('w1', 'service', { role: 'worker', capacity: 10000, consumerGroup: 'realtime' }),
      node('w2', 'service', { role: 'worker', capacity: 10000, consumerGroup: 'realtime' }),
      node('w3', 'service', { role: 'worker', capacity: 10000, consumerGroup: 'realtime' }),
      node('w4', 'service', { role: 'worker', capacity: 10000, consumerGroup: 'realtime' }),
      node('w5', 'service', { role: 'worker', capacity: 10000, consumerGroup: 'realtime' }),
      node('sink-lb', 'loadBalancer', {}, { capacity: 60000 }),
      node('sink-db', 'database', {}, { capacity: 60000 }),
      // 6 replicas + controller present so those predicates pass — failure is
      // *only* the missing second consumer group.
      node('rep-0', 'kafkaReplica'),
      node('rep-1', 'kafkaReplica'),
      node('rep-2', 'kafkaReplica'),
      node('rep-3', 'kafkaReplica'),
      node('rep-4', 'kafkaReplica'),
      node('rep-5', 'kafkaReplica'),
      node('kraft', 'kafkaController'),
    ];
    const r = simulate(p, nodes, [
      edge('events-svc-a', 'lb'),
      edge('events-svc-b', 'lb'),
      edge('events-svc-c', 'lb'),
      edge('lb', 'q0'),
      edge('lb', 'q1'),
      edge('lb', 'q2'),
      edge('lb', 'q3'),
      edge('lb', 'q4'),
      edge('lb', 'q5'),
      edge('q0', 'w0'),
      edge('q1', 'w1'),
      edge('q2', 'w2'),
      edge('q3', 'w3'),
      edge('q4', 'w4'),
      edge('q5', 'w5'),
      edge('w0', 'sink-lb'),
      edge('w1', 'sink-lb'),
      edge('w2', 'sink-lb'),
      edge('w3', 'sink-lb'),
      edge('w4', 'sink-lb'),
      edge('w5', 'sink-lb'),
      edge('sink-lb', 'sink-db'),
    ]);
    const ev = evaluatePuzzle(p, r);
    expect(r.consumerGroupCount).toBe(1);
    expect(ev.results.find((rq) => rq.key === 'hasMultipleConsumerGroups').passed).toBe(false);
    expect(ev.passed).toBe(false);
  });

  it('Stream Processing (Kafka): no replica markers → hasReplicaTopology fails', () => {
    // Architecture is otherwise canonical (router + partitions + 2 groups +
    // sinks + controller) but the student didn't draw replica markers.
    // The durability story (RF=3, leader+followers on different brokers)
    // isn't visible to the interviewer.
    const p = puzzles.streamProcessingAtScale;
    const nodes = [
      ...p.initialNodes(),
      node('lb', 'loadBalancer', {}, { capacity: 60000 }),
      node('q0', 'queue', {}, { topic: 'events', pubsub: true }),
      node('q1', 'queue', {}, { topic: 'events', pubsub: true }),
      node('q2', 'queue', {}, { topic: 'events', pubsub: true }),
      node('q3', 'queue', {}, { topic: 'events', pubsub: true }),
      node('q4', 'queue', {}, { topic: 'events', pubsub: true }),
      node('q5', 'queue', {}, { topic: 'events', pubsub: true }),
      node('wrt-0', 'service', { role: 'worker', capacity: 10000, consumerGroup: 'realtime' }),
      node('wrt-1', 'service', { role: 'worker', capacity: 10000, consumerGroup: 'realtime' }),
      node('wrt-2', 'service', { role: 'worker', capacity: 10000, consumerGroup: 'realtime' }),
      node('wrt-3', 'service', { role: 'worker', capacity: 10000, consumerGroup: 'realtime' }),
      node('wrt-4', 'service', { role: 'worker', capacity: 10000, consumerGroup: 'realtime' }),
      node('wrt-5', 'service', { role: 'worker', capacity: 10000, consumerGroup: 'realtime' }),
      node('wan-0', 'service', { role: 'worker', capacity: 10000, consumerGroup: 'analytics' }),
      node('wan-1', 'service', { role: 'worker', capacity: 10000, consumerGroup: 'analytics' }),
      node('wan-2', 'service', { role: 'worker', capacity: 10000, consumerGroup: 'analytics' }),
      node('wan-3', 'service', { role: 'worker', capacity: 10000, consumerGroup: 'analytics' }),
      node('wan-4', 'service', { role: 'worker', capacity: 10000, consumerGroup: 'analytics' }),
      node('wan-5', 'service', { role: 'worker', capacity: 10000, consumerGroup: 'analytics' }),
      node('sink-rt', 'database', {}, { capacity: 60000 }),
      node('sink-an', 'database', {}, { capacity: 60000 }),
      node('kraft', 'kafkaController'),
      // NOTE: no kafkaReplica nodes — that's the failure mode.
    ];
    const edges = [
      edge('events-svc-a', 'lb'),
      edge('events-svc-b', 'lb'),
      edge('events-svc-c', 'lb'),
      ...['q0', 'q1', 'q2', 'q3', 'q4', 'q5'].map((q) => edge('lb', q)),
      edge('q0', 'wrt-0'), edge('q0', 'wan-0'),
      edge('q1', 'wrt-1'), edge('q1', 'wan-1'),
      edge('q2', 'wrt-2'), edge('q2', 'wan-2'),
      edge('q3', 'wrt-3'), edge('q3', 'wan-3'),
      edge('q4', 'wrt-4'), edge('q4', 'wan-4'),
      edge('q5', 'wrt-5'), edge('q5', 'wan-5'),
      ...['wrt-0', 'wrt-1', 'wrt-2', 'wrt-3', 'wrt-4', 'wrt-5'].map((w) => edge(w, 'sink-rt')),
      ...['wan-0', 'wan-1', 'wan-2', 'wan-3', 'wan-4', 'wan-5'].map((w) => edge(w, 'sink-an')),
    ];
    const r = simulate(p, nodes, edges);
    const ev = evaluatePuzzle(p, r);
    expect(ev.results.find((rq) => rq.key === 'hasReplicaTopology').passed).toBe(false);
    expect(ev.passed).toBe(false);
  });

  it('Stream Processing (Kafka): killing 2 replicas of a partition → ISR insufficient, writes drop (Phase 1)', () => {
    // acks=all + minInsyncReplicas=2 means: 1 leader + 2 followers must be
    // alive. Fail both followers of partition-0 → 1 + 0 < 2 → partition-0
    // rejects writes. The other 5 partitions continue accepting.
    // 1/6 of producer load drops at the queue tier.
    const p = puzzles.streamProcessingAtScale;
    const { nodes: solNodes, edges } = p.solution();
    // Mark the two replicas of partition-0 as failed.
    const nodes = solNodes.map((n) => {
      if (n.id === 'rep-P0-B1' || n.id === 'rep-P0-B2') {
        return { ...n, data: { ...n.data, failed: true } };
      }
      return n;
    });
    const r = simulate(p, nodes, edges);
    // partition-0 receives 10k events/sec but rejects them all (capacity → 0).
    // Total writes: 60k. Dropped: 10k. successRate ≈ 5/6 ≈ 0.833.
    expect(r.successRate).toBeLessThan(0.99);
    expect(r.successRate).toBeGreaterThan(0.8);
    expect(r.totalDropped).toBeGreaterThan(0);
  });

  it('Stream Processing (Kafka): acks=all raises p99 vs acks=1 (Phase 2)', () => {
    // Same chain, two configurations. acks=all adds (RF-1)*5ms = 10ms of
    // replication-fetch latency per partition; acks=1 doesn't. The avgP99
    // metric reflects the difference end-to-end.
    const p = puzzles.streamProcessingAtScale;
    const baseNodes = [
      node('src', 'client', {}, { rps: 1000, readRatio: 0 }),
      node('q', 'queue', {}, { topic: 'events', pubsub: true, replicationFactor: 3, minInsyncReplicas: 1 }),
      node('w', 'service', { role: 'worker', capacity: 5000, consumerGroup: 'rt' }),
      node('db', 'database', {}, { capacity: 5000 }),
    ];
    const wires = [edge('src', 'q'), edge('q', 'w'), edge('w', 'db')];

    const ackAllNodes = baseNodes.map((n) =>
      n.id === 'q' ? { ...n, data: { ...n.data, config: { ...n.data.config, acks: 'all' } } } : n
    );
    const ack1Nodes = baseNodes.map((n) =>
      n.id === 'q' ? { ...n, data: { ...n.data, config: { ...n.data.config, acks: '1' } } } : n
    );

    const rAll = simulate(p, ackAllNodes, wires);
    const r1 = simulate(p, ack1Nodes, wires);
    expect(rAll.successRate).toBe(1);
    expect(r1.successRate).toBe(1);
    // acks=all p99 should be at least 10ms higher (2 follower fetch hops).
    expect(rAll.avgP99Latency).toBeGreaterThan(r1.avgP99Latency + 9);
  });

  it('Stream Processing (Kafka): killing leader Queue → healthy replica is promoted (Phase 3)', () => {
    // Mark partition-0 (the leader Queue) as failed. The sim should find
    // rep-P0-B1 (a healthy replica with replicaOf=partition-0) and promote
    // it: rewrite its type to queue, rebind incoming + outgoing edges.
    // Result: traffic continues flowing through the promoted leader; sync
    // success stays at 100%.
    const p = puzzles.streamProcessingAtScale;
    const { nodes: solNodes, edges } = p.solution();
    const nodes = solNodes.map((n) =>
      n.id === 'partition-0' ? { ...n, data: { ...n.data, failed: true } } : n
    );
    const r = simulate(p, nodes, edges);
    expect(r.ok).toBe(true);
    // Without promotion, partition-0's 10k load would be stranded at the
    // router → 1/6 of the writes drop. With promotion, the replica takes
    // over and all 60k make it through.
    expect(r.successRate).toBe(1);
  });

  it('Stream Processing (Kafka): replica markers are decorative — sim ignores them', () => {
    // Even if a student incorrectly wires producers → a kafkaReplica node,
    // the sim filters decoratives out so the canvas doesn't pretend the
    // replica accepts events. Validates the decorative primitive contract.
    const p = puzzles.streamProcessingAtScale;
    const nodes = [
      node('src', 'client', {}, { rps: 1000, readRatio: 0 }),
      node('rep', 'kafkaReplica'),
      node('db', 'database', {}, { capacity: 10000 }),
    ];
    const r = simulate(p, nodes, [edge('src', 'rep'), edge('rep', 'db')]);
    // Decorative filter strips the replica + both edges. The Client has no
    // downstream → stranded writes drop. successRate falls to 0.
    expect(r.ok).toBe(true);
    expect(r.successRate).toBeLessThan(0.5);
  });

  it('Twitter at Scale: no CDN → reads melt the App pool even at high App capacity', () => {
    // 50,000 reads/sec straight to LB → Apps → cache+replicas. Even bumped
    // App capacity can't make this work without offloading 95% to a CDN.
    const p = puzzles.twitterAtScale;
    const nodes = [
      ...p.initialNodes(),
      node('lb', 'loadBalancer'),
      node('app-a', 'service', { role: 'appServer', capacity: 5000 }),
      node('app-b', 'service', { role: 'appServer', capacity: 5000 }),
      node('cache', 'cache', { role: 'internal' }),
      node('rlb', 'loadBalancer'),
      node('r1', 'readReplica'),
      node('r2', 'readReplica'),
      node('q', 'queue'),
      node('w', 'service', { role: 'worker', capacity: 3000 }),
      node('dblb', 'loadBalancer'),
      node('db1', 'database'),
      node('db2', 'database'),
      node('db3', 'database'),
    ];
    const r = simulate(p, nodes, [
      edge('posters', 'lb', 'write'),
      edge('readers', 'lb', 'read'),
      edge('lb', 'app-a'),
      edge('lb', 'app-b'),
      edge('app-a', 'cache', 'read'),
      edge('app-b', 'cache', 'read'),
      edge('cache', 'rlb', 'read'),
      edge('rlb', 'r1', 'read'),
      edge('rlb', 'r2', 'read'),
      edge('app-a', 'q', 'write'),
      edge('app-b', 'q', 'write'),
      edge('q', 'w'),
      edge('w', 'dblb'),
      edge('dblb', 'db1'),
      edge('dblb', 'db2'),
      edge('dblb', 'db3'),
    ]);
    expect(evaluatePuzzle(p, r).passed).toBe(false);
    // hasCdn predicate fails — the lesson's headline requirement.
    expect(r.successRate).toBeLessThan(0.99);
  });

  it('Twitter at Scale: single primary DB instead of cluster → async writes drop', () => {
    // 3000 writes/sec into a default-cap (1000) primary DB. Workers drain
    // the queue but the DB can\'t absorb the async load.
    const p = puzzles.twitterAtScale;
    const nodes = [
      ...p.initialNodes(),
      node('cdn', 'cache', { role: 'cdn' }),
      node('lb', 'loadBalancer'),
      node('app-a', 'service', { role: 'appServer', capacity: 3000 }),
      node('app-b', 'service', { role: 'appServer', capacity: 3000 }),
      node('cache', 'cache', { role: 'internal' }),
      node('rlb', 'loadBalancer'),
      node('r1', 'readReplica'),
      node('r2', 'readReplica'),
      node('q', 'queue'),
      node('w', 'service', { role: 'worker', capacity: 3000 }),
      node('db', 'database'), // default cap 1000 — too small for 3k writes
    ];
    const r = simulate(p, nodes, [
      edge('posters', 'lb', 'write'),
      edge('readers', 'cdn', 'read'),
      edge('cdn', 'lb', 'read'),
      edge('lb', 'app-a'),
      edge('lb', 'app-b'),
      edge('app-a', 'cache', 'read'),
      edge('app-b', 'cache', 'read'),
      edge('cache', 'rlb', 'read'),
      edge('rlb', 'r1', 'read'),
      edge('rlb', 'r2', 'read'),
      edge('app-a', 'q', 'write'),
      edge('app-b', 'q', 'write'),
      edge('q', 'w'),
      edge('w', 'db'),
    ]);
    expect(evaluatePuzzle(p, r).passed).toBe(false);
    expect(r.backgroundSuccessRate).toBeLessThan(0.99);
  });

  it('Twitter at Scale: no Read Replicas → hasReadReplica predicate fails', () => {
    // Player uses every other pattern but skips replicas (sending all reads
    // through cache → primary DB). The success rates might still pass via
    // cap-bumping, but the capstone explicitly requires the replica pattern.
    const p = puzzles.twitterAtScale;
    const nodes = [
      ...p.initialNodes(),
      node('cdn', 'cache', { role: 'cdn' }),
      node('lb', 'loadBalancer'),
      node('app', 'service', { role: 'appServer', capacity: 6000 }),
      node('cache', 'cache', { role: 'internal' }),
      node('q', 'queue'),
      node('w', 'service', { role: 'worker', capacity: 3000 }),
      node('dblb', 'loadBalancer'),
      node('db1', 'database'),
      node('db2', 'database'),
      node('db3', 'database'),
    ];
    const r = simulate(p, nodes, [
      edge('posters', 'lb', 'write'),
      edge('readers', 'cdn', 'read'),
      edge('cdn', 'lb', 'read'),
      edge('lb', 'app'),
      edge('app', 'cache', 'read'),
      edge('cache', 'dblb', 'read'),
      edge('app', 'q', 'write'),
      edge('q', 'w'),
      edge('w', 'dblb'),
      edge('dblb', 'db1'),
      edge('dblb', 'db2'),
      edge('dblb', 'db3'),
    ]);
    const ev = evaluatePuzzle(p, r);
    const hasReplicaResult = ev.results.find((rq) => rq.key === 'hasReadReplica');
    expect(hasReplicaResult.passed).toBe(false);
  });

  it('Newsfeed Core: no cache → all reads hit DB, p99 busts the budget', () => {
    // 1000 reads/sec funneled directly through to the DB. DB cap covers the
    // load, but every read pays the full DB p99 (90ms) on top of LB + App
    // → busts the 100ms tail cap.
    const p = puzzles.newsfeedCore;
    const nodes = [
      ...p.initialNodes(),
      node('lb', 'loadBalancer'),
      node('app', 'service', { role: 'appServer', capacity: 2000 }),
      node('q', 'queue'),
      node('w', 'service', { role: 'worker', capacity: 200 }),
      node('db', 'database'),
    ];
    const r = simulate(p, nodes, [
      edge('posters', 'lb', 'write'),
      edge('readers', 'lb', 'read'),
      edge('lb', 'app'),
      edge('app', 'db', 'read'),
      edge('app', 'q', 'write'),
      edge('q', 'w'),
      edge('w', 'db'),
    ]);
    const ev = evaluatePuzzle(p, r);
    expect(ev.passed).toBe(false);
    expect(r.avgP99Latency).toBeGreaterThan(100);
  });

  it('Newsfeed Core: no queue → writes pay full sync DB cost, p99 busts the budget', () => {
    const p = puzzles.newsfeedCore;
    const nodes = [
      ...p.initialNodes(),
      node('lb', 'loadBalancer'),
      node('app', 'service', { role: 'appServer', capacity: 2000 }),
      node('cache', 'cache', { role: 'internal' }),
      node('db', 'database'),
    ];
    const r = simulate(p, nodes, [
      edge('posters', 'lb', 'write'),
      edge('readers', 'lb', 'read'),
      edge('lb', 'app'),
      edge('app', 'cache', 'read'),
      edge('cache', 'db', 'read'),
      edge('app', 'db', 'write'),
    ]);
    const ev = evaluatePuzzle(p, r);
    expect(ev.passed).toBe(false);
    // hasQueue predicate fails — even if metrics happen to pass somehow.
    expect(ev.results.find((rq) => rq.key === 'hasQueue').passed).toBe(false);
  });

  it('Newsfeed Core: under-sized workers → background fanout collapses', () => {
    // Sync looks healthy, but the fanout pipeline drops jobs because the
    // workers default to cap 50 each and we only have one of them.
    const p = puzzles.newsfeedCore;
    const nodes = [
      ...p.initialNodes(),
      node('lb', 'loadBalancer'),
      node('app', 'service', { role: 'appServer', capacity: 2000 }),
      node('cache', 'cache', { role: 'internal' }),
      node('q', 'queue'),
      node('w', 'service', { role: 'worker' }), // default cap 50, but 100 jobs/s
      node('db', 'database'),
    ];
    const r = simulate(p, nodes, [
      edge('posters', 'lb', 'write'),
      edge('readers', 'lb', 'read'),
      edge('lb', 'app'),
      edge('app', 'cache', 'read'),
      edge('cache', 'db', 'read'),
      edge('app', 'q', 'write'),
      edge('q', 'w'),
      edge('w', 'db'),
    ]);
    expect(r.successRate).toBe(1); // sync healthy
    expect(r.backgroundSuccessRate).toBe(0.5); // half the fanout drops
    expect(evaluatePuzzle(p, r).passed).toBe(false);
  });

  it('Async Notification Pipeline: single big worker (no fanout) also passes', () => {
    // Multiple valid solutions: one big worker handles the rate too.
    const p = puzzles.asyncNotifications;
    const nodes = [
      ...p.initialNodes(),
      node('lb', 'loadBalancer'),
      node('app-a', 'service', { role: 'appServer', capacity: 500 }),
      node('app-b', 'service', { role: 'appServer', capacity: 500 }),
      node('q', 'queue'),
      node('w', 'service', { role: 'worker', capacity: 1000 }),
      node('db', 'database'),
    ];
    const r = simulate(p, nodes, [
      edge('client-1', 'lb'),
      edge('lb', 'app-a'),
      edge('lb', 'app-b'),
      edge('app-a', 'q'),
      edge('app-b', 'q'),
      edge('q', 'w'),
      edge('w', 'db'),
    ]);
    expect(evaluatePuzzle(p, r).passed).toBe(true);
  });
});
