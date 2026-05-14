// Each puzzle kind dispatches to its own simulator. They share the graph shape
// (React Flow nodes + edges) but interpret semantics differently:
//   - flow: req/s propagation, capacity caps, latency accumulation.
//   - composition: resource aggregation. Does each Computer hold enough hardware
//     to satisfy the Programs it's hosting?
//   - connectivity: chain validation. Can every Visitor reach a VPS through a
//     matching Domain + DNS Record?

import { componentTypes, metaFor } from './componentTypes.js';
import { assignLanIps } from './lanIp.js';
import { runCustomProgram } from './customProgramExec.js';

export function simulate(puzzle, nodes, edges) {
  // Clone nodes upfront so internal mutations (Lesson 14 leader promotion,
  // _healthyReplicas counting) don't leak back into the caller's state.
  // Shallow-clone node + data + config; that's all we need to write to.
  nodes = nodes.map((n) => ({
    ...n,
    data: { ...n.data, config: { ...(n.data?.config || {}) } },
  }));

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

  // Lesson 14 — failure-driven leader promotion (Phase 3 of the Kafka
  // fault-tolerance story). For every failed Queue (a partition leader),
  // find a healthy kafkaReplica whose `replicaOf` points at it. Promote
  // that replica to act as the new leader: rewrite its type to 'queue',
  // copy the leader's config, and rebind every edge that referenced the
  // failed leader to reference the promoted replica instead. The leader
  // election is deterministic (first healthy replica by id).
  const promotionMap = new Map(); // failedLeaderId -> promoted replica id
  if (failedIds.size > 0) {
    for (const id of failedIds) {
      const leader = nodes.find((n) => n.id === id);
      if (!leader || leader.data?.type !== 'queue') continue;
      const candidates = nodes
        .filter(
          (n) =>
            n.data?.type === 'kafkaReplica' &&
            n.data?.config?.replicaOf === id &&
            !failedIds.has(n.id)
        )
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      if (candidates.length === 0) continue;
      const promoted = candidates[0];
      // Mutate the promoted node in place — type becomes a regular queue,
      // config inherits the failed leader's queue config. The original
      // kafkaReplica fields stay on data.config (harmless extras).
      promoted.data = {
        ...promoted.data,
        type: 'queue',
        config: { ...leader.data.config, ...promoted.data.config },
      };
      promotionMap.set(id, promoted.id);
    }
    if (promotionMap.size > 0) {
      edges = edges.map((e) => {
        const newSource = promotionMap.get(e.source) || e.source;
        const newTarget = promotionMap.get(e.target) || e.target;
        if (newSource === e.source && newTarget === e.target) return e;
        return { ...e, source: newSource, target: newTarget };
      });
    }
  }

  if (failedIds.size > 0) {
    nodes = nodes.filter((n) => !failedIds.has(n.id));
    edges = edges.filter((e) => !failedIds.has(e.source) && !failedIds.has(e.target));
  }

  // Lesson 14 Phase 1 — count the in-sync replicas backing each leader
  // Queue. We stash the count on the leader node itself so simulateFlow
  // can enforce minInsyncReplicas when computing accept capacity. After
  // promotion, replicas pointing at a former leader id move their
  // allegiance to the promoted replacement.
  for (const n of nodes) {
    if (n.data?.type === 'queue') n._healthyReplicas = 0;
  }
  for (const n of nodes) {
    if (n.data?.type !== 'kafkaReplica') continue;
    const oldLeader = n.data?.config?.replicaOf;
    if (!oldLeader) continue;
    const effectiveLeader = promotionMap.get(oldLeader) || oldLeader;
    const leaderNode = nodes.find((x) => x.id === effectiveLeader);
    if (leaderNode && leaderNode.data?.type === 'queue') {
      leaderNode._healthyReplicas = (leaderNode._healthyReplicas || 0) + 1;
    }
  }

  // Snapshot the visible-to-presence node list: includes decoratives,
  // excludes regions and failed. Used for `nodesByType` so presence
  // predicates can require decorative components like kafkaReplica /
  // kafkaController on Lesson 14 even though the sim ignores them.
  const visibleNodes = nodes;

  // Decorative components (e.g. Lesson 14's Kafka replica markers + KRaft
  // controller) are visual annotations: part of the architectural picture
  // but never on the request-flow path. Filter them and their edges out
  // before the sim sees the graph.
  const decorativeIds = new Set();
  for (const n of nodes) {
    const meta = componentTypes[n.data?.type];
    if (meta?.decorative) decorativeIds.add(n.id);
  }
  if (decorativeIds.size > 0) {
    nodes = nodes.filter((n) => !decorativeIds.has(n.id));
    edges = edges.filter((e) => !decorativeIds.has(e.source) && !decorativeIds.has(e.target));
  }
  const result = dispatch(puzzle, nodes, edges);
  if (result && result.ok) {
    result.nodesByType = countNodesByType(visibleNodes);
  }
  return result;
}

function dispatch(puzzle, nodes, edges) {
  switch (puzzle.kind) {
    case 'composition':
      return simulateComposition(nodes, edges);
    case 'connectivity':
      return simulateConnectivity(nodes, edges);
    case 'dataflow':
      return simulateDataflow(puzzle, nodes, edges);
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

function isPubsub(cfg) {
  // PropertyPanel only supports text/number props, so pubsub may come back
  // as a boolean (set via solution()/initialNodes) or the strings 'true' /
  // 'false' (set via the property panel). Treat both equivalents.
  return cfg?.pubsub === true || cfg?.pubsub === 'true';
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

    // CUSTOM PROGRAM: user JS replaces the standard capacity cap + role
    // dispatch. The function controls how much flow continues and how much
    // latency it adds. Outputs are clamped to [0, input] so a buggy function
    // can't manufacture traffic from nothing. Errors degrade to identity
    // passthrough and surface as warnings so the user sees what's wrong.
    if (node.data.type === 'customProgram') {
      const { output, error } = runCustomProgram(cfg.code || '', {
        readIn: effReads,
        writeIn: effWrites,
        totalIn: effReads + effWrites,
        latencyIn: worstParentLatency,
        p99LatencyIn: worstParentP99Latency,
      });
      const dl = cfg.displayLabel || meta.label;
      if (error) warnings.push(`${dl}: ${error}`);
      const readOut = Math.max(0, Math.min(effReads, output.readOut));
      const writeOut = Math.max(0, Math.min(effWrites, output.writeOut));
      s.readAccepted = readOut;
      s.writeAccepted = writeOut;
      s.readDropped += effReads - readOut;
      s.writeDropped += effWrites - writeOut;
      s.accepted = s.readAccepted + s.writeAccepted;
      s.dropped = s.readDropped + s.writeDropped;
      s.latencyToHere = worstParentLatency + Math.max(0, output.latencyAdd);
      s.p99LatencyToHere = worstParentP99Latency + Math.max(0, output.p99LatencyAdd);
      s.readContinuing = s.readAccepted;
      s.writeContinuing = s.writeAccepted;
      s.continuing = s.readContinuing + s.writeContinuing;
      // Skip standard capacity / role logic — the user function owned it.
      // Stranded-flow check still runs below, which is what we want: a
      // customProgram with no out-edge should drop its output.
      if (meta.role !== 'sink') {
        const outRead = readOutBySource.get(id) || 0;
        const outWrite = writeOutBySource.get(id) || 0;
        if (s.readContinuing > 0.01 && outRead === 0) {
          warnings.push(
            `${dl} has ${Math.round(s.readContinuing)} read req/s with no read-carrying out-edge.`
          );
          s.readDropped += s.readContinuing;
          s.readContinuing = 0;
        }
        if (s.writeContinuing > 0.01 && outWrite === 0) {
          warnings.push(
            `${dl} has ${Math.round(s.writeContinuing)} write req/s with no write-carrying out-edge.`
          );
          s.writeDropped += s.writeContinuing;
          s.writeContinuing = 0;
        }
        s.dropped = s.readDropped + s.writeDropped;
        s.continuing = s.readContinuing + s.writeContinuing;
      }
      continue;
    }

    // Apply capacity cap proportionally across (reads + writes).
    const cap = Number(cfg.capacity);
    let capacity = Number.isFinite(cap) && cap > 0 ? cap : Infinity;
    // Lesson 14 Phase 1 — ISR enforcement. When a Queue has acks='all'
    // and fewer in-sync replicas than minInsyncReplicas, writes can't
    // be ack'd: capacity collapses to 0. The check counts the leader
    // itself (1) plus healthy replica markers tagged with replicaOf.
    if (meta.role === 'queue' && cfg.acks === 'all') {
      const minISR = Number(cfg.minInsyncReplicas) || 1;
      const healthy = node._healthyReplicas || 0;
      if (1 + healthy < minISR) {
        capacity = 0;
      }
    }
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
    let p99Lat = cfg.p99Latency != null ? Number(cfg.p99Latency) : meanLat * 3;
    // Lesson 14 Phase 2 — acks-driven latency. acks='all' forces the
    // producer to wait for every in-sync replica to fetch, so the
    // effective p99 picks up (RF-1) follower-fetch hops (~5ms each is
    // a defensible round-number). acks=0/1 don't add anything. This is
    // grounded in network physics, not a fudge factor: more hops = more
    // latency, period.
    if (meta.role === 'queue' && cfg.acks === 'all') {
      const rf = Number(cfg.replicationFactor) || 1;
      p99Lat += Math.max(0, rf - 1) * 5;
    }
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
      // For pubsub queues (Kafka topics — Lesson 14), each downstream
      // out-edge is a separate consumer group, and each group is
      // *expected* to receive every event independently. So the
      // attempted count multiplies by out-degree. Default queue
      // semantics (work-queue, RabbitMQ-style, Lesson 8) keep 1:1 —
      // each event is delivered to exactly one consumer.
      if (isPubsub(cfg)) {
        const outDeg = outAdj.get(id).length || 1;
        totalBackgroundAttempted += s.accepted * outDeg;
      } else {
        totalBackgroundAttempted += s.accepted;
      }
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
        const parentNode = nodeMap.get(pid);
        const parentMeta = componentTypes[parentNode.data.type];
        const parentCfg = parentNode.data.config || {};
        // pubsub queues (Lesson 14 Kafka partitions) replicate output to
        // every downstream out-edge — each downstream is a separate
        // consumer group seeing the full stream. Default queue semantics
        // (Lesson 8 work-queue) split evenly across out-edges.
        if (parentMeta.role === 'queue' && isPubsub(parentCfg)) {
          asyncIn += ps.asyncContinuing;
        } else {
          const outDegree = outAdj.get(pid).length || 1;
          asyncIn += ps.asyncContinuing / outDegree;
        }
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

  // Distinct consumer-group tags across Worker nodes — used by Lesson 14's
  // hasMultipleConsumerGroups predicate. Workers without a consumerGroup
  // config aren't counted; this is a Kafka-specific notion.
  const groups = new Set();
  for (const n of nodes) {
    if (n.data?.type === 'service' && n.data?.config?.role === 'worker') {
      const g = n.data?.config?.consumerGroup;
      if (g) groups.add(g);
    }
  }
  const consumerGroupCount = groups.size;

  return {
    ok: true,
    kind: 'flow',
    consumerGroupCount,
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

// ─── Dataflow simulator (JS Sandbox track) ──────────────────────────────────
// Strings flow down each wire. Topo sort the graph; walk each node once:
//   - textInput  → emits its config.value
//   - customProgram → calls transform(stringInput), uses the return
//   - textOutput → captures the last string it received
//
// If the puzzle declares `testCases: [{input, expected}, ...]`, run the
// whole graph once per test case with `input` injected at each textInput
// (overriding their config.value) and grade the resulting textOutput
// value against `expected`. Returns per-case pass/fail + an aggregate
// `passedCount` for the requirements view.
//
// If no test cases, just run once with the textInputs' current values
// (the "playground" mode, useful for free experimentation).
function simulateDataflow(puzzle, nodes, edges) {
  const { outAdj, inAdj } = buildAdjacency(nodes, edges);
  const order = topoSort(nodes, outAdj, inAdj);
  if (!order) {
    return { ok: false, error: 'Graph has a cycle. Dataflow runs once top-to-bottom — remove circular wiring.' };
  }
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // One-pass walk. `inputOverrides` lets the test-case runner inject a
  // specific string at each textInput (override their config.value). Returns
  // { perNode, warnings, outputValue, outputNodeId, programErrors }.
  function runOnce(inputOverrides = null) {
    const value = new Map(); // nodeId -> string emitted by that node
    const warnings = [];
    const programErrors = []; // { id, label, error }
    let outputValue = null;
    let outputNodeId = null;

    for (const id of order) {
      const node = nodeMap.get(id);
      const cfg = node.data.config || {};
      const type = node.data.type;
      if (type === 'textInput') {
        const v = inputOverrides != null
          ? String(inputOverrides)
          : (cfg.value != null ? String(cfg.value) : '');
        value.set(id, v);
        continue;
      }
      // Everything else pulls from upstream. If multiple upstreams exist
      // we pick the FIRST one that produced a value — dataflow puzzles in
      // v1 are single-input. Multi-input shapes need a merge node.
      const parents = inAdj.get(id) || [];
      let upstream = null;
      for (const pid of parents) {
        if (value.has(pid)) {
          upstream = value.get(pid);
          break;
        }
      }
      if (type === 'customProgram') {
        if (upstream == null) {
          warnings.push(`${cfg.displayLabel || 'Custom Program'} has no input wired in — it can't run.`);
          continue;
        }
        const result = runDataflowProgram(cfg.code || '', upstream);
        if (result.error) {
          programErrors.push({
            id,
            label: cfg.displayLabel || 'Custom Program',
            error: result.error,
          });
          warnings.push(`${cfg.displayLabel || 'Custom Program'}: ${result.error}`);
        }
        value.set(id, result.value);
        continue;
      }
      if (type === 'textOutput') {
        if (upstream == null) {
          warnings.push('Text Output has no input wired in — there\'s nothing to display.');
          continue;
        }
        value.set(id, upstream);
        // First textOutput in topo order is the "result" for grading. Later
        // outputs are still recorded in perNode for display, just not graded.
        if (outputValue == null) {
          outputValue = upstream;
          outputNodeId = id;
        }
        continue;
      }
      // Unknown type in a dataflow puzzle — pass-through if we can.
      if (upstream != null) value.set(id, upstream);
    }

    const perNode = {};
    for (const [id, v] of value) {
      perNode[id] = { kind: 'dataflowValue', value: v };
    }
    return { perNode, warnings, outputValue, outputNodeId, programErrors };
  }

  // Test-case mode: run once per case, grade against `expected`.
  const cases = Array.isArray(puzzle.testCases) ? puzzle.testCases : [];
  if (cases.length > 0) {
    const caseResults = cases.map((tc) => {
      const r = runOnce(tc.input);
      const passed = r.outputValue === tc.expected;
      return {
        input: tc.input,
        expected: tc.expected,
        actual: r.outputValue,
        passed,
        warnings: r.warnings,
        programErrors: r.programErrors,
      };
    });
    // Per-node display: re-run with the live (un-overridden) values so the
    // canvas reflects what's currently in the textInputs. Lets the player
    // play with inputs and see the canvas-side output update on Run.
    const playground = runOnce(null);
    return {
      ok: true,
      kind: 'dataflow',
      caseResults,
      passedCount: caseResults.filter((c) => c.passed).length,
      totalCount: caseResults.length,
      perNode: playground.perNode,
      warnings: playground.warnings,
      playgroundOutput: playground.outputValue,
    };
  }

  // No test cases — just the playground run.
  const playground = runOnce(null);
  return {
    ok: true,
    kind: 'dataflow',
    caseResults: [],
    passedCount: 0,
    totalCount: 0,
    perNode: playground.perNode,
    warnings: playground.warnings,
    playgroundOutput: playground.outputValue,
  };
}

// Run a customProgram's code in dataflow mode: transform(input) takes a
// string and returns a string. Mirrors customProgramExec.js but with the
// dataflow signature instead of the flow {readIn, writeIn, ...} shape.
// Same safety model: single-user, page-scope new Function() acceptable.
function runDataflowProgram(code, input) {
  if (typeof code !== 'string' || code.trim() === '') {
    return { value: String(input), error: null };
  }
  let transform;
  try {
    const body = `${code}\n;return typeof transform === 'function' ? transform : null;`;
    // eslint-disable-next-line no-new-func
    transform = new Function(body)();
  } catch (e) {
    return { value: String(input), error: `Compile: ${e.message || String(e)}` };
  }
  if (typeof transform !== 'function') {
    return {
      value: String(input),
      error: 'No `function transform(input)` found — define one to control the output.',
    };
  }
  let out;
  try {
    out = transform(input);
  } catch (e) {
    return { value: String(input), error: `Run: ${e.message || String(e)}` };
  }
  // Coerce any return to a string so wires never carry undefined/object.
  // The lesson framing is "user code is a serializer — return strings."
  if (out == null) return { value: '', error: null };
  if (typeof out === 'string') return { value: out, error: null };
  return { value: String(out), error: null };
}
