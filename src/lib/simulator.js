// Each puzzle kind dispatches to its own simulator. They share the graph shape
// (React Flow nodes + edges) but interpret semantics differently:
//   - flow: req/s propagation, capacity caps, latency accumulation.
//   - composition: resource aggregation. Does each Computer hold enough hardware
//     to satisfy the Programs it's hosting?
//   - connectivity: chain validation. Can every Visitor reach a VPS through a
//     matching Domain + DNS Record?

import { componentTypes, metaFor } from './componentTypes.js';
import { assignLanIps } from './lanIp.js';

export function simulate(puzzle, nodes, edges) {
  // Region nodes are UI-only (visual zone labels — see Lesson 3's "Your LAN"
  // / "The Internet" backgrounds). They never participate in simulation.
  nodes = nodes.filter((n) => n.type !== 'region');

  // Failure injection: a node marked `data.failed: true` is invisible to the
  // simulator. Edges into it strand traffic upstream (the existing stranded-
  // flow warning catches that); edges out of it carry zero. The UI renders
  // the failed state independently — we don't need failed nodes in `perNode`
  // because their visual treatment comes from `data.failed`, not sim output.
  const failedIds = new Set();
  for (const n of nodes) if (n.data?.failed) failedIds.add(n.id);
  if (failedIds.size > 0) {
    nodes = nodes.filter((n) => !failedIds.has(n.id));
    edges = edges.filter((e) => !failedIds.has(e.source) && !failedIds.has(e.target));
  }
  const result = dispatch(puzzle, nodes, edges);
  if (result && result.ok) {
    result.nodesByType = countNodesByType(nodes);
  }
  return result;
}

function dispatch(puzzle, nodes, edges) {
  switch (puzzle.kind) {
    case 'composition':
      return simulateComposition(nodes, edges);
    case 'connectivity':
      return simulateConnectivity(nodes, edges);
    case 'flow':
    default:
      return simulateFlow(nodes, edges);
  }
}

function countNodesByType(nodes) {
  // Counts by both the plain type key (`cache`, `service`, etc.) AND by the
  // compound `type:role` key (`cache:cdn`, `service:worker`) for role-aware
  // types. Powers role-scoped presence predicates like
  // `{ kind: 'presence', type: 'cache', role: 'cdn', min: 1 }`.
  const counts = {};
  for (const n of nodes) {
    const t = n.data?.type;
    if (!t) continue;
    counts[t] = (counts[t] || 0) + 1;
    const role = n.data?.config?.role;
    if (role) {
      const key = `${t}:${role}`;
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return counts;
}

// ─── Graph helpers ──────────────────────────────────────────────────────────

function buildAdjacency(nodes, edges) {
  const outAdj = new Map();
  const inAdj = new Map();
  for (const n of nodes) {
    outAdj.set(n.id, []);
    inAdj.set(n.id, []);
  }
  for (const e of edges) {
    if (!outAdj.has(e.source) || !outAdj.has(e.target)) continue;
    if (e.source === e.target) continue;
    outAdj.get(e.source).push(e.target);
    inAdj.get(e.target).push(e.source);
  }
  return { outAdj, inAdj };
}

function topoSort(nodes, outAdj, inAdj) {
  const indeg = new Map(nodes.map((n) => [n.id, inAdj.get(n.id).length]));
  const queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const t of outAdj.get(id)) {
      indeg.set(t, indeg.get(t) - 1);
      if (indeg.get(t) === 0) queue.push(t);
    }
  }
  return order.length === nodes.length ? order : null;
}

// ─── Flow simulator (Lessons 3-4) ───────────────────────────────────────────

function simulateFlow(nodes, edges) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const { outAdj, inAdj } = buildAdjacency(nodes, edges);

  const order = topoSort(nodes, outAdj, inAdj);
  if (!order) return { ok: false, error: 'Graph has a cycle. Remove circular connections.' };

  // Index edges by (source, target). Edge.data.kind: 'read' | 'write' | 'both'.
  const edgeBetween = new Map(); // `${source}->${target}` -> edge
  const readOutBySource = new Map(); // source id -> number of read-or-both out-edges
  const writeOutBySource = new Map();
  for (const n of nodes) {
    readOutBySource.set(n.id, 0);
    writeOutBySource.set(n.id, 0);
  }
  for (const e of edges) {
    if (e.source === e.target) continue;
    if (!outAdj.has(e.source) || !outAdj.has(e.target)) continue;
    edgeBetween.set(`${e.source}->${e.target}`, e);
    const kind = e.data?.kind || 'both';
    if (kind === 'read' || kind === 'both') readOutBySource.set(e.source, readOutBySource.get(e.source) + 1);
    if (kind === 'write' || kind === 'both') writeOutBySource.set(e.source, writeOutBySource.get(e.source) + 1);
  }

  const state = new Map();
  for (const n of nodes) {
    state.set(n.id, {
      readIn: 0, writeIn: 0,
      readAccepted: 0, writeAccepted: 0,
      readDropped: 0, writeDropped: 0,
      readContinuing: 0, writeContinuing: 0,
      // legacy aggregates so the existing SystemNode display + tests still work
      incoming: 0, accepted: 0, dropped: 0, continuing: 0, terminated: 0,
      // p99LatencyToHere mirrors latencyToHere but uses cfg.p99Latency (mean
      // is mean of all served requests; p99 is propagated along the worst
      // incoming path the same way mean is). See caveats.md #3.
      latencyToHere: 0, p99LatencyToHere: 0,
      // Async-path metrics. Seeded at Queues from their sync accepted load,
      // then propagated downstream in a second pass. See "Async pass" below.
      asyncIn: 0, asyncAccepted: 0, asyncDropped: 0, asyncContinuing: 0,
    });
  }

  let totalReadAttempted = 0, totalWriteAttempted = 0;
  let totalReadServed = 0, totalWriteServed = 0;
  let totalServedLatencyWeighted = 0;
  let totalServedP99Weighted = 0;
  let totalBackgroundAttempted = 0;
  let totalBackgroundServed = 0;
  const warnings = [];

  for (const id of order) {
    const node = nodeMap.get(id);
    const cfg = node.data.config;
    const meta = componentTypes[node.data.type];
    const s = state.get(id);

    if (meta.role === 'source') {
      const rps = Number(cfg.rps) || 0;
      const readRatio = Math.max(0, Math.min(1, Number(cfg.readRatio) || 0));
      const reads = rps * readRatio;
      const writes = rps - reads;
      s.readContinuing = reads;
      s.writeContinuing = writes;
      s.accepted = rps;
      s.continuing = rps;
      totalReadAttempted += reads;
      totalWriteAttempted += writes;
      if (outAdj.get(id).length === 0) {
        warnings.push(`${meta.label} is not connected — its traffic goes nowhere.`);
      }
      continue;
    }

    // Pull from each parent based on the edge kind connecting it to us.
    let readInFlow = 0, writeInFlow = 0;
    let worstParentLatency = 0, worstParentP99Latency = 0;
    for (const pid of inAdj.get(id)) {
      const ps = state.get(pid);
      const e = edgeBetween.get(`${pid}->${id}`);
      const kind = e?.data?.kind || 'both';
      const carriesReads = kind === 'read' || kind === 'both';
      const carriesWrites = kind === 'write' || kind === 'both';
      const parentReadSplits = readOutBySource.get(pid) || 1;
      const parentWriteSplits = writeOutBySource.get(pid) || 1;
      const readFromParent = carriesReads ? ps.readContinuing / parentReadSplits : 0;
      const writeFromParent = carriesWrites ? ps.writeContinuing / parentWriteSplits : 0;
      readInFlow += readFromParent;
      writeInFlow += writeFromParent;
      // Only count this parent's accumulated latency if it actually delivers
      // sync flow on this edge. Otherwise a parent that only contributes on
      // a different flow (e.g., a Worker that's part of the async fanout but
      // also wires into the same sink for a different reason) would inflate
      // the sync-side p99 spuriously. See Newsfeed Core (Lesson 9) for the
      // failure mode this prevents — Cache → DB sync reads were being priced
      // at Worker → DB latency before this fix.
      if (readFromParent > 0 || writeFromParent > 0) {
        worstParentLatency = Math.max(worstParentLatency, ps.latencyToHere);
        worstParentP99Latency = Math.max(worstParentP99Latency, ps.p99LatencyToHere);
      }
    }
    s.readIn = readInFlow;
    s.writeIn = writeInFlow;
    s.incoming = readInFlow + writeInFlow;

    // Reject reads or writes the node refuses to handle (e.g. Replica rejects writes).
    let effReads = readInFlow;
    let effWrites = writeInFlow;
    if (meta.acceptsReads === false && readInFlow > 0.01) {
      s.readDropped += readInFlow;
      warnings.push(`${meta.label} dropped ${Math.round(readInFlow)} read req/s — it doesn't accept reads.`);
      effReads = 0;
    }
    if (meta.acceptsWrites === false && writeInFlow > 0.01) {
      s.writeDropped += writeInFlow;
      warnings.push(`${meta.label} dropped ${Math.round(writeInFlow)} write req/s — wire writes to a Database instead.`);
      effWrites = 0;
    }

    // Apply capacity cap proportionally across (reads + writes).
    const cap = Number(cfg.capacity);
    const capacity = Number.isFinite(cap) && cap > 0 ? cap : Infinity;
    const totalEff = effReads + effWrites;
    const accepted = Math.min(totalEff, capacity);
    const acceptRatio = totalEff > 0 ? accepted / totalEff : 0;
    s.readAccepted = effReads * acceptRatio;
    s.writeAccepted = effWrites * acceptRatio;
    s.readDropped += effReads - s.readAccepted;
    s.writeDropped += effWrites - s.writeAccepted;
    s.accepted = s.readAccepted + s.writeAccepted;
    s.dropped = s.readDropped + s.writeDropped;
    const meanLat = Number(cfg.latency) || 0;
    // Default p99 to 3× mean if the component doesn't carry one explicitly.
    // Industry rule-of-thumb; players can override per-component. See caveats.md #3.
    const p99Lat = cfg.p99Latency != null ? Number(cfg.p99Latency) : meanLat * 3;
    s.latencyToHere = worstParentLatency + meanLat;
    s.p99LatencyToHere = worstParentP99Latency + p99Lat;

    if (meta.role === 'cache') {
      // hit_rate applies to READS only; writes always pass through.
      const hitRate = Math.max(0, Math.min(1, Number(cfg.hitRate) || 0));
      const hits = s.readAccepted * hitRate;
      const readMisses = s.readAccepted - hits;
      s.terminated += hits;
      totalReadServed += hits;
      totalServedLatencyWeighted += hits * s.latencyToHere;
      totalServedP99Weighted += hits * s.p99LatencyToHere;
      s.readContinuing = readMisses;
      s.writeContinuing = s.writeAccepted;
    } else if (meta.role === 'queue') {
      // The Queue terminates the sync path: enqueueing is the success
      // condition from the client's perspective. The same accepted load
      // becomes the seed for the async pass below. v1 queues have no
      // capacity cap (Infinity), so accepted == effective input.
      s.terminated += s.accepted;
      totalReadServed += s.readAccepted;
      totalWriteServed += s.writeAccepted;
      totalServedLatencyWeighted += s.accepted * s.latencyToHere;
      totalServedP99Weighted += s.accepted * s.p99LatencyToHere;
      s.readContinuing = 0;
      s.writeContinuing = 0;
      // Seed for async pass — the queue emits whatever it accepted.
      s.asyncContinuing = s.accepted;
      totalBackgroundAttempted += s.accepted;
    } else if (meta.role === 'sink') {
      s.terminated += s.accepted;
      totalReadServed += s.readAccepted;
      totalWriteServed += s.writeAccepted;
      totalServedLatencyWeighted += s.accepted * s.latencyToHere;
      totalServedP99Weighted += s.accepted * s.p99LatencyToHere;
      s.readContinuing = 0;
      s.writeContinuing = 0;
    } else {
      s.readContinuing = s.readAccepted;
      s.writeContinuing = s.writeAccepted;
    }
    s.continuing = s.readContinuing + s.writeContinuing;

    // Stranded flow: a non-sink that can't forward its accumulated traffic.
    if (meta.role !== 'sink') {
      const outRead = readOutBySource.get(id) || 0;
      const outWrite = writeOutBySource.get(id) || 0;
      if (s.readContinuing > 0.01 && outRead === 0) {
        warnings.push(
          `${meta.label} has ${Math.round(s.readContinuing)} read req/s with no read-carrying out-edge.`
        );
        s.readDropped += s.readContinuing;
        s.readContinuing = 0;
      }
      if (s.writeContinuing > 0.01 && outWrite === 0) {
        warnings.push(
          `${meta.label} has ${Math.round(s.writeContinuing)} write req/s with no write-carrying out-edge.`
        );
        s.writeDropped += s.writeContinuing;
        s.writeContinuing = 0;
      }
      s.dropped = s.readDropped + s.writeDropped;
      s.continuing = s.readContinuing + s.writeContinuing;
    }
  }

  // ─── Async pass ─────────────────────────────────────────────────────────
  // Queues seeded `asyncContinuing` during the sync pass. Now propagate that
  // load downstream through the same topo order. Capacity caps apply (Workers
  // are the typical bottleneck). The async side has its own success rate so
  // a system can look "healthy" sync-side while the queue grows unbounded.
  // Async edges don't carry the read/write distinction — jobs are jobs.
  if (totalBackgroundAttempted > 0) {
    for (const id of order) {
      const node = nodeMap.get(id);
      const meta = componentTypes[node.data.type];
      const s = state.get(id);
      // Sources are pure sync — they don't participate in async.
      if (meta.role === 'source') continue;
      // Queues already have asyncContinuing seeded; nothing to pull or cap.
      if (meta.role === 'queue') continue;

      // Pull from all parents that have async traffic to forward.
      let asyncIn = 0;
      for (const pid of inAdj.get(id)) {
        const ps = state.get(pid);
        if (ps.asyncContinuing <= 0) continue;
        // Async traffic splits evenly across the parent's out-edges. Read/
        // write kind is irrelevant on the async side.
        const outDegree = outAdj.get(pid).length || 1;
        asyncIn += ps.asyncContinuing / outDegree;
      }
      s.asyncIn = asyncIn;
      if (asyncIn <= 0) continue;

      const cfg = node.data.config;
      const cap = Number(cfg.capacity);
      const capacity = Number.isFinite(cap) && cap > 0 ? cap : Infinity;
      const accepted = Math.min(asyncIn, capacity);
      s.asyncAccepted = accepted;
      s.asyncDropped = asyncIn - accepted;

      if (meta.role === 'sink') {
        totalBackgroundServed += accepted;
        s.asyncContinuing = 0;
      } else {
        s.asyncContinuing = accepted;
      }
    }

    // Stranded async traffic: a non-sink that accepted async load but has
    // no out-edge to forward it. Mirrors the sync stranded-flow warning.
    for (const id of order) {
      const node = nodeMap.get(id);
      const meta = componentTypes[node.data.type];
      const s = state.get(id);
      if (s.asyncContinuing > 0.01 && meta.role !== 'sink' && meta.role !== 'queue') {
        if ((outAdj.get(id) || []).length === 0) {
          const label = metaFor(node)?.label || 'Node';
          warnings.push(
            `${label} has ${Math.round(s.asyncContinuing)} background job/s with no downstream to consume them.`
          );
          s.asyncDropped += s.asyncContinuing;
          s.asyncContinuing = 0;
        }
      }
    }
  }

  let bottleneck = null;
  let worstDrop = 0;
  for (const [id, st] of state) {
    const totalDroppedHere = st.dropped + (st.asyncDropped || 0);
    if (totalDroppedHere > worstDrop) {
      worstDrop = totalDroppedHere;
      bottleneck = id;
    }
  }
  // Resolve the bottleneck id to a human label so the UI doesn't have to do
  // the role-aware lookup. metaFor handles service.appServer vs service.worker.
  let bottleneckLabel = null;
  if (bottleneck) {
    const node = nodeMap.get(bottleneck);
    bottleneckLabel = metaFor(node)?.label || componentTypes[node?.data?.type]?.label || null;
  }

  const totalAttempted = totalReadAttempted + totalWriteAttempted;
  const totalServed = totalReadServed + totalWriteServed;
  const totalDropped = Math.max(0, totalAttempted - totalServed);
  const avgLatency = totalServed > 0 ? totalServedLatencyWeighted / totalServed : 0;
  const avgP99Latency = totalServed > 0 ? totalServedP99Weighted / totalServed : 0;
  const successRate = totalAttempted > 0 ? totalServed / totalAttempted : 0;
  const readSuccessRate = totalReadAttempted > 0 ? totalReadServed / totalReadAttempted : 1;
  const writeSuccessRate = totalWriteAttempted > 0 ? totalWriteServed / totalWriteAttempted : 1;
  // backgroundSuccessRate defaults to 1 when no queues exist — keeps existing
  // lessons (no queue) passing without modification.
  const backgroundSuccessRate =
    totalBackgroundAttempted > 0 ? totalBackgroundServed / totalBackgroundAttempted : 1;

  return {
    ok: true,
    kind: 'flow',
    totalAttempted,
    totalServed,
    totalDropped,
    totalReadAttempted,
    totalWriteAttempted,
    totalReadServed,
    totalWriteServed,
    readSuccessRate,
    writeSuccessRate,
    successRate,
    avgLatency,
    avgP99Latency,
    totalBackgroundAttempted,
    totalBackgroundServed,
    backgroundSuccessRate,
    bottleneckNodeId: bottleneck,
    bottleneckLabel,
    warnings,
    perNode: Object.fromEntries(state),
  };
}


// ─── Composition simulator (Lesson 1) ───────────────────────────────────────
// Resources flow from CPU/RAM/Disk → Computer → Program.
// A Computer aggregates resources from any CPU/RAM/Disk reachable upstream.
// A Program is "hosted" if the Computer feeding it provides enough of each.

function simulateComposition(nodes, edges = []) {
  const warnings = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Group nodes by their parent Computer. A Computer's contents are its
  // direct children (nodes with parentNode === computer.id).
  const computers = nodes.filter((n) => n.data.type === 'computer');
  const routers = nodes.filter((n) => n.data.type === 'router');
  const phones = nodes.filter((n) => n.data.type === 'phone');
  const childrenByComputer = new Map(computers.map((c) => [c.id, []]));
  for (const n of nodes) {
    if (n.parentNode && childrenByComputer.has(n.parentNode)) {
      childrenByComputer.get(n.parentNode).push(n);
    }
  }

  // Aggregate hardware resources per Computer from its children.
  const computerResources = new Map();
  for (const c of computers) {
    let cores = 0, ramGb = 0, diskGb = 0;
    for (const child of childrenByComputer.get(c.id)) {
      if (child.data.type === 'cpu') cores += Number(child.data.config.cores) || 0;
      else if (child.data.type === 'ram') ramGb += Number(child.data.config.gb) || 0;
      else if (child.data.type === 'disk') diskGb += Number(child.data.config.gb) || 0;
    }
    computerResources.set(c.id, { cores, ramGb, diskGb });
  }

  // Programs include both 'program' (generic) and 'webServer'.
  const programs = nodes.filter((n) => n.data.type === 'program' || n.data.type === 'webServer');
  const programStatus = new Map();
  let allHosted = programs.length > 0;
  for (const p of programs) {
    if (!p.parentNode || !computerResources.has(p.parentNode)) {
      programStatus.set(p.id, { hosted: false, reason: 'not inside a Computer' });
      allHosted = false;
      const label = componentTypes[p.data.type].label;
      warnings.push(`A ${label} is not inside any Computer — drop it into the Computer box.`);
      continue;
    }
    const have = computerResources.get(p.parentNode);
    const need = {
      cores: Number(p.data.config.requires_cores) || 0,
      ramGb: Number(p.data.config.requires_ram_gb) || 0,
      diskGb: Number(p.data.config.requires_disk_gb) || 0,
    };
    const missing = [];
    if (have.cores < need.cores) missing.push(`${need.cores - have.cores} cores`);
    if (have.ramGb < need.ramGb) missing.push(`${need.ramGb - have.ramGb} GB RAM`);
    if (have.diskGb < need.diskGb) missing.push(`${need.diskGb - have.diskGb} GB disk`);
    const hosted = missing.length === 0;
    programStatus.set(p.id, {
      hosted,
      have,
      need,
      reason: hosted ? 'OK' : `short on ${missing.join(', ')}`,
    });
    if (!hosted) allHosted = false;
  }

  // Orphan hardware: a CPU / RAM / Disk not inside any Computer.
  let orphanCount = 0;
  for (const n of nodes) {
    if (['cpu', 'ram', 'disk'].includes(n.data.type)) {
      if (!n.parentNode || !computerResources.has(n.parentNode)) {
        orphanCount += 1;
        warnings.push(`${componentTypes[n.data.type].label} is not inside any Computer.`);
      }
    }
  }

  // LAN topology: a device is "on" a router's LAN if there's an edge between
  // them (undirected). The Router is no longer a container — it's a regular
  // node, and devices wire to it like any other connection.
  const routerIds = new Set(routers.map((r) => r.id));
  const lanIps = assignLanIps(nodes, edges);
  const wiredToAnyRouter = (id) => {
    const entry = lanIps.get(id);
    return entry != null && routerIds.has(entry.routerId);
  };
  const computersOnLan = computers.filter((c) => wiredToAnyRouter(c.id));
  const phonesOnLan = phones.filter((p) => wiredToAnyRouter(p.id));
  // Web Servers hosted on a Computer that's wired to a Router.
  const webServersOnLan = programs.filter(
    (p) =>
      p.data.type === 'webServer' &&
      programStatus.get(p.id)?.hosted &&
      p.parentNode &&
      wiredToAnyRouter(p.parentNode)
  );

  // ISP wiring: a Router's "WAN port" is modeled as an edge between the
  // Router and an ISP node. Routers wired to at least one ISP have internet
  // connectivity. Counted for Lesson 3's "Reach the Internet" check.
  const isps = nodes.filter((n) => n.data.type === 'isp');
  const ispIds = new Set(isps.map((i) => i.id));
  const routersWithIsp = new Set();
  for (const e of edges) {
    if (ispIds.has(e.source) && routerIds.has(e.target)) routersWithIsp.add(e.target);
    if (ispIds.has(e.target) && routerIds.has(e.source)) routersWithIsp.add(e.source);
  }

  // For each router, the list of device IPs on its LAN — used by the UI.
  const devicesByRouter = new Map(routers.map((r) => [r.id, []]));
  for (const [nodeId, entry] of lanIps.entries()) {
    if (nodeId === entry.routerId) continue;
    const list = devicesByRouter.get(entry.routerId);
    if (!list) continue;
    const dev = nodeMap.get(nodeId);
    list.push({
      id: nodeId,
      type: dev?.data?.type,
      label: dev ? componentTypes[dev.data.type]?.label : 'device',
      ip: entry.ip,
    });
  }

  const perNode = {};
  for (const n of nodes) {
    if (n.data.type === 'computer') {
      perNode[n.id] = {
        kind: 'computer',
        resources: computerResources.get(n.id),
        lanIp: lanIps.get(n.id) || null,
      };
    } else if (n.data.type === 'program' || n.data.type === 'webServer') {
      perNode[n.id] = { kind: 'program', ...programStatus.get(n.id) };
    } else if (n.data.type === 'router') {
      const ipEntry = lanIps.get(n.id);
      perNode[n.id] = {
        kind: 'router',
        cidr: ipEntry?.cidr || n.data.config.cidr || null,
        ip: ipEntry?.ip || null,
        devices: devicesByRouter.get(n.id) || [],
      };
    } else if (n.data.type === 'phone') {
      perNode[n.id] = { kind: 'phone', lanIp: lanIps.get(n.id) || null };
    }
  }

  return {
    ok: true,
    kind: 'composition',
    allHosted,
    orphanCount,
    programCount: programs.length,
    routerCount: routers.length,
    computersOnLanCount: computersOnLan.length,
    phonesOnLanCount: phonesOnLan.length,
    webServersOnLanCount: webServersOnLan.length,
    ispCount: isps.length,
    routersWithIspCount: routersWithIsp.size,
    warnings,
    perNode,
  };
}

// ─── Connectivity simulator (Lesson 2) ──────────────────────────────────────
// A Visitor reaches a VPS if the chain Visitor → Domain → DNS Record → VPS
// exists AND Domain.name matches Visitor.targetDomain AND DNSRecord.value
// matches VPS.ip.

function simulateConnectivity(nodes, edges) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const { outAdj } = buildAdjacency(nodes, edges);
  const warnings = [];

  const visitors = nodes.filter((n) => n.data.type === 'visitor');
  const visitorStatus = new Map();
  let allReach = visitors.length > 0;

  for (const v of visitors) {
    const target = (v.data.config.targetDomain || '').trim();
    const result = walkConnectivity(v.id, target, nodeMap, outAdj);
    visitorStatus.set(v.id, result);
    if (!result.reached) {
      allReach = false;
      warnings.push(`Visitor wanting ${target || '(no target)'} ${result.reason}.`);
    }
  }

  const perNode = {};
  for (const [id, s] of visitorStatus) perNode[id] = { kind: 'visitor', ...s };

  return {
    ok: true,
    kind: 'connectivity',
    allReach,
    visitorCount: visitors.length,
    warnings,
    perNode,
  };
}

function walkConnectivity(visitorId, target, nodeMap, outAdj) {
  // Step 1: visitor must connect to at least one Domain whose name matches.
  const toDomain = outAdj.get(visitorId).map((id) => nodeMap.get(id)).filter(Boolean);
  const domains = toDomain.filter((n) => n.data.type === 'domain');
  if (domains.length === 0) {
    return { reached: false, reason: "isn't wired to a Domain" };
  }
  const matchingDomains = domains.filter((d) => (d.data.config.name || '').trim() === target);
  if (matchingDomains.length === 0) {
    return { reached: false, reason: `is wired to a Domain that doesn't say "${target}"` };
  }

  // Step 2: domain must connect to at least one DNS Record.
  for (const d of matchingDomains) {
    const toDns = outAdj.get(d.id).map((id) => nodeMap.get(id)).filter(Boolean);
    const dnsRecords = toDns.filter((n) => n.data.type === 'dnsRecord');
    if (dnsRecords.length === 0) continue;

    // Step 3: DNS record must point to a VPS, and the IPs must match.
    for (const dns of dnsRecords) {
      const ip = (dns.data.config.value || '').trim();
      const toVps = outAdj.get(dns.id).map((id) => nodeMap.get(id)).filter(Boolean);
      const vpses = toVps.filter((n) => n.data.type === 'vps');
      if (vpses.length === 0) continue;
      const matchingVps = vpses.find((v) => (v.data.config.ip || '').trim() === ip);
      if (matchingVps) {
        return { reached: true, reason: `OK → ${matchingVps.data.config.ip}`, vpsId: matchingVps.id };
      }
    }
    return {
      reached: false,
      reason: `chain breaks at DNS: record's IP doesn't match any wired VPS`,
    };
  }
  return { reached: false, reason: `chain breaks: no DNS Record after Domain` };
}
