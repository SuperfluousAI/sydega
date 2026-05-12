import { describe, it, expect } from 'vitest';
import { simulate } from './simulator.js';
import { defaultsFor } from './componentTypes.js';

function node(id, type, configOverrides = {}, extra = {}) {
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

const flow = { kind: 'flow' };
const composition = { kind: 'composition' };
const connectivity = { kind: 'connectivity' };

// ─── Flow simulator ─────────────────────────────────────────────────────────

describe('flow simulator', () => {
  it('serves nothing when the client is disconnected', () => {
    const r = simulate(flow, [node('c', 'client', { rps: 1000 })], []);
    expect(r.ok).toBe(true);
    expect(r.totalAttempted).toBe(1000);
    expect(r.totalServed).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('regression: Client → LB only serves 0 (LB is not a sink)', () => {
    // The v0 bug: this passed the URL Shortener puzzle until the simulator
    // was tightened to only count terminations at sinks/cache hits as served.
    const r = simulate(
      flow,
      [node('c', 'client', { rps: 5000 }), node('lb', 'loadBalancer')],
      [edge('c', 'lb')]
    );
    expect(r.totalServed).toBe(0);
    expect(r.warnings.some((w) => /Load Balancer/.test(w))).toBe(true);
  });

  it('Client → LB → DB serves min(rps, DB.capacity)', () => {
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 5000 }),
        node('lb', 'loadBalancer', { capacity: 50_000 }),
        node('db', 'database', { capacity: 1000 }),
      ],
      [edge('c', 'lb'), edge('lb', 'db')]
    );
    expect(r.totalServed).toBe(1000);
    expect(r.totalDropped).toBe(4000);
  });

  it('latency accumulates along the path', () => {
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 100 }),
        node('lb', 'loadBalancer', { latency: 1 }),
        node('app', 'service', { role: 'appServer', capacity: 1000, latency: 20 }),
        node('db', 'database', { capacity: 1000, latency: 30 }),
      ],
      [edge('c', 'lb'), edge('lb', 'app'), edge('app', 'db')]
    );
    expect(r.avgLatency).toBeCloseTo(51, 5); // 1 + 20 + 30
  });

  it('rejects cycles', () => {
    const r = simulate(
      flow,
      [node('a', 'loadBalancer'), node('b', 'loadBalancer')],
      [edge('a', 'b'), edge('b', 'a')]
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/cycle/i);
  });

  it('cache terminates hit_rate of READS locally, passes misses downstream', () => {
    // Pure read load (readRatio = 1) so the assertions stay focused on cache.
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 1000, readRatio: 1 }),
        node('cache', 'cache', { role: 'internal', capacity: 100_000, hitRate: 0.8 }),
        node('db', 'database', { capacity: 10_000 }),
      ],
      [edge('c', 'cache'), edge('cache', 'db')]
    );
    expect(r.totalServed).toBeCloseTo(1000);
    expect(r.perNode.cache.terminated).toBeCloseTo(800);
    expect(r.perNode.db.accepted).toBeCloseTo(200);
  });

  it('cache hit_rate does NOT apply to writes — writes always pass through', () => {
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 1000, readRatio: 0 }),
        node('cache', 'cache', { role: 'internal', capacity: 100_000, hitRate: 0.8 }),
        node('db', 'database', { capacity: 10_000 }),
      ],
      [edge('c', 'cache'), edge('cache', 'db')]
    );
    expect(r.perNode.cache.terminated).toBeCloseTo(0);
    expect(r.perNode.db.accepted).toBeCloseTo(1000);
  });

  it('LB splits flow evenly across its out-edges', () => {
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 2000 }),
        node('lb', 'loadBalancer', { capacity: 50_000 }),
        node('db1', 'database', { capacity: 1000 }),
        node('db2', 'database', { capacity: 1000 }),
      ],
      [edge('c', 'lb'), edge('lb', 'db1'), edge('lb', 'db2')]
    );
    expect(r.totalServed).toBeCloseTo(2000);
    expect(r.perNode.db1.accepted).toBeCloseTo(1000);
    expect(r.perNode.db2.accepted).toBeCloseTo(1000);
  });

  it('Client emits read/write split based on readRatio', () => {
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 1000, readRatio: 0.8 }),
        node('db', 'database', { capacity: 10_000 }),
      ],
      [edge('c', 'db')]
    );
    expect(r.totalReadAttempted).toBeCloseTo(800);
    expect(r.totalWriteAttempted).toBeCloseTo(200);
    expect(r.totalReadServed).toBeCloseTo(800);
    expect(r.totalWriteServed).toBeCloseTo(200);
  });

  it('read-only edge routes only reads; writes get stranded upstream', () => {
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 1000, readRatio: 0.8 }),
        node('replica', 'readReplica', { capacity: 10_000 }),
      ],
      [edge('c', 'replica', 'read')]
    );
    expect(r.totalReadServed).toBeCloseTo(800);
    expect(r.totalWriteServed).toBeCloseTo(0);
  });

  it('write-only edge routes only writes; reads stranded upstream', () => {
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 1000, readRatio: 0.8 }),
        node('db', 'database', { capacity: 10_000 }),
      ],
      [edge('c', 'db', 'write')]
    );
    expect(r.totalReadServed).toBeCloseTo(0);
    expect(r.totalWriteServed).toBeCloseTo(200);
  });

  it('Read Replica drops any write traffic it receives', () => {
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 1000, readRatio: 0 }), // pure writes
        node('replica', 'readReplica', { capacity: 10_000 }),
      ],
      [edge('c', 'replica')] // edge carries both, but writes get rejected at replica
    );
    expect(r.totalWriteServed).toBeCloseTo(0);
    expect(r.warnings.some((w) => /Read Replica/.test(w) && /write/.test(w))).toBe(true);
  });

  it('App split: reads to replica, writes to DB serves both', () => {
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 1000, readRatio: 0.8 }),
        node('app', 'service', { role: 'appServer', capacity: 10_000 }),
        node('replica', 'readReplica', { capacity: 10_000 }),
        node('db', 'database', { capacity: 10_000 }),
      ],
      [
        edge('c', 'app'),
        edge('app', 'replica', 'read'),
        edge('app', 'db', 'write'),
      ]
    );
    expect(r.totalReadServed).toBeCloseTo(800);
    expect(r.totalWriteServed).toBeCloseTo(200);
    expect(r.totalDropped).toBeCloseTo(0);
  });

  it('conservation: attempted = served + dropped', () => {
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 3000 }),
        node('app', 'service', { role: 'appServer', capacity: 500 }),
      ],
      [edge('c', 'app')]
    );
    // App is a passthrough with no downstream, so traffic strands → all dropped.
    expect(Math.round(r.totalAttempted)).toBe(
      Math.round(r.totalServed + r.totalDropped)
    );
  });
});

// ─── Failure injection ──────────────────────────────────────────────────────

describe('flow simulator: failed nodes are removed from the topology', () => {
  // node.data.failed = true means the simulator should treat the node as
  // absent — edges into it strand traffic upstream; edges out of it carry zero.
  // The UI handles the visual treatment separately.

  function failedNode(id, type, configOverrides = {}, extra = {}) {
    const n = node(id, type, configOverrides, extra);
    n.data.failed = true;
    return n;
  }

  it('a failed sink loses its accepted traffic', () => {
    // Two DBs serving 2000 req/s — fail one, the other gets all the load
    // but is overcapacity, so half the requests drop.
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 2000, readRatio: 1 }),
        node('lb', 'loadBalancer'),
        failedNode('db1', 'database'),
        node('db2', 'database'),
      ],
      [edge('c', 'lb'), edge('lb', 'db1'), edge('lb', 'db2')]
    );
    // With db1 failed, the LB only has db2 to forward to. db2 cap 1000.
    expect(r.totalServed).toBe(1000);
    expect(r.totalDropped).toBe(1000);
  });

  it('a failed passthrough breaks downstream', () => {
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 1000, readRatio: 1 }),
        failedNode('lb', 'loadBalancer'),
        node('db', 'database'),
      ],
      [edge('c', 'lb'), edge('lb', 'db')]
    );
    // LB is gone; client traffic strands. db gets nothing.
    expect(r.totalServed).toBe(0);
    expect(r.totalAttempted).toBe(1000);
  });

  it('a failed source emits no traffic', () => {
    const r = simulate(
      flow,
      [
        failedNode('c', 'client', { rps: 5000, readRatio: 1 }),
        node('lb', 'loadBalancer'),
        node('db', 'database'),
      ],
      [edge('c', 'lb'), edge('lb', 'db')]
    );
    expect(r.totalAttempted).toBe(0);
    expect(r.totalServed).toBe(0);
  });

  it('no failed nodes means the sim is unchanged', () => {
    // Sanity: failure-injection filtering is a no-op when nothing is failed.
    const args = [
      node('c', 'client', { rps: 1000, readRatio: 1 }),
      node('lb', 'loadBalancer'),
      node('db', 'database'),
    ];
    const r = simulate(flow, args, [edge('c', 'lb'), edge('lb', 'db')]);
    expect(r.totalServed).toBe(1000);
  });

  it('failed nodes do not appear in perNode (the UI renders them from data.failed)', () => {
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 500 }),
        failedNode('lb', 'loadBalancer'),
        node('db', 'database'),
      ],
      [edge('c', 'lb'), edge('lb', 'db')]
    );
    expect(r.perNode.lb).toBeUndefined();
    expect(r.perNode.c).toBeDefined();
    expect(r.perNode.db).toBeDefined();
  });

  it('failing a Worker shifts the bottleneck to the remaining Workers', () => {
    // The pedagogical move: an async pipeline scaled to barely pass — kill
    // one Worker, see the background drain collapse.
    const baseline = simulate(
      flow,
      [
        node('c', 'client', { rps: 1000, readRatio: 0 }),
        node('app', 'service', { role: 'appServer', capacity: 5000 }),
        node('q', 'queue'),
        node('w1', 'service', { role: 'worker', capacity: 500 }),
        node('w2', 'service', { role: 'worker', capacity: 500 }),
        node('db', 'database'),
      ],
      [
        edge('c', 'app'),
        edge('app', 'q'),
        edge('q', 'w1'),
        edge('q', 'w2'),
        edge('w1', 'db'),
        edge('w2', 'db'),
      ]
    );
    expect(baseline.backgroundSuccessRate).toBe(1);

    const oneWorkerDown = simulate(
      flow,
      [
        node('c', 'client', { rps: 1000, readRatio: 0 }),
        node('app', 'service', { role: 'appServer', capacity: 5000 }),
        node('q', 'queue'),
        failedNode('w1', 'service', { role: 'worker', capacity: 500 }),
        node('w2', 'service', { role: 'worker', capacity: 500 }),
        node('db', 'database'),
      ],
      [
        edge('c', 'app'),
        edge('app', 'q'),
        edge('q', 'w1'),
        edge('q', 'w2'),
        edge('w1', 'db'),
        edge('w2', 'db'),
      ]
    );
    // Queue → w2 only (w1 gone). w2 cap 500 vs 1000 inbound: half the jobs drop.
    expect(oneWorkerDown.backgroundSuccessRate).toBe(0.5);
    // Sync side still healthy — the queue still enqueues at 100%.
    expect(oneWorkerDown.successRate).toBe(1);
  });
});

// ─── Queue + async path (Lesson 7 scaffolding) ──────────────────────────────

describe('flow simulator: queue terminates sync, opens async path', () => {
  // The canonical FAANG pattern: a producer hands work to a queue; a worker
  // pool drains the queue independently. Sync metrics measure the enqueue
  // success rate; background metrics measure how many jobs actually finished.

  it('queue terminates sync path: enqueue counts as served', () => {
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 1000, readRatio: 0 }),
        node('app', 'service', { role: 'appServer', capacity: 2000 }),
        node('q', 'queue'),
        node('w', 'service', { role: 'worker', capacity: 50 }),
        node('db', 'database', { capacity: 1000 }),
      ],
      [edge('c', 'app'), edge('app', 'q'), edge('q', 'w'), edge('w', 'db')]
    );
    // Sync side: 1000 writes flow client → app → queue, all enqueue successfully.
    expect(r.successRate).toBe(1);
    expect(r.totalServed).toBe(1000);
  });

  it('exposes background metrics distinct from sync metrics', () => {
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 1000, readRatio: 0 }),
        node('app', 'service', { role: 'appServer', capacity: 2000 }),
        node('q', 'queue'),
        node('w', 'service', { role: 'worker', capacity: 50 }),
        node('db', 'database', { capacity: 1000 }),
      ],
      [edge('c', 'app'), edge('app', 'q'), edge('q', 'w'), edge('w', 'db')]
    );
    // 1000 jobs/s enter the queue. Worker capacity is 50, so 950 are dropped.
    // Of the 50 the worker processes, all reach the DB (cap 1000).
    expect(r.totalBackgroundAttempted).toBe(1000);
    expect(r.totalBackgroundServed).toBe(50);
    expect(r.backgroundSuccessRate).toBeCloseTo(0.05);
  });

  it('backgroundSuccessRate is 1 when no queue exists (backward compatible)', () => {
    // Plain sync graph from earlier lessons — async machinery should be inert.
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 1000 }),
        node('db', 'database', { capacity: 1000 }),
      ],
      [edge('c', 'db')]
    );
    expect(r.totalBackgroundAttempted).toBe(0);
    expect(r.backgroundSuccessRate).toBe(1);
  });

  it('Worker scaled to match queue rate drains everything', () => {
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 1000, readRatio: 0 }),
        node('app', 'service', { role: 'appServer', capacity: 2000 }),
        node('q', 'queue'),
        node('w', 'service', { role: 'worker', capacity: 1000 }),
        node('db', 'database', { capacity: 2000 }),
      ],
      [edge('c', 'app'), edge('app', 'q'), edge('q', 'w'), edge('w', 'db')]
    );
    expect(r.backgroundSuccessRate).toBe(1);
    expect(r.totalBackgroundServed).toBe(1000);
  });

  it('async work fans out across multiple workers behind the same queue', () => {
    // Two workers, each capacity 500, drain a single queue at 1000 jobs/s.
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 1000, readRatio: 0 }),
        node('app', 'service', { role: 'appServer', capacity: 2000 }),
        node('q', 'queue'),
        node('w1', 'service', { role: 'worker', capacity: 500 }),
        node('w2', 'service', { role: 'worker', capacity: 500 }),
        node('db', 'database', { capacity: 2000 }),
      ],
      [
        edge('c', 'app'),
        edge('app', 'q'),
        edge('q', 'w1'),
        edge('q', 'w2'),
        edge('w1', 'db'),
        edge('w2', 'db'),
      ]
    );
    // 1000 jobs split 500/500; each worker drains its share; both reach DB.
    expect(r.backgroundSuccessRate).toBe(1);
    expect(r.totalBackgroundServed).toBe(1000);
  });

  it('queue without downstream strands async traffic and warns', () => {
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 500, readRatio: 0 }),
        node('app', 'service', { role: 'appServer', capacity: 1000 }),
        node('q', 'queue'),
      ],
      [edge('c', 'app'), edge('app', 'q')]
    );
    expect(r.totalBackgroundAttempted).toBe(500);
    expect(r.totalBackgroundServed).toBe(0);
    expect(r.backgroundSuccessRate).toBe(0);
    // Sync side still succeeds — enqueue worked, even if nothing drains it.
    expect(r.successRate).toBe(1);
  });

  it('Worker without downstream emits stranded-async warning', () => {
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 500, readRatio: 0 }),
        node('app', 'service', { role: 'appServer', capacity: 1000 }),
        node('q', 'queue'),
        node('w', 'service', { role: 'worker', capacity: 1000 }),
      ],
      [edge('c', 'app'), edge('app', 'q'), edge('q', 'w')]
    );
    // Worker accepts 500 jobs but has no sink to land them on.
    expect(r.totalBackgroundServed).toBe(0);
    expect(r.warnings.some((w) => /Worker.*background/.test(w))).toBe(true);
  });

  it('queue does not double-count: sync and background totals are independent', () => {
    const r = simulate(
      flow,
      [
        node('c', 'client', { rps: 1000, readRatio: 0 }),
        node('app', 'service', { role: 'appServer', capacity: 2000 }),
        node('q', 'queue'),
        node('w', 'service', { role: 'worker', capacity: 100 }),
        node('db', 'database', { capacity: 1000 }),
      ],
      [edge('c', 'app'), edge('app', 'q'), edge('q', 'w'), edge('w', 'db')]
    );
    // totalServed = sync side (1000 enqueues). totalBackgroundServed = 100.
    // They live on separate counters; adding them would be a category error.
    expect(r.totalServed).toBe(1000);
    expect(r.totalBackgroundServed).toBe(100);
  });
});

// ─── Composition simulator ──────────────────────────────────────────────────

describe('composition simulator', () => {
  it('an empty Computer has zero resources', () => {
    const r = simulate(composition, [node('pc', 'computer')], []);
    expect(r.perNode.pc.resources).toEqual({ cores: 0, ramGb: 0, diskGb: 0 });
  });

  it('aggregates CPU/RAM/Disk children inside a Computer', () => {
    const r = simulate(
      composition,
      [
        node('pc', 'computer'),
        node('cpu', 'cpu', { cores: 4 }, { parentNode: 'pc' }),
        node('ram', 'ram', { gb: 8 }, { parentNode: 'pc' }),
        node('disk', 'disk', { gb: 100 }, { parentNode: 'pc' }),
      ],
      []
    );
    expect(r.perNode.pc.resources).toEqual({ cores: 4, ramGb: 8, diskGb: 100 });
  });

  it('hosts a Program when its parent Computer meets the budget', () => {
    const r = simulate(
      composition,
      [
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
      ],
      []
    );
    expect(r.allHosted).toBe(true);
    expect(r.orphanCount).toBe(0);
    expect(r.perNode.prog.hosted).toBe(true);
  });

  it('marks Program as under-resourced when Computer is too small', () => {
    const r = simulate(
      composition,
      [
        node('pc', 'computer'),
        node('cpu', 'cpu', { cores: 2 }, { parentNode: 'pc' }),
        node('ram', 'ram', { gb: 4 }, { parentNode: 'pc' }),
        node('disk', 'disk', { gb: 20 }, { parentNode: 'pc' }),
        node(
          'prog',
          'program',
          { requires_cores: 4, requires_ram_gb: 8, requires_disk_gb: 50 },
          { parentNode: 'pc' }
        ),
      ],
      []
    );
    expect(r.allHosted).toBe(false);
    expect(r.perNode.prog.hosted).toBe(false);
    expect(r.perNode.prog.reason).toMatch(/2 cores/);
    expect(r.perNode.prog.reason).toMatch(/4 GB RAM/);
    expect(r.perNode.prog.reason).toMatch(/30 GB disk/);
  });

  it('marks Program without a parent Computer as not hosted', () => {
    const r = simulate(composition, [node('prog', 'program')], []);
    expect(r.allHosted).toBe(false);
    expect(r.perNode.prog.hosted).toBe(false);
    expect(r.perNode.prog.reason).toMatch(/not inside/i);
  });

  it('counts orphan hardware that is not inside any Computer', () => {
    const r = simulate(composition, [node('cpu', 'cpu', { cores: 4 })], []);
    expect(r.orphanCount).toBe(1);
    expect(r.warnings.some((w) => /CPU/.test(w))).toBe(true);
  });

  it('does not count hardware as orphan when its parent is a Computer', () => {
    const r = simulate(
      composition,
      [
        node('pc', 'computer'),
        node('cpu', 'cpu', { cores: 4 }, { parentNode: 'pc' }),
      ],
      []
    );
    expect(r.orphanCount).toBe(0);
  });
});

// ─── Connectivity simulator ─────────────────────────────────────────────────

describe('connectivity simulator', () => {
  function setupChain({
    visitorDomain = 'myapp.com',
    domainName = 'myapp.com',
    dnsValue = '1.2.3.4',
    vpsIp = '1.2.3.4',
    skip = null,
  } = {}) {
    const nodes = [node('v', 'visitor', { targetDomain: visitorDomain })];
    const edges = [];
    if (skip !== 'domain') {
      nodes.push(node('d', 'domain', { name: domainName }));
      edges.push(edge('v', 'd'));
    }
    if (skip !== 'dns') {
      nodes.push(node('dns', 'dnsRecord', { recordType: 'A', value: dnsValue }));
      if (skip !== 'domain') edges.push(edge('d', 'dns'));
    }
    if (skip !== 'vps') {
      nodes.push(node('vps', 'vps', { ip: vpsIp }));
      if (skip !== 'dns') edges.push(edge('dns', 'vps'));
    }
    return { nodes, edges };
  }

  it('reaches the VPS when chain + names + IP all match', () => {
    const { nodes, edges } = setupChain();
    const r = simulate(connectivity, nodes, edges);
    expect(r.allReach).toBe(true);
  });

  it('fails when the DNS record IP does not match the VPS IP', () => {
    const { nodes, edges } = setupChain({ dnsValue: '9.9.9.9' });
    const r = simulate(connectivity, nodes, edges);
    expect(r.allReach).toBe(false);
  });

  it('fails when the Domain name does not match the Visitor target', () => {
    const { nodes, edges } = setupChain({ domainName: 'other.com' });
    const r = simulate(connectivity, nodes, edges);
    expect(r.allReach).toBe(false);
  });

  it('fails when there is no DNS Record between Domain and VPS', () => {
    const { nodes, edges } = setupChain({ skip: 'dns' });
    const r = simulate(connectivity, nodes, edges);
    expect(r.allReach).toBe(false);
  });

  it('fails when there is no Domain wired to the Visitor', () => {
    const { nodes, edges } = setupChain({ skip: 'domain' });
    const r = simulate(connectivity, nodes, edges);
    expect(r.allReach).toBe(false);
  });

  it('reports zero visitors as not all-reach', () => {
    const r = simulate(connectivity, [], []);
    expect(r.allReach).toBe(false);
  });
});
