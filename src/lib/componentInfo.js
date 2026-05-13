// Pedagogical info for each component type — what it is, how to use it, how
// it connects. Surfaced in the bottom information pane when a node is
// selected. Lesson 3 entries (visitor/domain/dnsRecord/vps) get extra care
// because operator's wife-test surfaced that the connectivity chain was the
// hardest to grok from the canvas alone.
//
// Shape: { description, usage, connects, realWorld? }
//   description : 1 sentence: what is this thing.
//   usage       : how to use it in puzzles.
//   connects    : human-readable wiring guidance.
//   realWorld   : optional analog to real infrastructure.

export const componentInfo = {
  // ─── Lesson 1: Build a Computer ─────────────────────────────────────────
  program: {
    description: 'A unit of code — an app, a script, or a service — that runs on a Computer.',
    usage:
      'Drop a Program inside a Computer that meets its CPU / RAM / disk requirements. ' +
      'The Computer\'s combined hardware must be at least as much as the Program needs, or it can\'t run.',
    connects: 'Lives inside a Computer (drag it onto the Computer box). Doesn\'t wire to anything in Lesson 1.',
  },
  cpu: {
    description: 'Processing cores. A Program runs only when its required core count is met by the Computer\'s combined CPUs.',
    usage: 'Drop inside a Computer. Multiple CPUs in the same Computer stack their core counts.',
    connects: 'Lives inside a Computer. Doesn\'t wire — composition is "is inside," not "is connected to."',
  },
  ram: {
    description: 'Working memory. Programs use RAM for the data they\'re actively working on.',
    usage: 'Drop inside a Computer. Multiple RAM units in the same Computer stack capacity.',
    connects: 'Lives inside a Computer. Doesn\'t wire.',
  },
  disk: {
    description: 'Long-term storage. Keeps a Program\'s data even when the power is off.',
    usage: 'Drop inside a Computer. Multiple disks stack capacity.',
    connects: 'Lives inside a Computer. Doesn\'t wire.',
  },
  computer: {
    description: 'A machine that runs programs. Holds CPU, RAM, and Disk inside; a Program runs only if the Computer has enough of each.',
    usage:
      'Drop the Computer on the canvas, then drag hardware (CPU / RAM / Disk) and a Program into it. ' +
      'In Lesson 2 onward, you also wire the Computer to a Router to join a LAN.',
    connects: 'Wires to a Router (Lesson 2). Until then, it\'s a self-contained box.',
    realWorld: 'A laptop, a desktop, a server rack — the physical metaphor is the same.',
  },
  router: {
    description: 'A device that creates a LAN. Hands out an IP address from its CIDR pool to every device wired to it.',
    usage:
      'Wire Computers and Phones to it. Every wired device gets an IP from the Router\'s pool (default 192.168.1.0/24), ' +
      'and they can talk to each other through the Router.',
    connects: 'Devices wire to the Router from any side. Direction doesn\'t matter for LAN membership.',
    realWorld: 'Your home WiFi router. Devices on it get IPs like 192.168.1.42, and the wider internet can\'t reach in.',
  },
  phone: {
    description: 'A device on the LAN. A reasonable stand-in for any other client on the home network.',
    usage: 'Wire to a Router. Then it can reach other devices on the same LAN.',
    connects: 'Wires to a Router.',
  },
  webServer: {
    description: 'A program that listens for HTTP requests on a port and responds. The thing that actually serves your website.',
    usage:
      'Drop inside a Computer that has enough hardware. The Computer in turn needs to be on the LAN ' +
      '(wired to the Router) for other devices to reach the Web Server.',
    connects: 'Hosted inside a Computer. The Computer wires to a Router.',
    realWorld: 'Nginx, Apache, Express, FastAPI — anything that opens a socket on a port and answers requests.',
  },

  // ─── Lesson 3: Reach the Internet (composition extended) ────────────────
  isp: {
    description:
      'An Internet Service Provider — the company that connects your home network to the wider internet. ' +
      'Your Router\'s "WAN" port wires to your ISP; your ISP\'s network in turn connects to other ISPs (the internet).',
    usage:
      'Drop an ISP on the canvas and wire your Router to it. Without an ISP, your home LAN is islanded — devices ' +
      'can talk to each other, but nothing can reach the wider internet.',
    connects: 'Wires from a Router (the WAN side of your home network).',
    realWorld: 'Comcast, AT&T, Verizon, Spectrum, Lumen, Cogent — the companies that own the cables. Each ISP also peers with other ISPs to form "the internet" — see Lesson 4.',
  },

  // ─── Lesson 3: Point a Domain at a VPS (connectivity) ───────────────────
  // Heavier copy here because the wife-test surfaced confusion: it's a chain
  // where each link's "points to" must match the next one's IP. The visual
  // graph doesn't make the matching constraint obvious; the info pane does.
  visitor: {
    description: 'Someone on the public internet trying to reach your site. They type a domain into their browser.',
    usage:
      'Set the domain the Visitor is trying to reach (e.g. myapp.com). For the Visitor to actually arrive, ' +
      'the chain Visitor → Domain → DNS Record → VPS must be complete AND every link must match the next.',
    connects: 'Wires to a Domain. The Visitor only knows the name (e.g. myapp.com) — they don\'t know any IPs.',
  },
  domain: {
    description: 'A human-readable name like myapp.com. You register it with a domain registrar.',
    usage:
      'Set its name (e.g. myapp.com). For the chain to work, the Visitor\'s target domain must match this name exactly.',
    connects: 'Wires from a Visitor on one side, to a DNS Record on the other. The Domain doesn\'t know any IPs by itself — it points at a DNS Record that does.',
    realWorld: 'Bought from a registrar like Namecheap or GoDaddy. A name without DNS records is a name pointing at nothing.',
  },
  dnsRecord: {
    description: 'The lookup that maps a domain name to an IP address. The bridge between names and addresses.',
    usage:
      'Set its "Points to (IP)" field to the IP of the destination VPS. If the IP here doesn\'t match the VPS\'s public IP, ' +
      'the chain breaks and the Visitor lands nowhere. This is the most common source of "why isn\'t my site loading?" confusion.',
    connects: 'Wires from a Domain on one side, to a VPS on the other.',
    realWorld: 'An "A record" at your registrar or DNS provider. Real DNS records also include MX (email), CNAME (alias), etc.',
  },
  vps: {
    description: 'Virtual Private Server — an always-on computer somewhere on the internet, identified by a public IP.',
    usage:
      'Set its public IP. The DNS Record\'s "Points to" must match this IP exactly. The VPS is where the request actually lands.',
    connects: 'Wires from a DNS Record. Itself doesn\'t connect to anything further in Lesson 3 — it\'s the endpoint.',
    realWorld: 'AWS EC2, DigitalOcean Droplets, Linode, Hetzner — all VPSes. Each has a public IP you point your domain at.',
  },

  // ─── Lesson 13 building blocks: Rate Limiter + KGS ──────────────────────
  rateLimiter: {
    description:
      'A gateway component that drops traffic above a per-second rate. Sits at the edge of your origin, ' +
      'protecting downstream from abuse (DDoS, scraping, runaway clients). Real implementations track per-IP / per-API-key buckets.',
    usage:
      'Place between the public internet (or a CDN) and your Load Balancer. Set the capacity to your acceptable request rate; ' +
      'traffic above that threshold drops. The Rate Limiter is cheap (low latency) but load-bearing — without it, an abusive ' +
      'client can saturate your origin.',
    connects: 'Wires from a Client (or CDN miss-path) on the input side, to a Load Balancer on the output side.',
    realWorld: 'AWS WAF rate-based rules, Cloudflare Rate Limiting, Envoy/Istio rate-limit filters, NGINX limit_req — the gateway-layer abuse guard.',
  },
  kgs: {
    description:
      'A Key Generation Service — pre-generates the short IDs your URL shortener vends. Lives on the write path, between ' +
      'the App Server and the URL Database. By pre-generating IDs offline, it eliminates collision checks at write time ' +
      '(no DB roundtrip per write to check "is this ID taken?").',
    usage:
      'Wire App Servers to the KGS for the write path. The KGS\'s capacity is the rate at which it can vend new keys. Reads ' +
      'don\'t go through the KGS — accidentally routing reads here will be flagged. Real KGS has a standby replica for failover.',
    connects: 'Wires from App Servers on the input side (writes only). Wires out to the URL Database (where the new mapping is persisted).',
    realWorld: 'Bit.ly, TinyURL, and most URL-shortener architectures use this pattern. Common implementations: pre-generated key pool in a separate DB; per-server local key cache for speed; Zookeeper-coordinated counter ranges per shard.',
  },

  // ─── Lessons 4-6: Flow components ───────────────────────────────────────
  client: {
    description: 'Simulated user traffic. Generates a steady rate of requests per second (req/s).',
    usage:
      'Set the rate (req/s) and read ratio. The downstream system has to keep up — exceed capacity and ' +
      'requests get dropped.',
    connects: 'Wires forward into your system. Typically into a Load Balancer when there are multiple backends.',
  },
  loadBalancer: {
    description: 'Spreads incoming traffic evenly across multiple downstream nodes. The classic horizontal-scaling primitive.',
    usage:
      'Place between a high-traffic source and many backends. Capacity divides evenly: each downstream node gets ' +
      'incoming / N requests.',
    connects: 'Wires from a Client. Wires out to several App Servers / VPSes / etc — that\'s the whole point.',
    realWorld: 'AWS ALB, HAProxy, Nginx in reverse-proxy mode. Same job: spread, don\'t pile.',
  },
  // The unified service type — App Server, Worker, etc. live here keyed by
  // role. Lookup is via infoFor(node) below; the colon-keyed entries are an
  // implementation detail callers don't need to know about.
  'service:appServer': {
    description: 'Handles application logic. Has a finite capacity (req/s); beyond that, requests drop.',
    usage:
      'Default capacity is 500 req/s — small enough that one App Server quickly becomes the bottleneck. ' +
      'Add more in parallel behind a Load Balancer to scale.',
    connects: 'Wires from a Load Balancer. Wires out to a Cache or Database.',
  },
  'service:worker': {
    description:
      'A background-job consumer. Drains work from a Queue and processes it asynchronously — ' +
      'no client waits on its response.',
    usage:
      'Wire a Queue → Worker. Workers default to lower throughput than App Servers because background ' +
      'jobs tend to be heavier and slower per item. Scale a Worker pool by dropping more Worker nodes ' +
      'on the same Queue.',
    connects: 'Wires from a Queue. May wire out to a Database, Cache, or Object Storage.',
    realWorld: 'Celery workers, Sidekiq, BullMQ consumers, AWS SQS workers — the same shape.',
  },
  queue: {
    description:
      'A buffer between producers and consumers. The producer drops work into the Queue and moves on; ' +
      'a Worker downstream picks the work up later.',
    usage:
      'Wire a Queue downstream of an App Server when work doesn\'t need to finish before the user gets a ' +
      'response (sending an email, generating a thumbnail, indexing). On the other side, wire a Worker ' +
      'to drain the Queue. This turns a slow operation into "ack now, do later."',
    connects: 'Wires from a producer (e.g. App Server). Wires out to one or more Workers.',
    realWorld: 'SQS, RabbitMQ, Kafka topics, Redis lists, BullMQ — same shape: producer → buffer → consumer.',
  },
  // Unified cache type — `internal` and `cdn` are role-keyed. Lookup via
  // infoFor(node) which resolves to the correct entry.
  'cache:internal': {
    description: 'In-memory store of recent query results. Lives between the App and the Database, absorbing reads that would otherwise hit slow disk.',
    usage:
      'Hit rate determines what % of requests the Cache answers alone. Misses pass through to the next node. ' +
      'Higher hit rate = less pressure on the Database. Use for query results, session data, computed views.',
    connects: 'Wires from a Load Balancer or App Server. Misses wire to a Database.',
    realWorld: 'Redis, Memcached, ElastiCache, or any in-process cache. The "shared near-cache" layer most applications eventually grow.',
  },
  'cache:cdn': {
    description:
      'Content Delivery Network — a geographically distributed edge cache. Sits *before* your Load Balancer, ' +
      'serving static content from a server near each user. Massive capacity, very high hit rate, very low latency.',
    usage:
      'Wire it as the first hop on the read path: Readers → CDN → LB. The CDN absorbs the bulk of read traffic ' +
      '(default 95% hit rate) before requests ever reach your origin servers. Pedagogically, this is what makes ' +
      'workloads like Twitter or Netflix tractable — you off-load 95%+ of reads to the edge.',
    connects: 'Wires from a Client (typically a read-heavy source). Misses wire to a Load Balancer or directly to an App Server.',
    realWorld: 'Cloudflare, Akamai, AWS CloudFront, Fastly. Real CDNs have hundreds of geographic Points of Presence; we model the aggregate as one node.',
  },
  database: {
    description: 'The source of truth — where the actual data lives. Limited capacity, so usually the bottleneck.',
    usage:
      'Default capacity is 1000 req/s. Pair with a Cache (for read-heavy workloads) or Read Replicas ' +
      '(to scale reads horizontally).',
    connects: 'Wires from App Servers, from Cache (on miss), or — in Lesson 6 — accepts the Write traffic the App Servers route here.',
  },
  readReplica: {
    description: 'A read-only copy of the Database. Scales read capacity, but cannot accept writes.',
    usage:
      'Route Read-labeled edges (R) to a Read Replica; Write edges (W) must still go to the primary Database. ' +
      'Click the edge body to cycle through R / W / R+W labels.',
    connects: 'Wires from App Servers via Read edges. Writes that route here will be rejected by the simulator.',
    realWorld: 'PostgreSQL streaming replication, MySQL replicas, etc.',
  },
};

// Resolve a node to its info entry. For role-aware types (service), key by
// `type:role`; otherwise key by type alone. Used by ComponentInfo.jsx.
export function infoFor(node) {
  if (!node?.data?.type) return null;
  const role = node.data?.config?.role;
  if (role) {
    const key = `${node.data.type}:${role}`;
    if (componentInfo[key]) return componentInfo[key];
  }
  return componentInfo[node.data.type] || null;
}
