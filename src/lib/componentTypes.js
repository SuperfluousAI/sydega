// Each component type is a node on the canvas.
// `defaults` seeds editable props; `props` is the schema the property panel renders.
// `role` is metadata each simulator interprets in its own way:
//   - flow: source = traffic generator; sink = responder; cache = read-hit
//     terminator; queue = async boundary (closes the sync path, opens a
//     background path that Workers drain).
//   - composition: source = resource provider; sink = resource consumer.
//   - connectivity: source = visitor; sink = endpoint (e.g. VPS).
// `hasInput` / `hasOutput` drive which React Flow handles are rendered.

export const componentTypes = {
  // ─── Lesson 1: Build a Computer (composition) ─────────────────────────────
  program: {
    label: 'Program',
    color: '#a78bfa',
    role: 'sink',
    hasInput: true,
    hasOutput: true,
    defaults: { requires_cores: 4, requires_ram_gb: 8, requires_disk_gb: 50 },
    props: [
      { key: 'requires_cores', label: 'Needs CPU cores', type: 'number', min: 1, step: 1 },
      { key: 'requires_ram_gb', label: 'Needs RAM (GB)', type: 'number', min: 1, step: 1 },
      { key: 'requires_disk_gb', label: 'Needs disk (GB)', type: 'number', min: 1, step: 10 },
    ],
  },
  cpu: {
    label: 'CPU',
    color: '#f472b6',
    role: 'source',
    hasInput: false,
    hasOutput: true,
    defaults: { cores: 4 },
    props: [
      { key: 'cores', label: 'Cores', type: 'number', min: 1, step: 1 },
    ],
  },
  ram: {
    label: 'RAM',
    color: '#22d3ee',
    role: 'source',
    hasInput: false,
    hasOutput: true,
    defaults: { gb: 8 },
    props: [
      { key: 'gb', label: 'Capacity (GB)', type: 'number', min: 1, step: 1 },
    ],
  },
  disk: {
    label: 'Disk',
    color: '#facc15',
    role: 'source',
    hasInput: false,
    hasOutput: true,
    defaults: { gb: 100 },
    props: [
      { key: 'gb', label: 'Capacity (GB)', type: 'number', min: 1, step: 10 },
    ],
  },
  computer: {
    label: 'Computer',
    color: '#94a3b8',
    role: 'passthrough',
    // A Computer participates in wiring (it can be plugged into a Router for
    // the LAN model). Floating edges anchor on the perimeter, so the player
    // never sees explicit handle dots on the Computer — the wire just attaches.
    hasInput: true,
    hasOutput: true,
    container: true,
    nodeStyle: { width: 340, height: 220 },
    defaults: {},
    props: [],
  },
  router: {
    label: 'Router',
    color: '#7c3aed',
    role: 'passthrough',
    hasInput: true,
    hasOutput: true,
    // Router admin UI listens on a port (real home routers do this — typically
    // 80 or 8080 for the web admin). The port is editable from the dot-menu
    // or the property panel.
    defaults: { ssid: 'home-wifi', cidr: '192.168.1.0/24', port: 80 },
    props: [
      { key: 'ssid', label: 'Network name (SSID)', type: 'text' },
      { key: 'cidr', label: 'LAN CIDR', type: 'text' },
      { key: 'port', label: 'Admin port', type: 'number', min: 1, max: 65535, step: 1 },
    ],
  },
  phone: {
    label: 'Phone',
    color: '#22d3ee',
    role: 'source',
    hasInput: false,
    hasOutput: true,
    defaults: {},
    props: [],
  },
  webServer: {
    label: 'Web Server',
    color: '#a78bfa',
    role: 'sink',
    hasInput: true,
    hasOutput: true,
    // `port` is a function so a fresh value is generated per-instance —
    // each Web Server gets a random ephemeral port. See defaultsFor().
    defaults: {
      requires_cores: 2,
      requires_ram_gb: 4,
      requires_disk_gb: 20,
      port: randomEphemeralPort,
    },
    props: [
      { key: 'requires_cores', label: 'Needs CPU cores', type: 'number', min: 1, step: 1 },
      { key: 'requires_ram_gb', label: 'Needs RAM (GB)', type: 'number', min: 1, step: 1 },
      { key: 'requires_disk_gb', label: 'Needs disk (GB)', type: 'number', min: 1, step: 10 },
      { key: 'port', label: 'Listening port', type: 'number', min: 1, max: 65535, step: 1 },
    ],
  },

  // ─── Lesson 3: Reach the Internet (composition extended) ─────────────────
  // ISPs are the providers that connect home networks to the wider internet.
  // Modeled as a passthrough — wires from a Router's WAN side to "outside."
  // The composition simulator detects Router → ISP wiring and reports it.
  // Real ISPs do BGP, NAT, traffic engineering — we abstract all of that.
  isp: {
    label: 'ISP',
    color: '#1e40af',
    role: 'passthrough',
    hasInput: true,
    hasOutput: true,
    defaults: { name: 'Comcast', publicIpBlock: '203.0.113.0/24' },
    props: [
      { key: 'name', label: 'ISP name', type: 'text' },
      { key: 'publicIpBlock', label: 'Public IP block (CIDR)', type: 'text' },
    ],
  },

  // ─── Lesson 2: Point a Domain at a VPS (connectivity) ─────────────────────
  visitor: {
    label: 'Visitor',
    color: '#6366f1',
    role: 'source',
    hasInput: false,
    hasOutput: true,
    defaults: { targetDomain: 'myapp.com' },
    props: [
      { key: 'targetDomain', label: 'Wants to visit', type: 'text' },
    ],
  },
  domain: {
    label: 'Domain',
    color: '#fb923c',
    role: 'passthrough',
    hasInput: true,
    hasOutput: true,
    defaults: { name: 'myapp.com' },
    props: [
      { key: 'name', label: 'Domain name', type: 'text' },
    ],
  },
  dnsRecord: {
    label: 'DNS Record',
    color: '#fbbf24',
    role: 'passthrough',
    hasInput: true,
    hasOutput: true,
    defaults: { recordType: 'A', value: '1.2.3.4' },
    props: [
      { key: 'recordType', label: 'Record type', type: 'text' },
      { key: 'value', label: 'Points to (IP)', type: 'text' },
    ],
  },
  vps: {
    label: 'VPS',
    color: '#34d399',
    role: 'sink',
    hasInput: true,
    hasOutput: false,
    defaults: { ip: '1.2.3.4', capacity: 1000, latency: 25, p99Latency: 75 },
    props: [
      { key: 'ip', label: 'Public IP', type: 'text' },
      { key: 'capacity', label: 'Capacity (req/s)', type: 'number', min: 1, step: 100 },
      { key: 'latency', label: 'Mean added latency (ms)', type: 'number', min: 0, step: 1 },
      { key: 'p99Latency', label: 'p99 added latency (ms)', type: 'number', min: 0, step: 1 },
    ],
  },

  // ─── Lesson 3 & 4: Flow components (existing) ─────────────────────────────
  client: {
    label: 'Client',
    color: '#6366f1',
    role: 'source',
    hasInput: false,
    hasOutput: true,
    defaults: { rps: 100, readRatio: 0.9 },
    props: [
      { key: 'rps', label: 'Requests / sec', type: 'number', min: 1, max: 1_000_000, step: 50 },
      { key: 'readRatio', label: 'Read ratio', type: 'number', min: 0, max: 1, step: 0.05 },
    ],
  },
  loadBalancer: {
    label: 'Load Balancer',
    color: '#0ea5e9',
    role: 'passthrough',
    hasInput: true,
    hasOutput: true,
    defaults: { capacity: 50_000, latency: 1, p99Latency: 3 },
    props: [
      { key: 'capacity', label: 'Capacity (req/s)', type: 'number', min: 1, step: 1000 },
      { key: 'latency', label: 'Mean added latency (ms)', type: 'number', min: 0, step: 1 },
      { key: 'p99Latency', label: 'p99 added latency (ms)', type: 'number', min: 0, step: 1 },
    ],
  },
  // The unified service type. App Servers, Workers, and any future
  // request-handler-shaped components (API Gateway, Notification Service,
  // Cron Job, etc.) all live here, distinguished by `config.role`. See
  // caveats.md #8 for the rationale. The flow-sim role is 'passthrough'
  // for all sub-roles — the simulator math is identical; what differs is
  // what's upstream (sync requests vs. async queue draining).
  service: {
    role: 'passthrough',
    hasInput: true,
    hasOutput: true,
    // Shared props across all roles. Per-role defaults override these
    // values; per-role props can extend in the future if a role needs
    // fields the others don't.
    props: [
      { key: 'capacity', label: 'Capacity (req/s)', type: 'number', min: 1, step: 50 },
      { key: 'latency', label: 'Mean added latency (ms)', type: 'number', min: 0, step: 1 },
      { key: 'p99Latency', label: 'p99 added latency (ms)', type: 'number', min: 0, step: 1 },
    ],
    // Per-role display + default values. metaFor(node) merges base + role.
    roles: {
      appServer: {
        label: 'App Server',
        color: '#10b981',
        defaults: { capacity: 500, latency: 20, p99Latency: 60 },
      },
      worker: {
        label: 'Worker',
        color: '#fbbf24',
        // Workers process async jobs from a Queue. Slower per-job than
        // sync request handlers (background work tends to be heavier),
        // lower throughput per instance, longer p99 tail.
        // `consumerGroup` is Kafka-specific (Lesson 14): tag this worker
        // with a group name so the sim can count distinct consumer
        // groups across the canvas.
        defaults: { capacity: 50, latency: 100, p99Latency: 300, consumerGroup: '' },
        props: [
          { key: 'consumerGroup', label: 'Consumer group (Kafka — Lesson 14)', type: 'text' },
        ],
      },
    },
  },
  // A Queue marks the async boundary in the flow simulator. Sync traffic
  // wired *into* a Queue is considered handled — the producer doesn't wait
  // for downstream work to finish, only for the enqueue to succeed. Edges
  // *out* of a Queue are the background path (typically wired to a Worker
  // service). See Step 3 of the FAANG-prep build for the actual sim logic.
  // v1 has no internal capacity — the queue absorbs whatever it receives.
  //
  // `replicationFactor` and `acks` are teaching aids surfaced when the Queue
  // is used as a Kafka partition (Lesson 14). They don't affect the sim:
  // we don't model leader-follower replication or acks=all durability. They
  // exist in the property panel so a student sees the vocabulary and the
  // values (RF=3, acks=all) that match real Kafka deployments. The lesson
  // copy + simplifications.md explain the semantics.
  queue: {
    label: 'Queue',
    color: '#06b6d4',
    role: 'queue',
    hasInput: true,
    hasOutput: true,
    // `pubsub: true` switches the queue's async fanout from work-queue
    // semantics (split events across out-edges; Lesson 8, RabbitMQ-style)
    // to pub/sub semantics (replicate every event to every out-edge;
    // Lesson 14, Kafka partition + multiple consumer groups). Default
    // false to preserve Lesson 8's behavior.
    //
    // `minInsyncReplicas` (Lesson 14) — when acks=all, writes require this
    // many in-sync replicas (counting the leader itself). The sim counts
    // (1 if leader healthy) + (healthy kafkaReplica nodes where
    // replicaOf === this Queue's id). If below threshold, writes drop.
    // Default 2 matches the canonical RF=3 production setting.
    defaults: {
      topic: 'events',
      replicationFactor: 3,
      acks: 'all',
      pubsub: false,
      // Default 1 → effectively disabled (leader alone always satisfies).
      // Kafka-style lessons (Lesson 14) explicitly set 2 on their Queues
      // to engage the ISR enforcement path; older lessons (Lesson 8,
      // asyncNotifications) leave the default and aren't affected.
      minInsyncReplicas: 1,
    },
    props: [
      { key: 'topic', label: 'Topic / Queue name', type: 'text' },
      { key: 'replicationFactor', label: 'Replication factor (teaching aid)', type: 'number', min: 1, step: 1 },
      { key: 'acks', label: 'Producer acks: 0 | 1 | all', type: 'text' },
      { key: 'minInsyncReplicas', label: 'min.insync.replicas (acks=all enforces this)', type: 'number', min: 1, step: 1 },
      { key: 'pubsub', label: 'Pub/sub (true = Kafka topic; false = work queue)', type: 'text' },
    ],
  },
  // Unified cache type — `internal` (Redis/Memcached-style query/data cache,
  // sits between App and DB) and `cdn` (edge cache, sits *before* the LB, for
  // static content). Both are flow-sim `role: 'cache'` — they absorb reads at
  // a hit rate, pass writes through. Differences are config-only: CDNs have
  // higher hit rate, lower latency (geographically closer), bigger capacity.
  // See caveats.md #8 + simplifications.md for the unification rationale.
  // ─── Lesson 13 building blocks: Rate Limiter + Key Generation Service ───
  // Both are passthroughs structurally but pedagogically distinct from a
  // Load Balancer. They live in their own types because their *placement* +
  // *intent* differ — and that placement is what the lesson teaches.

  // A Rate Limiter sits at the gateway — between the public internet (or
  // CDN-misses) and the LB / origin servers. Its capacity represents the
  // per-second request budget; traffic above that gets dropped (real systems
  // return 429 Too Many Requests). v1 abstracts per-client tracking: the
  // capacity here is a global rate limit, not per-client.
  rateLimiter: {
    label: 'Rate Limiter',
    color: '#f97316',
    role: 'passthrough',
    hasInput: true,
    hasOutput: true,
    defaults: { capacity: 100_000, latency: 1, p99Latency: 3 },
    props: [
      { key: 'capacity', label: 'Rate limit (req/s)', type: 'number', min: 1, step: 1000 },
      { key: 'latency', label: 'Mean added latency (ms)', type: 'number', min: 0, step: 1 },
      { key: 'p99Latency', label: 'p99 added latency (ms)', type: 'number', min: 0, step: 1 },
    ],
  },

  // A Key Generation Service vends pre-generated short IDs for URL writes.
  // Sits on the WRITE PATH between App Servers and the URL Database. Real
  // KGS implementations pre-generate a pool of 7-char base62 keys offline,
  // serve them at runtime, and track which are used — eliminating collision
  // checks at write time. We model the rate at which it can vend keys via
  // `keysPerSec`. acceptsReads:false because KGS only sits in the write path;
  // accidentally wiring reads through it surfaces an actionable warning.
  kgs: {
    label: 'KGS',
    color: '#64748b',
    role: 'passthrough',
    hasInput: true,
    hasOutput: true,
    acceptsReads: false,
    acceptsWrites: true,
    defaults: { keyPoolSize: 1_000_000_000, capacity: 500, latency: 2, p99Latency: 5 },
    props: [
      { key: 'keyPoolSize', label: 'Pre-generated key pool size', type: 'number', min: 1, step: 1_000_000 },
      { key: 'capacity', label: 'Keys vended per sec', type: 'number', min: 1, step: 50 },
      { key: 'latency', label: 'Mean added latency (ms)', type: 'number', min: 0, step: 1 },
      { key: 'p99Latency', label: 'p99 added latency (ms)', type: 'number', min: 0, step: 1 },
    ],
  },

  cache: {
    role: 'cache',
    hasInput: true,
    hasOutput: true,
    props: [
      { key: 'capacity', label: 'Capacity (req/s)', type: 'number', min: 1, step: 1000 },
      { key: 'latency', label: 'Mean added latency (ms)', type: 'number', min: 0, step: 1 },
      { key: 'p99Latency', label: 'p99 added latency (ms)', type: 'number', min: 0, step: 1 },
      { key: 'hitRate', label: 'Hit rate', type: 'number', min: 0, max: 1, step: 0.05 },
    ],
    roles: {
      internal: {
        label: 'Cache',
        color: '#f59e0b',
        defaults: { capacity: 50_000, latency: 2, p99Latency: 6, hitRate: 0.8 },
      },
      cdn: {
        label: 'CDN',
        color: '#ec4899',
        // CDNs absorb truly massive load — Cloudflare / Akamai PoPs handle
        // millions of req/s globally. Modeled as a single virtual node here
        // (we don't model geographic regions). Hit rate is high for static
        // content (images, JS bundles, cached HTML); tail latency is low
        // because traffic terminates near the user.
        defaults: { capacity: 1_000_000, latency: 1, p99Latency: 5, hitRate: 0.95 },
      },
    },
  },
  database: {
    label: 'Database',
    color: '#ef4444',
    role: 'sink',
    acceptsReads: true,
    acceptsWrites: true,
    hasInput: true,
    hasOutput: false,
    defaults: { capacity: 1_000, latency: 30, p99Latency: 90 },
    props: [
      { key: 'capacity', label: 'Capacity (req/s)', type: 'number', min: 1, step: 100 },
      { key: 'latency', label: 'Mean added latency (ms)', type: 'number', min: 0, step: 1 },
      { key: 'p99Latency', label: 'p99 added latency (ms)', type: 'number', min: 0, step: 1 },
    ],
  },
  readReplica: {
    label: 'Read Replica',
    color: '#fb7185',
    role: 'sink',
    acceptsReads: true,
    acceptsWrites: false,
    hasInput: true,
    hasOutput: false,
    defaults: { capacity: 1_000, latency: 30, p99Latency: 90 },
    props: [
      { key: 'capacity', label: 'Capacity (req/s)', type: 'number', min: 1, step: 100 },
      { key: 'latency', label: 'Mean added latency (ms)', type: 'number', min: 0, step: 1 },
      { key: 'p99Latency', label: 'p99 added latency (ms)', type: 'number', min: 0, step: 1 },
    ],
  },

  // ─── Lesson 14 decorative components (Kafka replica + controller) ───────
  // `decorative: true` means the simulator skips these nodes and any edges
  // touching them. They exist purely so the canvas can depict architectural
  // elements that don't carry request flow but are part of the answer a
  // candidate would draw on a whiteboard. The simulator filters them out
  // upfront (see simulator.js).
  kafkaReplica: {
    label: 'Replica',
    color: '#a5f3fc',
    role: 'decorative',
    decorative: true,
    hasInput: false,
    hasOutput: false,
    // `replicaOf` points to the leader Queue's id this replica backs up.
    // The sim uses it for two things: (1) min.insync.replicas enforcement
    // — count healthy replicas pointing at a leader; (2) failure-driven
    // leader promotion — when the named leader is failed, the sim
    // promotes the first healthy replica with this replicaOf to take over.
    defaults: { partition: '0', broker: '0', isLeader: 'no', replicaOf: '' },
    props: [
      { key: 'partition', label: 'Partition ID', type: 'text' },
      { key: 'broker', label: 'Broker ID', type: 'text' },
      { key: 'isLeader', label: 'Leader? (yes / no)', type: 'text' },
      { key: 'replicaOf', label: 'Backs up which leader Queue (id)', type: 'text' },
    ],
  },
  kafkaController: {
    label: 'KRaft Controllers',
    color: '#94a3b8',
    role: 'decorative',
    decorative: true,
    hasInput: false,
    hasOutput: false,
    defaults: {},
    props: [],
  },
};

export function defaultsFor(typeKey, role) {
  // Materialize per-instance defaults by calling any function-valued entries.
  // This lets defaults like `port: () => randomPort()` produce a fresh value
  // per node instead of sharing one across every dropped Web Server.
  //
  // For typed-with-role components (currently just `service`), the role's
  // own defaults override the base defaults; `role` itself is baked into
  // the returned config so the node persists which sub-kind it is.
  const meta = componentTypes[typeKey];
  if (!meta) return {};
  const baseSrc = meta.defaults || {};
  const roleSrc = role && meta.roles?.[role]?.defaults ? meta.roles[role].defaults : {};
  const src = { ...baseSrc, ...roleSrc };
  const out = {};
  for (const k of Object.keys(src)) {
    const v = src[k];
    out[k] = typeof v === 'function' ? v() : v;
  }
  if (role && meta.roles?.[role]) out.role = role;
  return out;
}

// Display metadata for a rendered node — merges base type + per-role overrides.
// Most call sites that previously did `componentTypes[node.data.type]` should
// switch to this so role-aware components (service.appServer vs service.worker)
// render with the right label/color/info.
export function metaFor(node) {
  const meta = componentTypes[node?.data?.type];
  if (!meta) return null;
  const role = node?.data?.config?.role;
  if (meta.roles && role && meta.roles[role]) {
    const merged = { ...meta, ...meta.roles[role], role };
    // Role-specific props extend the base type's props (don't replace).
    // Used by Lesson 14: only the Worker role gets the `consumerGroup`
    // field; AppServers don't see it.
    if (meta.roles[role].props) {
      merged.props = [...(meta.props || []), ...meta.roles[role].props];
    }
    return merged;
  }
  return meta;
}

// Same idea for palette entries, which are either a typeKey string or an
// object `{ type, role }`. Returns a merged meta + the role for the entry.
export function paletteMetaFor(entry) {
  const { type, role } = parsePaletteEntry(entry);
  const base = componentTypes[type];
  if (!base) return null;
  if (base.roles && role && base.roles[role]) {
    return { ...base, ...base.roles[role], role };
  }
  return base;
}

export function parsePaletteEntry(entry) {
  if (typeof entry === 'string') return { type: entry, role: undefined };
  if (entry && typeof entry === 'object') return { type: entry.type, role: entry.role };
  return { type: undefined, role: undefined };
}

function randomEphemeralPort() {
  // RFC 6335 "dynamic / private" port range.
  return 49152 + Math.floor(Math.random() * (65535 - 49152 + 1));
}
