// A puzzle is a lesson the player solves by wiring components.
// `kind` selects the simulator (flow / composition / connectivity).
// `allowedComponents` filters the palette so each lesson stays focused.
// `initialNodes()` seeds the canvas when the puzzle is loaded.
// `requirements` is a list of pass criteria evaluated against the simulator's result.
// `background` (optional) is an array of paragraph strings rendered in the reading panel.

import { defaultsFor } from './componentTypes.js';

function node(id, type, position, configOverrides = {}, extra = {}) {
  // For role-aware types (service), pass role through so per-role defaults
  // resolve correctly.
  const role = configOverrides?.role;
  return {
    id,
    type: 'system',
    position,
    data: { type, config: { ...defaultsFor(type, role), ...configOverrides } },
    ...extra,
  };
}

// Edge helper used by puzzle solution() functions. Optional `kind` (R/W/both)
// for Lesson 6's read/write split. Solutions return fully-specified state
// (nodes + edges) so the "Show solution" button clobbers the canvas with a
// known-passing graph.
function edge(from, to, kind) {
  return {
    id: `${from}->${to}${kind ? `:${kind}` : ''}`,
    source: from,
    target: to,
    ...(kind ? { data: { kind } } : {}),
  };
}

export const puzzles = {
  buildComputer: {
    id: 'buildComputer',
    order: 1,
    title: 'Build a Computer',
    blurb:
      'Code runs on a computer — and a computer is a box made of CPU, RAM, and disk. Drag the Program INTO the Computer, then drag a CPU, RAM, and Disk in too. The Computer holds them; no wires needed.',
    kind: 'composition',
    allowedComponents: ['cpu', 'ram', 'disk', 'computer', 'program'],
    background: [
      'Every program — every game, every website, every app — eventually runs on a computer. And a computer, no matter how fancy, is made of the same three things: a CPU to do the work, RAM to hold what the program is currently using, and a disk to hold what it needs to keep around even when the power is off.',
      'A program tells the computer it needs a certain amount of each. A small program needs a little; a big one needs a lot. If the computer doesn\'t have enough of any of the three, the program can\'t run.',
      'In this lesson, the Program on the canvas tells you exactly what it needs. Your job: drag a Computer onto the canvas, drop the Program into it, and drop in enough CPU, RAM, and Disk to meet its needs. Watch the Computer\'s header — it shows what hardware it currently has, live.',
    ],
    initialNodes: () => [
      {
        id: 'computer-1',
        type: 'system',
        position: { x: 280, y: 140 },
        style: { width: 340, height: 220 },
        data: { type: 'computer', config: {} },
      },
      node('program-1', 'program', { x: 80, y: 200 }, {
        requires_cores: 4,
        requires_ram_gb: 8,
        requires_disk_gb: 50,
      }),
    ],
    requirements: [
      { key: 'allHosted', label: 'Every Program is inside a Computer that meets its needs', test: (r) => r.allHosted },
      { key: 'noOrphans', label: 'No orphan hardware (every CPU/RAM/Disk is inside a Computer)', test: (r) => r.orphanCount === 0 },
    ],
    solution: () => ({
      nodes: [
        {
          id: 'computer-1',
          type: 'system',
          position: { x: 240, y: 100 },
          style: { width: 420, height: 240 },
          data: { type: 'computer', config: {} },
        },
        node('cpu-1', 'cpu', { x: 20, y: 50 }, { cores: 4 }, { parentNode: 'computer-1' }),
        node('ram-1', 'ram', { x: 220, y: 50 }, { gb: 8 }, { parentNode: 'computer-1' }),
        node('disk-1', 'disk', { x: 20, y: 140 }, { gb: 100 }, { parentNode: 'computer-1' }),
        node(
          'program-1',
          'program',
          { x: 220, y: 140 },
          { requires_cores: 4, requires_ram_gb: 8, requires_disk_gb: 50 },
          { parentNode: 'computer-1' }
        ),
      ],
      edges: [],
    }),
  },

  homeNetwork: {
    id: 'homeNetwork',
    order: 2,
    title: 'On the Home Network',
    blurb:
      'A Router creates a home network and hands out an IP address to every device that connects to it. Wire your Computer and a Phone to the Router and they share a LAN — they can talk to each other but the wider internet can\'t reach in.',
    kind: 'composition',
    allowedComponents: ['router', 'computer', 'phone', 'cpu', 'ram', 'disk', 'webServer'],
    background: [
      'Lesson 1 built a Computer in isolation. But computers are rarely alone — they\'re plugged into other computers.',
      'When you connect your laptop to your home WiFi, you\'re joining a small network called a LAN (Local Area Network). Every device on that LAN — your laptop, your phone, your roommate\'s game console — is talking through the same Router. The Router hands out an address to each device from a pool (its CIDR, like 192.168.1.0/24) and shuttles traffic between them.',
      'Once two devices are on the same LAN, they can reach each other. Your phone can stream music from your laptop. Your laptop can print to your roommate\'s printer. But everything stops at the edge of the home network — strangers on the public internet can\'t reach in. That\'s why the wider internet has to be solved differently, and that\'s what the next lessons are about.',
      'In this lesson: drop a Router on the canvas, then build a Computer from Lesson 1 hardware, host a Web Server program on that Computer, and wire both the Computer and a Phone to the Router. Watch the Router\'s body — every wired device gets its own IP from the Router\'s pool, live as you connect them.',
    ],
    initialNodes: () => [
      node('router-1', 'router', { x: 460, y: 60 }),
      node('phone-1', 'phone', { x: 60, y: 220 }),
      node('webserver-1', 'webServer', { x: 60, y: 60 }, {
        requires_cores: 2,
        requires_ram_gb: 4,
        requires_disk_gb: 20,
      }),
    ],
    requirements: [
      {
        key: 'hasRouter',
        label: 'There is a Router on the canvas',
        predicate: { kind: 'presence', type: 'router', min: 1 },
        lesson:
          'The Router is what creates the home network. Without one, there\'s no LAN for devices to share — no shared subnet, no IP handout, no way for the Phone and Computer to find each other.',
      },
      {
        key: 'computerOnLan',
        label: 'A Computer is wired to the Router',
        test: (r) => r.computersOnLanCount >= 1,
        lesson:
          'A Computer joins the LAN by connecting to the Router (just like plugging an Ethernet cable into a home router, or connecting to its WiFi). Drag a wire from the Computer to the Router.',
      },
      {
        key: 'phoneOnLan',
        label: 'A Phone is wired to the Router too',
        test: (r) => r.phonesOnLanCount >= 1,
        lesson:
          'The Phone needs to be on the same LAN to reach the Web Server. Wire it to the Router.',
      },
      {
        key: 'webServerHosted',
        label: 'The Web Server is running on a Computer on the LAN',
        test: (r) => r.webServersOnLanCount >= 1,
        lesson:
          'A Web Server is a program — it has to live inside a Computer with enough CPU/RAM/Disk (Lesson 1 mechanics). That Computer also needs to be on the LAN (wired to the Router) for the Phone to reach it.',
      },
    ],
    solution: () => ({
      nodes: [
        node('router-1', 'router', { x: 560, y: 60 }, { cidr: '192.168.1.0/24', ssid: 'home-wifi' }),
        node('phone-1', 'phone', { x: 60, y: 360 }),
        {
          id: 'computer-1',
          type: 'system',
          position: { x: 60, y: 60 },
          style: { width: 420, height: 240 },
          data: { type: 'computer', config: {} },
        },
        node('cpu-1', 'cpu', { x: 20, y: 50 }, { cores: 2 }, { parentNode: 'computer-1' }),
        node('ram-1', 'ram', { x: 220, y: 50 }, { gb: 4 }, { parentNode: 'computer-1' }),
        node('disk-1', 'disk', { x: 20, y: 140 }, { gb: 20 }, { parentNode: 'computer-1' }),
        node(
          'webserver-1',
          'webServer',
          { x: 220, y: 140 },
          { requires_cores: 2, requires_ram_gb: 4, requires_disk_gb: 20 },
          { parentNode: 'computer-1' }
        ),
      ],
      edges: [edge('computer-1', 'router-1'), edge('phone-1', 'router-1')],
    }),
  },

  reachTheInternet: {
    id: 'reachTheInternet',
    order: 3,
    title: 'Reach the Internet',
    // Visual regions on the canvas — purely decorative, filtered out by the
    // simulator. The pedagogy: "where you drop something tells you what
    // network it's in." Each region is a labeled, translucent rectangle.
    regions: [
      { id: 'region-lan', label: 'Your LAN', color: '#10b981', x: 0, y: 0, w: 880, h: 480 },
      { id: 'region-internet', label: 'The Internet', color: '#3b82f6', x: 920, y: 0, w: 320, h: 480 },
    ],
    blurb:
      'Your home network from Lesson 2 is islanded — devices on the LAN can talk to each other, but nothing reaches the wider internet. To get out, your Router\'s WAN side has to wire to an Internet Service Provider (ISP) — Comcast, AT&T, Verizon, etc. The ISP gives your network a public IP block; from that point, traffic can flow to other networks across the internet. (Simplification: real Routers do NAT — translating many private IPs to one public IP at the WAN port. We don\'t model NAT here. See simplifications.md.)',
    kind: 'composition',
    allowedComponents: ['router', 'computer', 'phone', 'cpu', 'ram', 'disk', 'webServer', 'isp'],
    background: [
      'Lesson 2 built a Local Area Network — a small island where devices can talk to each other through a Router. But that island doesn\'t reach anything outside it. Your phone on the home WiFi can\'t load google.com just because it\'s on your LAN; it needs a way *out*.',
      'The way out is your ISP — your Internet Service Provider. Comcast, AT&T, Verizon, your local fiber co-op. The ISP runs the cables (and increasingly the wireless gear) that physically connect millions of home networks into one big mesh: the internet. Your Router\'s "WAN port" — the one that goes to the wall, not to the WiFi antennas — connects to your ISP\'s network.',
      'Once your Router is wired to an ISP, your LAN has a path to the rest of the internet. The ISP gives your network a *public IP* address — a globally-routable identifier other networks can use to find yours. Your private LAN IPs (192.168.x.x) stay internal; the public IP is the one that appears on the outside world.',
      'In this lesson: take your home network from Lesson 2 and wire the Router to an ISP. That\'s enough — the connectivity to the wider internet is now in place. The next lesson covers what happens when *multiple* ISPs need to talk to each other to form the actual internet.',
    ],
    initialNodes: () => [
      node('router-1', 'router', { x: 620, y: 160 }, { cidr: '192.168.1.0/24', ssid: 'home-wifi' }),
      node('phone-1', 'phone', { x: 100, y: 340 }),
      {
        id: 'computer-1',
        type: 'system',
        position: { x: 60, y: 80 },
        style: { width: 420, height: 220 },
        data: { type: 'computer', config: {} },
      },
      node('cpu-1', 'cpu', { x: 20, y: 50 }, { cores: 2 }, { parentNode: 'computer-1' }),
      node('ram-1', 'ram', { x: 220, y: 50 }, { gb: 4 }, { parentNode: 'computer-1' }),
      node('disk-1', 'disk', { x: 20, y: 140 }, { gb: 20 }, { parentNode: 'computer-1' }),
      node(
        'webserver-1',
        'webServer',
        { x: 220, y: 140 },
        { requires_cores: 2, requires_ram_gb: 4, requires_disk_gb: 20 },
        { parentNode: 'computer-1' }
      ),
    ],
    requirements: [
      {
        key: 'hasIsp',
        label: 'There is an ISP on the canvas',
        predicate: { kind: 'presence', type: 'isp', min: 1 },
        lesson:
          'Drop an ISP onto the canvas. This represents your internet service provider — the network that connects your home to everything outside it.',
      },
      {
        key: 'routerWiredToIsp',
        label: 'The Router is wired to an ISP',
        test: (r) => r.routersWithIspCount >= 1,
        lesson:
          'The ISP is on the canvas but your Router isn\'t connected to it. Drag a wire from the Router to the ISP — that\'s the Router\'s "WAN port" in real terms, the line that physically goes from your house to the ISP\'s network.',
      },
      {
        key: 'computerOnLan',
        label: 'A Computer is still on the LAN',
        test: (r) => r.computersOnLanCount >= 1,
        lesson:
          'A Computer needs to be wired to the Router to be on the LAN — carrying through from Lesson 2.',
      },
    ],
    solution: () => ({
      nodes: [
        node('router-1', 'router', { x: 620, y: 160 }, { cidr: '192.168.1.0/24', ssid: 'home-wifi' }),
        node('phone-1', 'phone', { x: 100, y: 340 }),
        {
          id: 'computer-1',
          type: 'system',
          position: { x: 60, y: 80 },
          style: { width: 420, height: 220 },
          data: { type: 'computer', config: {} },
        },
        node('cpu-1', 'cpu', { x: 20, y: 50 }, { cores: 2 }, { parentNode: 'computer-1' }),
        node('ram-1', 'ram', { x: 220, y: 50 }, { gb: 4 }, { parentNode: 'computer-1' }),
        node('disk-1', 'disk', { x: 20, y: 140 }, { gb: 20 }, { parentNode: 'computer-1' }),
        node(
          'webserver-1',
          'webServer',
          { x: 220, y: 140 },
          { requires_cores: 2, requires_ram_gb: 4, requires_disk_gb: 20 },
          { parentNode: 'computer-1' }
        ),
        node('isp-1', 'isp', { x: 1000, y: 180 }, { name: 'Comcast', publicIpBlock: '203.0.113.0/24' }),
      ],
      edges: [
        edge('computer-1', 'router-1'),
        edge('phone-1', 'router-1'),
        edge('router-1', 'isp-1'),
      ],
    }),
  },

  pointDomain: {
    id: 'pointDomain',
    order: 4,
    title: 'Point a Domain at a VPS',
    blurb:
      'A visitor types myapp.com into a browser. To reach your VPS, the request walks: Visitor → Domain → DNS Record → VPS. The DNS Record\'s "points to" must match the VPS\'s public IP, or the visitor lands nowhere.',
    kind: 'connectivity',
    allowedComponents: ['visitor', 'domain', 'dnsRecord', 'vps'],
    initialNodes: () => [
      node('visitor-1', 'visitor', { x: 80, y: 220 }, { targetDomain: 'myapp.com' }),
      node('vps-1', 'vps', { x: 760, y: 220 }, { ip: '203.0.113.10' }),
    ],
    requirements: [
      { key: 'allReach', label: 'Every Visitor reaches a VPS', test: (r) => r.allReach },
    ],
    solution: () => ({
      nodes: [
        node('visitor-1', 'visitor', { x: 60, y: 220 }, { targetDomain: 'myapp.com' }),
        node('domain-1', 'domain', { x: 260, y: 220 }, { name: 'myapp.com' }),
        node(
          'dns-1',
          'dnsRecord',
          { x: 460, y: 220 },
          { recordType: 'A', value: '203.0.113.10' }
        ),
        node('vps-1', 'vps', { x: 680, y: 220 }, { ip: '203.0.113.10' }),
      ],
      edges: [
        edge('visitor-1', 'domain-1'),
        edge('domain-1', 'dns-1'),
        edge('dns-1', 'vps-1'),
      ],
    }),
  },

  addLoadBalancer: {
    id: 'addLoadBalancer',
    order: 5,
    title: 'Add a Load Balancer',
    blurb:
      'One VPS is being crushed by 3000 req/s but each VPS only handles 1000. Put a Load Balancer in front and add more VPSes so requests get spread out. (Capacity divides evenly across the LB\'s outgoing edges.)',
    kind: 'flow',
    allowedComponents: ['client', 'loadBalancer', 'vps'],
    initialNodes: () => [
      node('client-1', 'client', { x: 80, y: 220 }, { rps: 3000, readRatio: 1 }),
    ],
    requirements: [
      {
        key: 'successRate',
        label: 'Success rate ≥ 99%',
        test: (r) => r.successRate >= 0.99,
        lesson:
          'A node drops requests when traffic exceeds its capacity. With 3000 req/s incoming and each VPS capped at 1000, ' +
          'you need at least 3 VPSes — and a Load Balancer to spread the load evenly across them.',
      },
      {
        key: 'served',
        label: 'Served ≥ 2970 req/s',
        test: (r) => r.totalServed >= 2970,
        lesson:
          'Served counts requests that reached a working endpoint. If success rate is high but served is low, your traffic ' +
          'is being lost somewhere upstream — usually a stranded edge with nowhere to go.',
      },
      {
        key: 'hasLB',
        label: 'Uses at least one Load Balancer',
        predicate: { kind: 'presence', type: 'loadBalancer', min: 1 },
        lesson:
          'Yes, wiring the Client to 3 VPSes works at 3000 rps — but a 4th VPS would mean ' +
          'updating the Client to know about it. The Load Balancer is the indirection that ' +
          'makes scale-out painless: add a VPS, hook it into the LB, done.',
      },
    ],
    solution: () => ({
      nodes: [
        node('client-1', 'client', { x: 40, y: 220 }, { rps: 3000, readRatio: 1 }),
        node('lb-1', 'loadBalancer', { x: 240, y: 220 }),
        node('vps-1', 'vps', { x: 480, y: 80 }),
        node('vps-2', 'vps', { x: 480, y: 220 }),
        node('vps-3', 'vps', { x: 480, y: 360 }),
      ],
      edges: [
        edge('client-1', 'lb-1'),
        edge('lb-1', 'vps-1'),
        edge('lb-1', 'vps-2'),
        edge('lb-1', 'vps-3'),
      ],
    }),
  },

  urlShortener: {
    id: 'urlShortener',
    order: 6,
    title: 'URL Shortener',
    blurb:
      'Build a system that serves a high read-to-write URL shortener at the target load. Reads dominate; cold reads hit the database. Hint: a cache and/or more app servers will be needed as load grows.',
    kind: 'flow',
    allowedComponents: [
      'client',
      'loadBalancer',
      { type: 'service', role: 'appServer' },
      { type: 'cache', role: 'internal' },
      'database',
    ],
    initialNodes: () => [
      node('client-1', 'client', { x: 80, y: 220 }, { rps: 5000, readRatio: 0.95 }),
    ],
    requirements: [
      {
        key: 'successRate',
        label: 'Success rate ≥ 99%',
        test: (r) => r.successRate >= 0.99,
        lesson:
          'Something downstream is over capacity. Common culprits in this lesson: a single App Server (default cap 500) ' +
          'getting hammered, or the Database (default cap 1000) with no Cache absorbing reads in front.',
      },
      {
        key: 'latency',
        label: 'Avg latency ≤ 80ms',
        test: (r) => r.avgLatency <= 80,
        lesson:
          'Latency adds up along the path — every node a request touches contributes. A Cache hit short-circuits before reaching ' +
          'the slow DB; that\'s the lever. Higher cache hit rate = lower average latency.',
      },
      {
        key: 'served',
        label: 'Served ≥ 4950 req/s',
        test: (r) => r.totalServed >= 4950,
        lesson:
          'If success rate is at the target but served is below it, you may have stranded traffic — an upstream node forwarding ' +
          'to nowhere. Check warnings for "no out-edge" messages.',
      },
    ],
    solution: () => ({
      // 5000 rps, 95% reads. 95% hit rate at the Cache absorbs most reads;
      // misses + writes pass through to a single App + DB. Latency on the
      // hot path is well under 80ms.
      nodes: [
        node('client-1', 'client', { x: 40, y: 220 }, { rps: 5000, readRatio: 0.95 }),
        node('lb-1', 'loadBalancer', { x: 220, y: 220 }),
        node('cache-1', 'cache', { x: 400, y: 220 }, { role: 'internal', hitRate: 0.95 }),
        node('app-1', 'service', { x: 580, y: 220 }, { role: 'appServer' }),
        node('db-1', 'database', { x: 760, y: 220 }),
      ],
      edges: [
        edge('client-1', 'lb-1'),
        edge('lb-1', 'cache-1'),
        edge('cache-1', 'app-1'),
        edge('app-1', 'db-1'),
      ],
    }),
  },

  clusterDatabase: {
    id: 'clusterDatabase',
    order: 7,
    title: 'Add a Database Load Balancer',
    blurb:
      'A flood of writes (3000 req/s, all writes) is hammering your one Database. A Cache won\'t help — caches only absorb reads. The DB itself caps at 1000 req/s. You need more Databases, plus a Load Balancer in front so the App doesn\'t have to know which DB to ask. (Simplification: in production, multiple write-capable DBs need sharding by key or a multi-master setup — see simplifications.md. The pattern this lesson teaches — "always route DB traffic through an LB" — is what makes the next lesson, read replicas, possible.)',
    kind: 'flow',
    allowedComponents: [
      'client',
      'loadBalancer',
      { type: 'service', role: 'appServer' },
      'database',
    ],
    initialNodes: () => [
      node('client-1', 'client', { x: 60, y: 220 }, { rps: 3000, readRatio: 0 }),
      node('app-1', 'service', { x: 260, y: 220 }, { role: 'appServer', capacity: 5000 }),
    ],
    requirements: [
      {
        key: 'successRate',
        label: 'Success rate ≥ 99%',
        test: (r) => r.successRate >= 0.99,
        lesson:
          'A single Database caps at 1000 req/s, so 3000 writes/sec is 2000 req/s over. Caches only absorb reads (writes pass through), ' +
          'so scaling the DB layer is the only fix here. How many DBs do you need to handle the load?',
      },
      {
        key: 'served',
        label: 'Served ≥ 2970 req/s',
        test: (r) => r.totalServed >= 2970,
        lesson:
          'Served < target usually means some traffic is being dropped at a node hitting its capacity. Identify the bottleneck and ' +
          'either scale it horizontally or boost its capacity.',
      },
      {
        key: 'latency',
        label: 'Avg latency ≤ 80ms',
        test: (r) => r.avgLatency <= 80,
        lesson:
          'Each DB adds 30ms on average. The Load Balancer routes each request to ONE DB (not all), so latency should stay flat at ' +
          '~50ms total (App 20 + DB 30). If latency is high, check whether the LB is splitting traffic correctly.',
      },
      {
        key: 'hasLB',
        label: 'Uses a Load Balancer to route to the DB cluster',
        predicate: { kind: 'presence', type: 'loadBalancer', min: 1 },
        lesson:
          'The App could wire to 3 Databases directly — but then the App has to know about each one. ' +
          'The Load Balancer is the indirection: add a DB, hook it into the LB, the App stays unchanged. ' +
          'In production, that role is filled by ProxySQL, PgBouncer, RDS Proxy, or a sharding router.',
      },
      {
        key: 'hasDbCluster',
        label: 'Has at least 2 Databases',
        predicate: { kind: 'presence', type: 'database', min: 2 },
        lesson:
          'One DB caps at 1000 req/s, so 3000 writes/sec needs at least 3 DB nodes. ' +
          'Real systems shard writes by key (each shard owns a slice) or use multi-master replication. ' +
          'We model the cluster as a generic write-capable pool here to teach the LB pattern.',
      },
    ],
    solution: () => ({
      // 3000 rps writes, App passes through, LB splits evenly across 3 DBs
      // (1000 each, at their default cap). Latency: app 20 + db 30 = 50ms.
      nodes: [
        node('client-1', 'client', { x: 40, y: 220 }, { rps: 3000, readRatio: 0 }),
        node('app-1', 'service', { x: 220, y: 220 }, { role: 'appServer', capacity: 5000 }),
        node('db-lb-1', 'loadBalancer', { x: 420, y: 220 }),
        node('db-1', 'database', { x: 640, y: 80 }),
        node('db-2', 'database', { x: 640, y: 220 }),
        node('db-3', 'database', { x: 640, y: 360 }),
      ],
      edges: [
        edge('client-1', 'app-1'),
        edge('app-1', 'db-lb-1'),
        edge('db-lb-1', 'db-1'),
        edge('db-lb-1', 'db-2'),
        edge('db-lb-1', 'db-3'),
      ],
    }),
  },

  newsfeedCore: {
    id: 'newsfeedCore',
    order: 10,
    title: 'Newsfeed Core',
    blurb:
      'Build a Twitter-style mixed workload. Two clients with very different shapes: 100 Posters/sec writing new tweets, 1000 Readers/sec loading their feed. Same LB at the edge, but the paths through diverge — writes need to fan out asynchronously (so the API ack is fast), reads need to hit a cache (or you melt the DB). Two parallel pipelines, two sets of failure modes that can happen independently. Use edge labels (R / W / R+W) to route the two workloads. (Simplification: workers populate the feed cache implicitly — real systems have per-user inbox caches; we model the aggregate. See simplifications.md.)',
    kind: 'flow',
    allowedComponents: [
      'client',
      'loadBalancer',
      { type: 'service', role: 'appServer' },
      { type: 'service', role: 'worker' },
      'queue',
      { type: 'cache', role: 'internal' },
      'database',
    ],
    initialNodes: () => [
      node('posters', 'client', { x: 40, y: 60 }, { rps: 100, readRatio: 0 }),
      node('readers', 'client', { x: 40, y: 380 }, { rps: 1000, readRatio: 1 }),
    ],
    requirements: [
      {
        key: 'reads',
        label: 'Reads served ≥ 99% (feeds load)',
        test: (r) => r.readSuccessRate >= 0.99,
        lesson:
          'Reads dropped usually means the Cache or DB is over capacity, or reads are being routed somewhere that rejects them. ' +
          'A high-hit-rate Cache absorbs most of the read load — without it, every feed read hits the DB and you hit cap fast.',
      },
      {
        key: 'writes',
        label: 'Writes served ≥ 99% (tweets persist)',
        test: (r) => r.writeSuccessRate >= 0.99,
        lesson:
          'Writes dropped probably means they\'re hitting a node that rejects them OR the App Server pool is too small. Check edge ' +
          'labels — writes should be labeled W and routed to a Queue (for async fanout) rather than the read path.',
      },
      {
        key: 'asyncSuccess',
        label: 'Background success ≥ 99% (fanout completes)',
        test: (r) => r.backgroundSuccessRate >= 0.99,
        lesson:
          'Background success measures how many tweets fully propagated through the fanout pipeline. Workers drain the Queue — ' +
          'if their total capacity is below the inbound write rate, jobs stack up and drop. Add more Workers or bump capacity.',
      },
      {
        key: 'p99Latency',
        label: 'p99 latency ≤ 100ms',
        test: (r) => r.avgP99Latency <= 100,
        lesson:
          'p99 latency is high when too many requests pay the full DB cost (90ms p99). Two levers: a Cache absorbs most reads at ' +
          '~6ms p99, and a Queue ends the sync path for writes at ~0ms. Most requests should never reach the DB synchronously.',
      },
      {
        key: 'hasQueue',
        label: 'Uses a Queue (async fanout boundary)',
        predicate: { kind: 'presence', type: 'queue', min: 1 },
        lesson:
          'Without a Queue, every tweet write waits on the fanout work to finish. That couples the Poster\'s API latency to whatever ' +
          'slow operation lives downstream (DB writes, third-party notifications). The Queue is what makes the write API fast.',
      },
      {
        key: 'hasCache',
        label: 'Uses a Cache (precomputed feeds)',
        predicate: { kind: 'presence', type: 'cache', role: 'internal', min: 1 },
        lesson:
          'Feed reads dominate the workload (~10× the write rate). Hitting the DB on every read would melt it. The Cache absorbs ' +
          '80%+ of reads at a fraction of the DB\'s latency. The Workers conceptually populate it as part of the fanout pipeline.',
      },
    ],
    solution: () => ({
      // 100 writes + 1000 reads. LB → 2 Apps (cap 1000 each = 2000 total, plenty).
      // Reads route via Cache (hit rate 0.8 absorbs 800; 200 misses fall to DB).
      // Writes route to Queue → 2 Workers (default cap 50 each = 100, matches load).
      // Workers feed to DB. p99-weighted: hits 69ms × 800 + misses 159ms × 200
      // + writes (queue) 63ms × 100 ≈ 85ms — under the 100ms cap.
      nodes: [
        node('posters', 'client', { x: 40, y: 60 }, { rps: 100, readRatio: 0 }),
        node('readers', 'client', { x: 40, y: 380 }, { rps: 1000, readRatio: 1 }),
        node('lb-1', 'loadBalancer', { x: 220, y: 220 }),
        node('app-1', 'service', { x: 420, y: 140 }, { role: 'appServer', capacity: 1000 }),
        node('app-2', 'service', { x: 420, y: 300 }, { role: 'appServer', capacity: 1000 }),
        node('cache-1', 'cache', { x: 640, y: 100 }, { role: 'internal' }),
        node('queue-1', 'queue', { x: 640, y: 340 }),
        node('worker-1', 'service', { x: 820, y: 280 }, { role: 'worker' }),
        node('worker-2', 'service', { x: 820, y: 400 }, { role: 'worker' }),
        node('db-1', 'database', { x: 1020, y: 220 }),
      ],
      edges: [
        edge('posters', 'lb-1', 'write'),
        edge('readers', 'lb-1', 'read'),
        edge('lb-1', 'app-1'),
        edge('lb-1', 'app-2'),
        edge('app-1', 'cache-1', 'read'),
        edge('app-2', 'cache-1', 'read'),
        edge('app-1', 'queue-1', 'write'),
        edge('app-2', 'queue-1', 'write'),
        edge('cache-1', 'db-1', 'read'),
        edge('queue-1', 'worker-1'),
        edge('queue-1', 'worker-2'),
        edge('worker-1', 'db-1'),
        edge('worker-2', 'db-1'),
      ],
    }),
  },

  addCdn: {
    id: 'addCdn',
    order: 11,
    title: 'Add a CDN at the Edge',
    blurb:
      'Your service handles 20,000 reads/sec — feed reads, profile data, avatars. Even with an internal Cache absorbing 80% of the DB load, every one of those 20k requests still pays the full LB → App → Cache round-trip (~24ms mean). For static or precomputed content you can do dramatically better: put a CDN at the very edge of your system — *before* the LB — and serve 95%+ of traffic from a node geographically close to the user (~1ms). The internal architecture only sees the misses. Targets: reads served ≥ 99%, mean latency ≤ 5ms, and you must use a CDN. (Simplification: real CDNs have hundreds of geographic PoPs — Cloudflare, Akamai, AWS CloudFront — we model the aggregate as one node. See simplifications.md.)',
    kind: 'flow',
    allowedComponents: [
      'client',
      'loadBalancer',
      { type: 'cache', role: 'cdn' },
      { type: 'service', role: 'appServer' },
      { type: 'cache', role: 'internal' },
      'database',
    ],
    initialNodes: () => [
      node('client-1', 'client', { x: 60, y: 220 }, { rps: 20000, readRatio: 1 }),
    ],
    requirements: [
      {
        key: 'reads',
        label: 'Reads served ≥ 99%',
        test: (r) => r.readSuccessRate >= 0.99,
        lesson:
          'At 20k reads/sec, a single Database (cap 1000) can\'t serve them all — you need a Cache absorbing most of the load OR a CDN at the edge. ' +
          'The CDN is the bigger lever: 95% of traffic terminates there at ~1ms latency, freeing the internal architecture to handle the 5% misses.',
      },
      {
        key: 'meanLatency',
        label: 'Mean latency ≤ 5ms',
        test: (r) => r.avgLatency <= 5,
        lesson:
          'Every read paying the full LB(1) + App(20) + Cache(2) chain = 23ms mean — way over budget. A CDN serves at ~1ms; at 95% hit rate, ' +
          'the *served* mean drops dramatically because 95% of requests never travel further than the edge. This is the headline latency lever for read-heavy systems.',
      },
      {
        key: 'hasCdn',
        label: 'Uses a CDN at the edge',
        predicate: { kind: 'presence', type: 'cache', role: 'cdn', min: 1 },
        lesson:
          'A CDN — Cloudflare, Akamai, AWS CloudFront, Fastly — terminates static/precomputed content at a geographically close server. The pattern: ' +
          'Client → CDN → (5% miss) → LB → App → Cache → DB. Without a CDN, your origin infrastructure pays for every request.',
      },
    ],
    solution: () => ({
      // 20,000 reads. CDN absorbs 95% (19000) at ~1ms latency. 1000 reach the LB.
      // LB → 2 Apps (cap 1000 each = 2000 cap, comfortable). Each App forwards
      // 500 reads to the Cache. Cache hit 0.8 absorbs 800; 200 miss to the DB.
      // DB (default cap 1000) handles the 200 misses easily.
      // Mean latency: 19000 × 1 + 800 × 24 + 200 × 54 = 49000 / 20000 = 2.45ms.
      nodes: [
        node('client-1', 'client', { x: 40, y: 220 }, { rps: 20000, readRatio: 1 }),
        node('cdn-1', 'cache', { x: 220, y: 220 }, { role: 'cdn' }),
        node('lb-1', 'loadBalancer', { x: 400, y: 220 }),
        node('app-1', 'service', { x: 580, y: 140 }, { role: 'appServer', capacity: 1000 }),
        node('app-2', 'service', { x: 580, y: 300 }, { role: 'appServer', capacity: 1000 }),
        node('cache-1', 'cache', { x: 780, y: 220 }, { role: 'internal' }),
        node('db-1', 'database', { x: 980, y: 220 }),
      ],
      edges: [
        edge('client-1', 'cdn-1', 'read'),
        edge('cdn-1', 'lb-1', 'read'),
        edge('lb-1', 'app-1'),
        edge('lb-1', 'app-2'),
        edge('app-1', 'cache-1', 'read'),
        edge('app-2', 'cache-1', 'read'),
        edge('cache-1', 'db-1', 'read'),
      ],
    }),
  },

  twitterAtScale: {
    id: 'twitterAtScale',
    order: 12,
    title: 'Twitter at Scale',
    blurb:
      'Curriculum capstone. 3000 Posters/sec + 50,000 Readers/sec. To pass, stack every pattern from prior lessons: CDN at the edge (Lesson 10), App pool behind an LB (Lessons 4–5), internal Cache (Lesson 5), DB cluster behind an LB (Lesson 6), Read Replicas behind their own LB (Lesson 7), Queue + Worker fanout (Lessons 8–9), CDN (Lesson 10). The whole curriculum, applied at once. (Simplification: real Twitter also has media via Object Storage + CDN, search via specialized indices, geographic regions — see simplifications.md for what we still defer.)',
    kind: 'flow',
    allowedComponents: [
      'client',
      'loadBalancer',
      { type: 'cache', role: 'cdn' },
      { type: 'service', role: 'appServer' },
      { type: 'service', role: 'worker' },
      'queue',
      { type: 'cache', role: 'internal' },
      'database',
      'readReplica',
    ],
    initialNodes: () => [
      node('posters', 'client', { x: 40, y: 60 }, { rps: 3000, readRatio: 0 }),
      node('readers', 'client', { x: 40, y: 380 }, { rps: 50000, readRatio: 1 }),
    ],
    requirements: [
      {
        key: 'reads',
        label: 'Reads served ≥ 99% (50k feeds load)',
        test: (r) => r.readSuccessRate >= 0.99,
        lesson:
          'At 50k reads/sec, you need a CDN to absorb most of the load at the edge, AND read replicas behind a Load Balancer to handle ' +
          'the misses that reach your origin. A single primary DB can\'t serve this read volume even with an internal cache in front.',
      },
      {
        key: 'writes',
        label: 'Writes served ≥ 99% (3k tweets persist)',
        test: (r) => r.writeSuccessRate >= 0.99,
        lesson:
          'Writes flow LB → App → Queue (acks the client). If sync writes are dropping, check that the App Server pool can absorb 3000 rps inbound ' +
          'AND that you\'re using a Queue to terminate the sync path (otherwise the slow downstream cost pulls latency through).',
      },
      {
        key: 'asyncSuccess',
        label: 'Background success ≥ 99% (fanout completes through to DB cluster)',
        test: (r) => r.backgroundSuccessRate >= 0.99,
        lesson:
          'Workers drain 3000 jobs/sec from the Queue. A single Database caps at 1000 — you need a DB cluster (multiple primaries behind a DB Load Balancer) ' +
          'to absorb 3000 writes/sec async. This is exactly the pattern from Lesson 6, now applied on the write side.',
      },
      {
        key: 'p99Latency',
        label: 'p99 latency ≤ 100ms',
        test: (r) => r.avgP99Latency <= 100,
        lesson:
          'CDN hits at the edge serve at ~5ms p99 — that alone pulls the served average down dramatically because most reads (~95%) terminate there. ' +
          'Sync writes terminate at the Queue (no DB roundtrip on the sync side), keeping their p99 short too.',
      },
      {
        key: 'hasCdn',
        label: 'Uses a CDN at the edge (Lesson 10 pattern)',
        predicate: { kind: 'presence', type: 'cache', role: 'cdn', min: 1 },
        lesson:
          'A CDN is what makes global read-heavy traffic tractable. The pattern is: Readers → CDN → (5% miss) → LB → App. ' +
          'In production this is Cloudflare, Akamai, AWS CloudFront, or Fastly.',
      },
      {
        key: 'hasReadReplica',
        label: 'Uses a Read Replica (Lesson 7 pattern)',
        predicate: { kind: 'presence', type: 'readReplica', min: 1 },
        lesson:
          'Reads from the internal Cache that miss should route to Read Replicas, not the primary DB. Replicas are read-only copies — they reject writes. ' +
          'Use a Load Balancer in front of the replica pool to spread the cache-miss reads. (This is exactly what Lesson 7 taught.)',
      },
      {
        key: 'hasQueue',
        label: 'Uses a Queue (Lessons 8–9 fanout pattern)',
        predicate: { kind: 'presence', type: 'queue', min: 1 },
        lesson:
          'Synchronous DB writes pull the slow write path into the user-facing latency budget. A Queue terminates the sync path: ack the client immediately, ' +
          'let Workers drain the queue at their own pace to the DB cluster.',
      },
    ],
    solution: () => ({
      // 3000 writes/sec + 50000 reads/sec. The capstone: every pattern stacks.
      //
      // Read path:  Readers → CDN (95% hit, 47500 served at edge) →
      //             LB → Apps → Internal Cache (80% hit, 2000 served) →
      //             Read LB → Read Replicas (500 served).
      //
      // Write path: Posters → LB → Apps → Queue (3000 sync ack here) →
      //             Workers (cap 1500 ea = 3000 jobs/s) → DB LB →
      //             3 Primary DBs (cap 1000 ea = 3000 async write cap).
      //
      // Total served sync: 47500 (CDN) + 2000 (cache) + 500 (replicas) + 3000 (queue) = 53000.
      // Background served: 3000.
      // p99 average ≈ 12ms — dominated by the cheap CDN hits despite the 167ms
      // replica path. Tight numbers — most components are at or near capacity,
      // which is what a real interview answer would also look like.
      nodes: [
        node('posters', 'client', { x: 40, y: 60 }, { rps: 3000, readRatio: 0 }),
        node('readers', 'client', { x: 40, y: 420 }, { rps: 50000, readRatio: 1 }),
        node('cdn-1', 'cache', { x: 220, y: 420 }, { role: 'cdn' }),
        node('lb-1', 'loadBalancer', { x: 400, y: 220 }),
        node('app-1', 'service', { x: 580, y: 140 }, { role: 'appServer', capacity: 3000 }),
        node('app-2', 'service', { x: 580, y: 320 }, { role: 'appServer', capacity: 3000 }),
        node('cache-1', 'cache', { x: 780, y: 100 }, { role: 'internal' }),
        node('read-lb-1', 'loadBalancer', { x: 960, y: 100 }),
        node('replica-1', 'readReplica', { x: 1140, y: 40 }),
        node('replica-2', 'readReplica', { x: 1140, y: 160 }),
        node('queue-1', 'queue', { x: 780, y: 360 }),
        node('worker-1', 'service', { x: 960, y: 300 }, { role: 'worker', capacity: 1500 }),
        node('worker-2', 'service', { x: 960, y: 420 }, { role: 'worker', capacity: 1500 }),
        node('db-lb-1', 'loadBalancer', { x: 1140, y: 360 }),
        node('db-primary-1', 'database', { x: 1320, y: 280 }),
        node('db-primary-2', 'database', { x: 1320, y: 380 }),
        node('db-primary-3', 'database', { x: 1320, y: 480 }),
      ],
      edges: [
        // Read path
        edge('readers', 'cdn-1', 'read'),
        edge('cdn-1', 'lb-1', 'read'),
        edge('lb-1', 'app-1'),
        edge('lb-1', 'app-2'),
        edge('app-1', 'cache-1', 'read'),
        edge('app-2', 'cache-1', 'read'),
        edge('cache-1', 'read-lb-1', 'read'),
        edge('read-lb-1', 'replica-1', 'read'),
        edge('read-lb-1', 'replica-2', 'read'),
        // Write path
        edge('posters', 'lb-1', 'write'),
        edge('app-1', 'queue-1', 'write'),
        edge('app-2', 'queue-1', 'write'),
        edge('queue-1', 'worker-1'),
        edge('queue-1', 'worker-2'),
        edge('worker-1', 'db-lb-1'),
        edge('worker-2', 'db-lb-1'),
        edge('db-lb-1', 'db-primary-1'),
        edge('db-lb-1', 'db-primary-2'),
        edge('db-lb-1', 'db-primary-3'),
      ],
    }),
  },

  asyncNotifications: {
    id: 'asyncNotifications',
    order: 9,
    title: 'Async Notification Pipeline',
    blurb:
      'Your service handles 1000 notifications/sec — push, email, SMS, expensive third-party calls (~200ms each). Sending synchronously means clients wait on the external provider, and when the provider degrades your API latency degrades with it. Decouple: accept the notification, ack the client immediately, push the work onto a Queue, drain it asynchronously with a Worker pool. You now need TWO success rates: sync (API acks ≥ 99%) and background (Workers drain queue ≥ 99%). Sync p99 ≤ 100ms keeps the API snappy. Hint: the bottleneck might not be where you expect — open the metrics panel and watch both rates.',
    kind: 'flow',
    allowedComponents: [
      'client',
      'loadBalancer',
      { type: 'service', role: 'appServer' },
      { type: 'service', role: 'worker' },
      'queue',
      'database',
    ],
    initialNodes: () => [
      node('client-1', 'client', { x: 60, y: 220 }, { rps: 1000, readRatio: 0 }),
    ],
    requirements: [
      {
        key: 'syncSuccess',
        label: 'Sync success rate ≥ 99% (API acks the client)',
        test: (r) => r.successRate >= 0.99,
        lesson:
          'The API needs to accept 99% of incoming notifications. If you\'re dropping, your App Server pool isn\'t sized to accept ' +
          'the 1000 req/s inbound rate (each App Server defaults to 500 req/s capacity). Scale apps OR put a Queue between Apps and ' +
          'their downstream so the API can ack and move on.',
      },
      {
        key: 'asyncSuccess',
        label: 'Background success rate ≥ 99% (Workers drain the Queue)',
        test: (r) => r.backgroundSuccessRate >= 0.99,
        lesson:
          'This is the headline async trap: sync looks healthy while Workers fail to drain the Queue. Workers default to 50 jobs/sec ' +
          'capacity — far below the 1000 jobs/sec inbound. Either add more Workers OR bump each Worker\'s capacity in the property panel.',
      },
      {
        key: 'syncP99',
        label: 'Sync p99 latency ≤ 100ms',
        test: (r) => r.avgP99Latency <= 100,
        lesson:
          'p99 too high means a slow node is on the sync path. A Database adds 90ms at p99 — that alone busts the budget. The fix is to ' +
          'end the sync path at a Queue (which adds 0ms): App ack at the queue, do the slow work in the background.',
      },
      {
        key: 'hasQueue',
        label: 'Uses a Queue (async boundary)',
        predicate: { kind: 'presence', type: 'queue', min: 1 },
        lesson:
          'Synchronous sends couple your API\'s latency to the external service\'s latency. A Queue ' +
          'decouples them: ack the client immediately, do the slow work in the background. Same shape ' +
          'as SQS + Lambda, RabbitMQ + Workers, Kafka + consumers. The cost: jobs run "eventually" not ' +
          '"immediately" — fine for notifications, dangerous for things like payments.',
      },
    ],
    solution: () => ({
      // 1000 rps writes. Sync side: LB → 2 App Servers (cap 500 each = 1000),
      // each forwards to the Queue → enqueue terminates the sync path.
      // Sync p99 = LB(3) + App(60) + Queue(0) = 63ms, under the 100ms cap.
      // Async side: Queue's 1000 jobs/s fan out to 2 Workers (cap 500 each =
      // 1000), each forwards to the Database (cap 1000). 100% background drain.
      // The interesting failure mode: a Worker at default cap (50) drops 95%
      // of the queue. The lesson surfaces that by requiring backgroundSuccessRate.
      nodes: [
        node('client-1', 'client', { x: 40, y: 220 }, { rps: 1000, readRatio: 0 }),
        node('lb-1', 'loadBalancer', { x: 220, y: 220 }),
        node('app-1', 'service', { x: 400, y: 140 }, { role: 'appServer' }),
        node('app-2', 'service', { x: 400, y: 300 }, { role: 'appServer' }),
        node('queue-1', 'queue', { x: 600, y: 220 }),
        node('worker-1', 'service', { x: 780, y: 140 }, { role: 'worker', capacity: 500 }),
        node('worker-2', 'service', { x: 780, y: 300 }, { role: 'worker', capacity: 500 }),
        node('db-1', 'database', { x: 980, y: 220 }),
      ],
      edges: [
        edge('client-1', 'lb-1'),
        edge('lb-1', 'app-1'),
        edge('lb-1', 'app-2'),
        edge('app-1', 'queue-1'),
        edge('app-2', 'queue-1'),
        edge('queue-1', 'worker-1'),
        edge('queue-1', 'worker-2'),
        edge('worker-1', 'db-1'),
        edge('worker-2', 'db-1'),
      ],
    }),
  },

  readReplicas: {
    id: 'readReplicas',
    order: 8,
    title: 'Replicate Your Reads',
    blurb:
      'Reads are now 80% of the load (1500 req/s overall). Last lesson taught the DB Load Balancer pattern; now apply it asymmetrically. Read Replicas serve copies for reads but reject writes. Writes go directly to the Primary; reads fan out through a Load Balancer to the replica pool. Click each edge to label it R / W / R+W.',
    kind: 'flow',
    allowedComponents: [
      'client',
      'loadBalancer',
      { type: 'service', role: 'appServer' },
      'database',
      'readReplica',
    ],
    initialNodes: () => [
      node('client-1', 'client', { x: 60, y: 220 }, { rps: 1500, readRatio: 0.8 }),
      node('app-1', 'service', { x: 260, y: 220 }, { role: 'appServer', capacity: 3000 }),
    ],
    requirements: [
      {
        key: 'reads',
        label: 'Reads served ≥ 99%',
        test: (r) => r.readSuccessRate >= 0.99,
        lesson:
          'Reads being dropped usually means a Read Replica is over capacity. Either add more replicas or route reads through a ' +
          'Load Balancer so they spread evenly across the replica pool.',
      },
      {
        key: 'writes',
        label: 'Writes served ≥ 99%',
        test: (r) => r.writeSuccessRate >= 0.99,
        lesson:
          'Writes dropped likely means they\'re hitting a Read Replica (which rejects writes) or the Primary DB is over capacity. ' +
          'Check edge labels — writes should be marked W and routed to the Primary. Click an edge to cycle through R / W / R+W.',
      },
      {
        key: 'latency',
        label: 'Avg latency ≤ 80ms',
        test: (r) => r.avgLatency <= 80,
        lesson:
          'Reads and writes each pay the destination DB\'s latency (30ms mean). If reads are stacking through multiple hops or ' +
          'going through a slow node, average latency creeps up.',
      },
    ],
    solution: () => ({
      // 1500 rps × 0.8 = 1200 reads / 300 writes. Writes go straight to
      // Primary. Reads route through a Load Balancer that fans out to two
      // Read Replicas (600 each, under their 1000-cap default). Edges carry
      // kind='write' / kind='read' for routing. Builds on Lesson 6's
      // "always put an LB in front of the DB layer" pattern, here applied
      // asymmetrically: primary direct, replicas through an LB.
      nodes: [
        node('client-1', 'client', { x: 40, y: 220 }, { rps: 1500, readRatio: 0.8 }),
        node('app-1', 'service', { x: 220, y: 220 }, { role: 'appServer', capacity: 3000 }),
        node('db-1', 'database', { x: 460, y: 80 }),
        node('read-lb-1', 'loadBalancer', { x: 460, y: 280 }),
        node('replica-1', 'readReplica', { x: 660, y: 200 }),
        node('replica-2', 'readReplica', { x: 660, y: 360 }),
      ],
      edges: [
        edge('client-1', 'app-1'),
        edge('app-1', 'db-1', 'write'),
        edge('app-1', 'read-lb-1', 'read'),
        edge('read-lb-1', 'replica-1', 'read'),
        edge('read-lb-1', 'replica-2', 'read'),
      ],
    }),
  },
};

export const puzzleOrder = [
  'buildComputer',
  'homeNetwork',
  'reachTheInternet',
  'pointDomain',
  'addLoadBalancer',
  'urlShortener',
  'clusterDatabase',
  'readReplicas',
  'asyncNotifications',
  'newsfeedCore',
  'addCdn',
  'twitterAtScale',
];
export const defaultPuzzleId = 'buildComputer';

export function evaluatePuzzle(puzzle, simResult) {
  if (!simResult || !simResult.ok) {
    return { passed: false, results: [], error: simResult ? simResult.error : null };
  }
  const results = puzzle.requirements.map((req) => {
    // A requirement carries either a declarative `predicate:` (new shape, the
    // framework primitive) or a legacy `test: (fn)`. Both coexist while we
    // migrate puzzles; the new shape is opt-in per-requirement.
    const passed = req.predicate
      ? evaluatePredicate(req.predicate, simResult)
      : req.test(simResult);
    return {
      key: req.key,
      label: req.label,
      lesson: req.lesson,
      passed,
    };
  });
  return { passed: results.length > 0 && results.every((r) => r.passed), results };
}

// The framework primitive. A predicate is a kind-tagged object; this function
// is the interpreter. Keep this small — every new kind is one switch arm.
// Today: `metric` (sim-result number vs. threshold), `presence` (count of a
// component type in the graph), `simFlag` (sim-result boolean). Add `edge`
// and `config` when a real puzzle needs them, not before.
export function evaluatePredicate(predicate, simResult) {
  switch (predicate.kind) {
    case 'metric': {
      const v = simResult[predicate.name];
      return compareOp(v, predicate.op, predicate.value);
    }
    case 'presence': {
      // `role` is optional — when present, scopes the check to a specific
      // role (e.g. `cache:cdn`). Powered by `countNodesByType` indexing both
      // bare type and compound `type:role` keys.
      const key = predicate.role ? `${predicate.type}:${predicate.role}` : predicate.type;
      const count = simResult.nodesByType?.[key] ?? 0;
      if (predicate.min != null && count < predicate.min) return false;
      if (predicate.max != null && count > predicate.max) return false;
      return true;
    }
    case 'simFlag':
      return !!simResult[predicate.name];
    default:
      throw new Error(`Unknown predicate kind: ${predicate.kind}`);
  }
}

function compareOp(a, op, b) {
  switch (op) {
    case '>=': return a >= b;
    case '<=': return a <= b;
    case '>':  return a > b;
    case '<':  return a < b;
    case '==': return a === b;
    default:   throw new Error(`Unknown predicate op: ${op}`);
  }
}
