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

// Helper for JS Sandbox (dataflow) lessons. The shape is identical across
// all 12 lessons — textInput → customProgram → textOutput, pre-wired, with
// starter code that the player edits to pass the test cases. This helper
// removes ~30 lines of boilerplate per lesson.
function jsLesson({
  id,
  order,
  difficulty = 'medium',
  title,
  blurb,
  background,
  sources,
  starterCode,
  solutionCode,
  testCases,
  initialInputValue = '',
}) {
  return {
    id,
    order,
    track: 'javascript',
    difficulty,
    title,
    blurb,
    background,
    sources,
    kind: 'dataflow',
    allowedComponents: ['textInput', 'customProgram', 'textOutput'],
    initialNodes: () => [
      node('input-1', 'textInput', { x: 60, y: 200 }, { value: initialInputValue }),
      node('prog-1', 'customProgram', { x: 320, y: 200 }, {
        displayLabel: 'transform',
        code: starterCode,
      }),
      node('output-1', 'textOutput', { x: 640, y: 200 }),
    ],
    initialEdges: () => [
      edge('input-1', 'prog-1'),
      edge('prog-1', 'output-1'),
    ],
    testCases,
    solution: () => ({
      nodes: [
        node('input-1', 'textInput', { x: 60, y: 200 }, { value: initialInputValue }),
        node('prog-1', 'customProgram', { x: 320, y: 200 }, {
          displayLabel: 'transform',
          code: solutionCode,
        }),
        node('output-1', 'textOutput', { x: 640, y: 200 }),
      ],
      edges: [
        edge('input-1', 'prog-1'),
        edge('prog-1', 'output-1'),
      ],
    }),
  };
}

export const puzzles = {
  buildComputer: {
    id: 'buildComputer',
    order: 1,
    difficulty: 'easy',
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
      // Computer + Program centered. Operator pushback 2026-05-14:
      //   1) "Program was off-center on the canvas." Moved it below the
      //      Computer, horizontally centered.
      //   2) "Hint click makes the parent move." It didn't move (data-x/y
      //      stayed put), but its CSS frame extended past its underlying
      //      bounds to wrap canonical-positioned children that overhung
      //      a too-small Computer (340×220). The fix: ship the initial
      //      Computer at the canonical 420×240 size so canonical child
      //      positions (used by the Hint) fit cleanly with zero overshoot.
      // Computer center = (280 + 420/2, 80 + 240/2) = (490, 200).
      // Program center = 490, so Program.x = 490 - 170/2 = 405.
      {
        id: 'computer-1',
        type: 'system',
        position: { x: 280, y: 80 },
        style: { width: 420, height: 240 },
        data: { type: 'computer', config: {} },
      },
      node('program-1', 'program', { x: 405, y: 380 }, {
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
    difficulty: 'easy',
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
    difficulty: 'easy',
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
    difficulty: 'easy',
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

  yourFirstRequest: {
    id: 'yourFirstRequest',
    order: 4.1,
    track: 'systems',
    difficulty: 'easy',
    title: 'Your First Request',
    blurb:
      'Lessons 1-4 wired things together. This is the first lesson that measures *traffic*. A Client sends requests every second; a VPS receives them and serves what it can. Wire the Client to the VPS, click Run, and watch the numbers come back.',
    kind: 'flow',
    allowedComponents: ['client', 'vps'],
    initialNodes: () => [
      node('client-1', 'client', { x: 100, y: 220 }, { rps: 300, readRatio: 1 }),
      node('vps-1', 'vps', { x: 540, y: 220 }, { capacity: 1000, latency: 25 }),
    ],
    background: [
      'Up to now the canvas has been about *composition* (does this Computer have enough CPU?) and *connectivity* (does this Visitor reach a VPS?). Real systems live or die on a third thing: *traffic*. How many requests per second is the Client sending? How many can the VPS actually serve? Are any being dropped on the floor?',
      'A **request per second** (req/s, or rps) is the unit. A Client at 300 rps is sending three hundred requests every second, forever. A VPS with capacity 1000 can serve up to a thousand requests per second; anything beyond that gets *dropped*. The simulator steady-states the system and reports two numbers you care about: **attempted** (what came in) and **served** (what made it through). The gap is **dropped**.',
      'This lesson is the easy case: 300 rps against a 1000 rps machine. Wire them up, click Run, and you should see 100% success — every request the Client sends, the VPS serves. No drops. This is what a healthy system looks like before anything is under pressure. Lessons 5 onward turn the dial up and ask "what do you do when one VPS can\'t keep up?"',
    ],
    requirements: [
      {
        key: 'successRate',
        label: 'Success rate ≥ 99%',
        test: (r) => r.successRate >= 0.99,
        lesson:
          'Success rate is served / attempted. With 300 req/s coming in and a VPS that handles 1000 req/s, every request should make it through — provided the Client is actually wired to the VPS. If success is 0%, the wire is missing; the Client\'s requests are going nowhere.',
      },
      {
        key: 'served',
        label: 'Served ≥ 297 req/s',
        test: (r) => r.totalServed >= 297,
        lesson:
          'Served counts requests that reached a working endpoint. 297 is 99% of 300 — anything less means traffic is being lost. Most often the cause is a missing wire between Client and VPS. The Run button reports this number in the results pane.',
      },
    ],
    solution: () => ({
      // The single move: wire client-1 to vps-1. Capacity (1000) is comfortably
      // above traffic (300 rps), so served = attempted = 300 and dropped = 0.
      // Pedagogy: a single healthy server, traffic well within capacity, 100%
      // success. The next lesson cranks rps past one VPS's capacity to motivate
      // the Load Balancer.
      nodes: [
        node('client-1', 'client', { x: 100, y: 220 }, { rps: 300, readRatio: 1 }),
        node('vps-1', 'vps', { x: 540, y: 220 }, { capacity: 1000, latency: 25 }),
      ],
      edges: [edge('client-1', 'vps-1')],
    }),
  },

  serverOverload: {
    id: 'serverOverload',
    order: 4.2,
    track: 'systems',
    difficulty: 'easy',
    title: "When the Server Can't Keep Up",
    blurb:
      'A Client is firing 1500 req/s at a single VPS, but the VPS only handles 1000. The leftover 500 req/s have nowhere to go — they get dropped. Make the system stop dropping requests. Two valid moves: scale the VPS up (raise its capacity), or send less traffic (lower the Client\'s rps). Either passes — try the first.',
    kind: 'flow',
    allowedComponents: ['client', 'vps'],
    background: [
      'Every server has a ceiling. The Capacity (req/s) field on the VPS is not a target to aim for — it is a hard cap. When attempted traffic exceeds capacity, the excess does not queue politely; it is dropped on the floor. In real systems that means timeouts, 5xx errors, and angry users.',
      'Here the numbers are deliberately blunt: 1500 req/s in, 1000 req/s of capacity, exactly 500 req/s dropped. Success rate works out to 1000/1500 ≈ 67%. The bottleneck label in the results panel will point at the VPS — that is the simulator telling you "this node is where everything jammed up."',
      'There are two ways out, and both work. The first is to make the VPS bigger: bump its capacity above 1500. This is "vertical scaling" or "scale up" — buy a beefier machine. It is the natural first move and it is what real teams reach for first because it is the simplest. But hardware has a ceiling too — eventually you cannot buy a bigger box, or it gets prohibitively expensive. The other escape, "scale out" (more boxes behind a Load Balancer), is the subject of the next lesson.',
    ],
    initialNodes: () => [
      // 1500 rps in, 1000 cap out → 500 dropped, ~67% success, VPS is the
      // bottleneck. Pre-wired so the student lands on Run and sees the failure
      // immediately — no setup, just the problem.
      node('client-1', 'client', { x: 80, y: 220 }, { rps: 1500, readRatio: 1 }),
      node('vps-1', 'vps', { x: 480, y: 220 }, { ip: '203.0.113.10', capacity: 1000, latency: 25 }),
    ],
    initialEdges: () => [edge('client-1', 'vps-1')],
    requirements: [
      {
        key: 'successRate',
        label: 'Success rate ≥ 99%',
        test: (r) => r.successRate >= 0.99,
        lesson:
          'When a Client sends more req/s than a VPS can handle, the difference is dropped. With 1500 in and 1000 capacity, you lose 500/sec — only 67% of requests succeed. ' +
          'Two valid fixes: raise the VPS capacity above 1500, or lower the Client rps to 1000 or less. In a real product you usually cannot tell users to send less traffic — so capacity goes up.',
      },
      {
        key: 'noDrops',
        label: 'Zero dropped requests',
        test: (r) => r.totalDropped < 1,
        lesson:
          'Drops are not just a bad success rate — they are the visible symptom of a capacity ceiling being hit. Even one persistent dropped request per second means your system is leaking traffic. Match or exceed the incoming rate with capacity to drive drops to zero.',
      },
    ],
    solution: () => ({
      // Canonical fix: scale UP the VPS to 2000 capacity. 1500 in, 2000 out
      // → 0 drops, 100% success. Lesson copy mentions the alternative (drop
      // Client rps to 1000) but the canonical demonstrates "make the server
      // bigger" — the natural first instinct before L5 teaches scale-out.
      nodes: [
        node('client-1', 'client', { x: 80, y: 220 }, { rps: 1500, readRatio: 1 }),
        node(
          'vps-1',
          'vps',
          { x: 480, y: 220 },
          { ip: '203.0.113.10', capacity: 2000, latency: 25 }
        ),
      ],
      edges: [edge('client-1', 'vps-1')],
    }),
  },

  addLoadBalancer: {
    id: 'addLoadBalancer',
    order: 5,
    difficulty: 'easy',
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

  persistWithDatabase: {
    id: 'persistWithDatabase',
    order: 6,
    difficulty: 'easy',
    title: 'Persist with a Database',
    blurb:
      'Your App Server handles requests but every restart wipes the data. Add a Database so writes survive. The shape is the simplest stateful pattern: Client → App Server → Database. Reads + writes both pass through the App Server and land in the DB.',
    kind: 'flow',
    allowedComponents: ['client', { type: 'service', role: 'appServer' }, 'database'],
    initialNodes: () => [
      node('users', 'client', { x: 60, y: 240 }, { rps: 500, readRatio: 0.6 }),
    ],
    requirements: [
      {
        key: 'successRate',
        label: 'Success rate ≥ 99%',
        test: (r) => r.successRate >= 0.99,
        lesson:
          'Every request must reach the App Server AND land in the Database. If success drops, capacity is the suspect — App Server default ' +
          'cap is 500, Database default cap is 1000. Wire correctly: Client → App Server → Database.',
      },
      {
        key: 'hasDatabase',
        label: 'Has a Database (persistence)',
        predicate: { kind: 'presence', type: 'database', min: 1 },
        lesson:
          'Without a Database, the app holds state in memory and loses everything on restart. The simplest fix: drop a Database and wire it ' +
          'downstream of the App Server. Real apps may add caches, replicas, queues — but the bedrock is durable storage somewhere.',
      },
    ],
    solution: () => ({
      // 500 req/s through one App Server (cap 500) into one Database (cap 1000).
      // The math just barely fits — pedagogy: a single machine pattern works
      // for small loads but you'll feel the squeeze once traffic grows.
      nodes: [
        node('users', 'client', { x: 60, y: 240 }, { rps: 500, readRatio: 0.6 }),
        node('app-1', 'service', { x: 320, y: 240 }, { role: 'appServer', capacity: 500 }),
        node('db-1', 'database', { x: 580, y: 240 }),
      ],
      edges: [edge('users', 'app-1'), edge('app-1', 'db-1')],
    }),
  },

  cacheHitRate: {
    id: 'cacheHitRate',
    order: 6.5,
    track: 'systems',
    difficulty: 'easy',
    title: 'What a Cache Hit Rate Means',
    blurb:
      'A Cache is already wired between the Client and the Database, but its hit rate is 0 — every read falls through to the DB. The DB is small (cap 100 r/s) and 500 reads/sec are coming in; most get dropped. Open the Cache properties and slide hitRate up until the Database stops dropping.',
    background: [
      'A cache is a small, fast store that sits in front of a slower, more expensive backend (usually a database). When a request comes in, the cache checks if it already has the answer. If yes — a *hit* — it responds directly without touching the database. If no — a *miss* — it falls through to the backend, fetches the value, and (typically) remembers it for next time.',
      'The *hit rate* is the fraction of reads the cache answers on its own. 0.0 means every read is a miss and goes all the way to the DB; 1.0 means every read is a hit and the DB sees nothing. In this simulator, hit rate is a configurable knob — you set it directly. In production, hit rate is an *emergent* property of your access pattern, your cache size, and your eviction policy; you measure it, then tune around it.',
      'Real internal caches (Redis, Memcached, ElastiCache) typically run 80–95% hit rates on hot read paths. Below ~80% the cache is barely earning its keep — the DB still feels most of the load. Above ~95% you may be cache-stale-data-bound rather than throughput-bound. This lesson is the smallest possible demonstration of the relationship: shrink the DB, dial the hit rate, watch the drops disappear.',
    ],
    kind: 'flow',
    allowedComponents: ['client', { type: 'cache', role: 'internal' }, 'database'],
    initialNodes: () => [
      node('users', 'client', { x: 60, y: 240 }, { rps: 500, readRatio: 1 }),
      // hit rate starts at 0 — every read falls through to a tiny DB and drops.
      node('cache-1', 'cache', { x: 320, y: 240 }, { role: 'internal', hitRate: 0 }),
      // Deliberately undersized DB: 100 r/s vs 500 r/s incoming with no cache help.
      node('db-1', 'database', { x: 580, y: 240 }, { capacity: 100 }),
    ],
    initialEdges: () => [
      edge('users', 'cache-1'),
      edge('cache-1', 'db-1'),
    ],
    requirements: [
      {
        key: 'successRate',
        label: 'Success rate ≥ 99%',
        test: (r) => r.successRate >= 0.99,
        lesson:
          'The Database caps at 100 r/s but 500 reads/sec are arriving. With hitRate=0 the Cache absorbs nothing — every read falls through and the DB drops 400. ' +
          'Click the Cache and raise its hitRate. At 0.8 the cache absorbs 400 reads and only 100 reach the DB — exactly its capacity.',
      },
      {
        key: 'hasCache',
        label: 'Has a Cache wired in series',
        predicate: { kind: 'presence', type: 'cache', role: 'internal', min: 1 },
        lesson:
          'The Cache is what makes the math work. Don\'t delete it — adjust its hitRate. Misses pass through to the DB; hits terminate at the Cache.',
      },
      {
        key: 'hasDatabase',
        label: 'Has a Database (persistence layer)',
        predicate: { kind: 'presence', type: 'database', min: 1 },
        lesson:
          'The DB is still required — it\'s the source of truth. The Cache only stores *recent* answers; cold reads (misses) still need somewhere durable to land.',
      },
    ],
    solution: () => ({
      // 500 reads/sec; tiny DB cap 100. Hit rate 0.8 means cache absorbs 400,
      // DB sees 100 reads — exactly at cap. Anything ≥0.8 passes; the canonical
      // solution lands on 0.8 because that's the "Redis rule of thumb" the
      // student will encounter again in L7 and beyond.
      nodes: [
        node('users', 'client', { x: 60, y: 240 }, { rps: 500, readRatio: 1 }),
        node('cache-1', 'cache', { x: 320, y: 240 }, { role: 'internal', hitRate: 0.8 }),
        node('db-1', 'database', { x: 580, y: 240 }, { capacity: 100 }),
      ],
      edges: [
        edge('users', 'cache-1'),
        edge('cache-1', 'db-1'),
      ],
    }),
  },

  latencyAddsUp: {
    id: 'latencyAddsUp',
    order: 6.7,
    track: 'systems',
    difficulty: 'easy',
    title: 'Latency Adds Up',
    blurb:
      'Every stage in the request path adds milliseconds. The path here is Client → Load Balancer → App Server → Database; the simulator sums each stage\'s `latency` along the way (LB 1ms + App 25ms + DB 35ms = 61ms total). Your target: average latency under 50ms. Tune one or two of the stages — the largest stage is usually the highest-leverage knob.',
    kind: 'flow',
    allowedComponents: [
      'client',
      'loadBalancer',
      { type: 'service', role: 'appServer' },
      'database',
    ],
    background: [
      'A request\'s response time is the sum of every hop it makes. The user sends a packet to the load balancer; the LB picks an app server and forwards it; the app server queries the database and waits; the database does the work and replies; everything rewinds back up. Each of those steps takes some milliseconds. The end-to-end latency the user perceives is the sum.',
      'In this simulator each component has a `latency` config (milliseconds added per request as it passes through). The flow simulator literally walks the path and accumulates: at each node, `latency_to_here = latency_at_parent + this_node_latency`. The average reported in the Results pane is that path-sum, weighted by how many requests were served. Add a stage — the number goes up. Lower a stage\'s `latency` — the number comes down by exactly that much.',
      'Production engineers chase the LARGEST stage first. Shaving 10ms off the slowest hop wins more than shaving 1ms off everything else combined. Eventually the longest stage becomes "the database, on a cold read" — and that\'s where caches come in (next lesson): a cache hit short-circuits the path before the slow stage runs at all. The single-digit-millisecond response times you see from popular sites are not magic: they\'re the result of obsessively pushing the path-sum down, one stage at a time, then short-circuiting the worst remaining stage with a cache.',
    ],
    initialNodes: () => [
      node('users', 'client', { x: 60, y: 240 }, { rps: 200, readRatio: 0.9 }),
      node('lb-1', 'loadBalancer', { x: 240, y: 240 }, { latency: 1 }),
      node('app-1', 'service', { x: 440, y: 240 }, { role: 'appServer', capacity: 500, latency: 25 }),
      node('db-1', 'database', { x: 640, y: 240 }, { latency: 35 }),
    ],
    initialEdges: () => [
      edge('users', 'lb-1'),
      edge('lb-1', 'app-1'),
      edge('app-1', 'db-1'),
    ],
    requirements: [
      {
        key: 'successRate',
        label: 'Success rate ≥ 99%',
        test: (r) => r.successRate >= 0.99,
        lesson:
          'The pre-wired path has enough capacity at every stage for 200 req/s — if success rate ever drops, something got disconnected. The puzzle is about latency, not capacity; leave the wires alone.',
      },
      {
        key: 'latency',
        label: 'Avg latency < 50ms',
        test: (r) => r.avgLatency < 50,
        lesson:
          'Latency is the sum along the path. LB (1) + App (25) + DB (35) = 61ms. Drop the biggest contributor: lower the Database\'s `latency` config (try 20). One config tweak gets you from 61 to 46. Production engineers always attack the longest stage first.',
      },
    ],
    solution: () => ({
      // 200 req/s along Client → LB → App → DB.
      // Default latencies: LB 1ms, App 25ms, DB 35ms = 61ms total — fails.
      // Pull the biggest stage down: DB 35 → 20. New total: 1 + 25 + 20 = 46ms.
      // Pedagogy: one knob, one stage, one number — the simplest possible
      // demonstration that latency is a sum and the longest stage dominates.
      nodes: [
        node('users', 'client', { x: 60, y: 240 }, { rps: 200, readRatio: 0.9 }),
        node('lb-1', 'loadBalancer', { x: 240, y: 240 }, { latency: 1 }),
        node('app-1', 'service', { x: 440, y: 240 }, { role: 'appServer', capacity: 500, latency: 25 }),
        node('db-1', 'database', { x: 640, y: 240 }, { latency: 20 }),
      ],
      edges: [
        edge('users', 'lb-1'),
        edge('lb-1', 'app-1'),
        edge('app-1', 'db-1'),
      ],
    }),
  },

  addACache: {
    id: 'addACache',
    order: 7,
    difficulty: 'medium',
    title: 'Add a Cache',
    blurb:
      'Reads are hammering the Database. Stick an in-memory Cache between the App Server and the DB. With a high hit rate, most reads never reach disk — the DB sees only the misses. Internal caches (Redis, Memcached) are the bread-and-butter speed-up for any read-heavy workload.',
    kind: 'flow',
    allowedComponents: [
      'client',
      { type: 'service', role: 'appServer' },
      { type: 'cache', role: 'internal' },
      'database',
    ],
    initialNodes: () => [
      node('users', 'client', { x: 60, y: 240 }, { rps: 2000, readRatio: 1 }),
    ],
    requirements: [
      {
        key: 'successRate',
        label: 'Success rate ≥ 99%',
        test: (r) => r.successRate >= 0.99,
        lesson:
          '2000 reads/sec at the App Server. If the Database\'s default cap of 1000 is the bottleneck, the only way to relieve it without ' +
          'scaling DB hardware is a Cache that absorbs the bulk of the reads. Default internal Cache hit rate is 0.8 — 1600 hit, 400 miss.',
      },
      {
        key: 'hasCache',
        label: 'Has an internal Cache',
        predicate: { kind: 'presence', type: 'cache', role: 'internal', min: 1 },
        lesson:
          'The mechanic is: Cache absorbs `hitRate` fraction of reads; misses fall through to the next component. Wire the Cache between ' +
          'App Server and Database. With 80% hit rate on 2000 reads, only 400 reach the DB — well under its 1000 capacity.',
      },
    ],
    solution: () => ({
      // 2000 reads/sec; cache hit 0.8 absorbs 1600 → DB sees 400 (vs cap 1000).
      // Pedagogy: the cache is what makes the math work; remove it and DB
      // overloads. Hit rate is the load-bearing knob.
      nodes: [
        node('users', 'client', { x: 60, y: 240 }, { rps: 2000, readRatio: 1 }),
        node('app-1', 'service', { x: 280, y: 240 }, { role: 'appServer', capacity: 2000 }),
        node('cache-1', 'cache', { x: 520, y: 240 }, { role: 'internal' }),
        node('db-1', 'database', { x: 760, y: 240 }),
      ],
      edges: [
        edge('users', 'app-1'),
        edge('app-1', 'cache-1'),
        edge('cache-1', 'db-1'),
      ],
    }),
  },

  readWriteSplit: {
    id: 'readWriteSplit',
    order: 8,
    difficulty: 'medium',
    title: 'Read / Write Split',
    blurb:
      'Caching writes is a trap — the cache fills with values that contradict the source of truth. Real systems split read paths from write paths: reads go through the Cache (and only miss to the DB); writes bypass the Cache entirely and land on the DB directly. Click an edge to cycle its label (R / W / both) — wire reads through the cache, writes straight to the DB.',
    kind: 'flow',
    allowedComponents: [
      'client',
      { type: 'service', role: 'appServer' },
      { type: 'cache', role: 'internal' },
      'database',
    ],
    initialNodes: () => [
      node('users', 'client', { x: 60, y: 240 }, { rps: 1200, readRatio: 0.83 }),
    ],
    requirements: [
      {
        key: 'successRate',
        label: 'Success rate ≥ 99%',
        test: (r) => r.successRate >= 0.99,
        lesson:
          '1000 reads/sec + 200 writes/sec. Reads route through the Cache (80% absorbed → 200 reach DB). Writes route directly to the DB ' +
          '(200/sec). DB sees 200 reads + 200 writes = 400 total; well under cap 1000.',
      },
      {
        key: 'hasCache',
        label: 'Has an internal Cache',
        predicate: { kind: 'presence', type: 'cache', role: 'internal', min: 1 },
        lesson:
          'The Cache is what makes the read math work. Drop one between App Server and Database. Then label the edges: ' +
          'App Server → Cache is a Read edge (R); App Server → Database is a Write edge (W).',
      },
      {
        key: 'hasDatabase',
        label: 'Has a Database',
        predicate: { kind: 'presence', type: 'database', min: 1 },
        lesson: 'Persistence layer is still required — writes need somewhere durable to land.',
      },
    ],
    solution: () => ({
      // 1200 req/s mix (83% read = 1000 reads, 200 writes).
      // Read path:  Client → App → Cache (R) → DB (R).  Cache absorbs 800,
      //             DB receives 200 reads.
      // Write path: Client → App → DB (W) direct.  200 writes.
      // DB total: 200 reads + 200 writes = 400 (vs cap 1000).
      nodes: [
        node('users', 'client', { x: 60, y: 240 }, { rps: 1200, readRatio: 0.83 }),
        node('app-1', 'service', { x: 280, y: 240 }, { role: 'appServer', capacity: 1500 }),
        node('cache-1', 'cache', { x: 520, y: 160 }, { role: 'internal' }),
        node('db-1', 'database', { x: 760, y: 240 }),
      ],
      edges: [
        edge('users', 'app-1'),
        edge('app-1', 'cache-1', 'read'),
        edge('cache-1', 'db-1', 'read'),
        edge('app-1', 'db-1', 'write'),
      ],
    }),
  },

  whyHaveTwo: {
    id: 'whyHaveTwo',
    order: 8.5,
    track: 'systems',
    difficulty: 'easy',
    title: 'Why Have Two',
    blurb:
      'Production hardware breaks. Disks die, cables come loose, kernel panics happen. A system with only one of each component is a system with a single point of failure (SPOF) sitting at every box on the diagram. The cheapest insurance against "one machine died at 3am" is to have a *second* one of everything (or more), with a Load Balancer in front to spread traffic and route around whoever is currently dead. Try it: the canvas starts with a Client → LB → single VPS. Click the VPS, click "Simulate failure", and press Run — watch the traffic strand. Then drop a second VPS, wire it to the LB, and run again. The lesson is in your fingers.',
    kind: 'flow',
    allowedComponents: ['client', 'loadBalancer', 'vps'],
    background: [
      'Up until now the lessons have asked "can the system handle the load?" — a capacity question. This lesson asks a different one: "what happens when a piece of the system *dies*?" In production, hardware fails on its own schedule. Disks wear out. Network cables get yanked by a careless data-center tech. A kernel panic takes a process down at 3am. Cloud providers occasionally just turn off your VM and email you about it the next day. None of this is exotic — it\'s the baseline operating environment of any real service.',
      'A system with only one of each component has a single point of failure (SPOF) at every single box on the diagram. One VPS goes down → the whole service is down. One Database fails → your data is unreachable. The textbook fix is also the cheapest one: have a *second* one of everything (or more), and put a Load Balancer in front so traffic can be steered to whichever copies are currently healthy. This pattern — Load Balancer in front of N identical backends — is the canonical high-availability shape. It shows up at every layer of every production stack you\'ve ever used.',
      'In this lesson the canvas starts with Client → Load Balancer → a *single* VPS. The numbers work fine; success rate is 100%. But it\'s a SPOF in disguise. Try this before you solve it: click the VPS, click "Simulate failure" in its property panel, and press Run. The VPS goes grey and the LB has nowhere to send traffic — every request strands. Now add a second VPS, wire it to the LB, and run again. The LB splits the load (and if you fail one of the two, the other one keeps serving). That redundancy is the whole point. The requirement below — "at least 2 VPSes" — is the lesson\'s thumb on the scale, because no metric on a healthy system *forces* you to add redundancy. You have to choose to.',
    ],
    initialNodes: () => [
      // Pre-place the whole single-VPS topology — Client, LB, one VPS, wired.
      // Initial state runs clean (500 rps through LB to one cap-1000 VPS = no
      // drops). The lesson is "the diagram looks fine until something dies."
      node('client-1', 'client', { x: 60, y: 220 }, { rps: 500, readRatio: 1 }),
      node('lb-1', 'loadBalancer', { x: 260, y: 220 }),
      node('vps-1', 'vps', { x: 500, y: 220 }),
    ],
    initialEdges: () => [
      edge('client-1', 'lb-1'),
      edge('lb-1', 'vps-1'),
    ],
    requirements: [
      {
        key: 'successRate',
        label: 'Success rate ≥ 99%',
        test: (r) => r.successRate >= 0.99,
        lesson:
          '500 rps through one Load Balancer to N VPSes (each cap 1000). With everything healthy and at least one VPS wired, ' +
          'success should be 100%. If it isn\'t, check that every VPS is wired to the LB and that no node is over capacity.',
      },
      {
        key: 'hasLB',
        label: 'Uses at least one Load Balancer',
        predicate: { kind: 'presence', type: 'loadBalancer', min: 1 },
        lesson:
          'The Load Balancer is the routing layer that makes redundancy *useful*. Without it, the Client has to know about every VPS ' +
          'and pick one — and if the one it picks is dead, the request fails. With the LB in front, the Client wires to one address; ' +
          'the LB steers around whichever backend is down.',
      },
      {
        key: 'hasRedundantVps',
        label: 'At least 2 VPSes (no single point of failure)',
        predicate: { kind: 'presence', type: 'vps', min: 2 },
        lesson:
          'One VPS is a SPOF — when it dies, the service dies. Two (or more) VPSes behind the LB means the service survives one failure: ' +
          'click any VPS, hit "Simulate failure", and watch traffic continue flowing through the survivors. That\'s the whole reason ' +
          'production systems run identical components in pairs (or larger pools). Real systems take this further — multiple availability ' +
          'zones, multiple regions — but the pattern is the same: more than one of everything, fronted by a Load Balancer.',
      },
    ],
    solution: () => ({
      // 500 rps through LB → 2 VPSes (250 each, well under cap 1000). With
      // both healthy, success rate is 100%. The pedagogical payoff: mark
      // either VPS as failed and the other still handles the full 500 rps —
      // proving the redundancy actually buys you something.
      nodes: [
        node('client-1', 'client', { x: 60, y: 220 }, { rps: 500, readRatio: 1 }),
        node('lb-1', 'loadBalancer', { x: 260, y: 220 }),
        node('vps-1', 'vps', { x: 500, y: 120 }),
        node('vps-2', 'vps', { x: 500, y: 320 }),
      ],
      edges: [
        edge('client-1', 'lb-1'),
        edge('lb-1', 'vps-1'),
        edge('lb-1', 'vps-2'),
      ],
    }),
  },

  urlShortener: {
    id: 'urlShortener',
    order: 9,
    difficulty: 'medium',
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
    order: 10,
    difficulty: 'medium',
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
    order: 13,
    difficulty: 'hard',
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
    order: 14,
    difficulty: 'medium',
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
    order: 15,
    difficulty: 'hard',
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
    order: 12,
    difficulty: 'medium',
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
    order: 11,
    difficulty: 'medium',
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

  streamProcessingAtScale: {
    id: 'streamProcessingAtScale',
    order: 17,
    difficulty: 'hard',
    title: 'Stream Processing at Scale (Design Kafka)',
    blurb:
      'Design a distributed commit log — what Kafka is. Three producer services emit 60,000 events/sec total. The canonical answer needs five interlocking ideas: (1) **partition the topic** — a Partition Router (Load Balancer) hashes events into N partitioned Queues, with `pubsub: true` so each partition is a real Kafka topic (every consumer group sees every event); (2) **distribute partitions across brokers** — broker regions on the canvas show where each partition\'s leader lives and where its RF=3 replicas (decorative markers) sit on the *other* brokers, the durability story Kafka rests on; (3) **multiple consumer groups** — the same partitioned topic feeds an independent real-time consumer group and an analytics consumer group, each draining the full stream (this is *the* Kafka-vs-RabbitMQ differentiator); (4) **shared sink cluster per group** — workers → Storage LB → 3-DB cluster (reuses Lesson 6\'s routing pattern on the sink side); (5) **a control plane** — the KRaft Controllers decorative node coordinates leader election + ISR tracking. Property panel teaching aids cover acks=all + min.insync.replicas semantics. *Hit "Read full lesson" for what we don\'t model on canvas, what\'s "extra extra" beyond the whiteboard, the partition-density caveat, and Kafka 4.0+ refinements.*',
    background: [
      'What this lesson teaches well — on the canvas. The architecture-layer answer to "Design Kafka" at the whiteboard scale: producers hash into a partitioned topic via a Partition Router; partitions distribute across brokers (3 regions on the canvas show this); each partition has RF=3 with 2 follower replicas on the other brokers (12 dashed light-blue lines show which replica backs which leader); two independent consumer groups (real-time + analytics) each read the full stream because the partitions are flagged pubsub:true; each group drains into its own sink cluster (Storage LB → 3 DBs); a KRaft Controllers marker indicates the control plane.',
      'What the simulator does interactively. Three durability mechanics are wired through the sim, not just labeled on a panel. (1) ISR enforcement — if you mark 2 replicas of a partition as failed, that leader Queue drops writes because acks=all + minInsyncReplicas=2 says it needs 1 leader + 2 in-sync followers. (2) Acks-driven latency — acks=all on a Queue adds (RF-1)×5ms of replication-fetch latency to the p99. (3) Failure-driven leader promotion — if you mark a leader Queue as failed, the sim picks the first healthy replica with matching `replicaOf`, rewrites its type to "queue", and rebinds every edge that referenced the failed leader. Traffic continues. Try it: pick a partition, fail it, run the sim.',
      'Soft caveat — partition density. The canvas shows 6 partitions across 3 brokers — 2 partitions per broker. Real production runs WAY higher: Confluent recommends 100-200 partitions/broker as the baseline, max ~4000/broker before the controller is overloaded. LinkedIn (2024) averages ~1,750 partitions per broker across 4,000+ brokers serving 7 trillion messages/day. Cloudflare runs 14 clusters with ~330 nodes for 1 trillion+ messages. Our 2 partitions/broker is whiteboard scale — the pattern is correct; the count is artificial for legibility. In an interview, when sizing partitions for throughput, the rule of thumb is ~10 MB/s write or ~20 MB/s read per partition; over-partition at topic creation because increasing partitions live breaks per-key ordering (see "partition immutability" in simplifications.md).',
      'Extra extra — Kafka layers we intentionally don\'t draw on canvas. These are real components of production Kafka deployments but they\'re not part of HelloInterview\'s canonical whiteboard answer, so the lesson omits them: (a) Schema Registry — Confluent\'s reference architectures include it, but it\'s a governance layer, not a topology layer. (b) Kafka Connect — source/sink connectors for ingesting from / shipping to external systems (databases, S3, Elasticsearch). Implementation pattern, not architecture. (c) Kafka Streams / ksqlDB / Flink — stream processing layer between consumer and sink for joins/aggregations/windowing. Usually a separate "design a stream processing pipeline" question. (d) MirrorMaker / Cluster Linking — multi-cluster cross-region replication for disaster recovery. (e) Idempotent producers (KIP-98) and exactly-once semantics. (f) Quotas, ACLs, SASL/SSL — security and governance. Each one belongs in a follow-up answer ("yes, in production we\'d also have…"), not on the whiteboard.',
      'Kafka 4.0+ refinements (released March 2025). The canvas teaches the canonical pattern that\'s been stable since 2014; modern Kafka has added several refinements worth name-dropping in a 2026 interview. KRaft is now the only mode — Kafka 4.0 fully removed ZooKeeper, which simplifies the control plane story (our "KRaft Controllers" marker is strictly correct now, ambiguous before). KIP-848 (GA) introduces a new consumer rebalance protocol that eliminates stop-the-world rebalances — mention this if asked about consumer churn. KIP-932 (GA) introduces Share Groups, giving Kafka queue-like cooperative consumption — this blurs the historical Kafka-vs-RabbitMQ distinction. KIP-966 (preview) introduces Eligible Leader Replicas (ELR), a subset of ISR guaranteed to have data up to the high watermark — safer leader election. KIP-405 (GA in 3.9) is Tiered Storage — topics can offload old segments to S3 transparently, making Kafka itself a long-term store.',
      'What\'s genuinely unmodeled (time-axis only). Our simulator is steady-state: rates per second under stable conditions. It cannot model time-axis phenomena: dynamic ISR shrinkage (followers falling behind under load then catching up), the high watermark (offset up to which all ISRs have replicated), per-event replication progression, rebalancing protocols, replication lag drift. These belong in the "internals" deep-dive answer, not the whiteboard. See simplifications.md #7 and #8 for what the deep-dive answer looks like. The puzzle won\'t teach these because they\'d require a fundamentally different sim shape (per-event, not per-second).',
      'Where to dig further. The full research backing this puzzle lives at `puzzle-research/kafka.md` (16 sources including Apache 4.0 release notes, Confluent design docs + 2026 scaling best practices, LinkedIn engineering posts, InfoQ Cloudflare case study, KIPs 405/848/932/966). The trade-offs we explicitly accepted are in `caveats.md #9`. The internals we deferred are in `simplifications.md #7-#13`. For an actual interview, mastery of this puzzle (architecture + the 3 durability phases + the 4.0-era refinements above) is sufficient for a senior-level "Design Kafka" answer at a typical FAANG 45-minute slot. The Sources section below links each authoritative reference directly.',
    ],
    sources: [
      { title: 'systemdesign.io: Design a Stream Processing System Like Kafka', url: 'https://systemdesign.io/question/design-a-stream-processing-system-like-kafka', note: 'The source page this puzzle answers (Q1-Q5)' },
      { title: 'Hello Interview — Kafka Deep Dive for System Design Interviews', url: 'https://www.hellointerview.com/learn/system-design/deep-dives/kafka', note: 'The canonical whiteboard answer we audited against' },
      { title: 'Apache Kafka 4.0.0 Release Announcement (March 2025)', url: 'https://kafka.apache.org/blog/2025/03/18/apache-kafka-4.0.0-release-announcement/', note: 'KRaft-only, KIP-848/932/966 announcement' },
      { title: 'Apache Kafka — Official Introduction', url: 'https://kafka.apache.org/intro', note: 'Canonical phrasing for topics, partitions, ordering, retention' },
      { title: 'Confluent — Kafka Scaling Best Practices (2026)', url: 'https://www.confluent.io/learn/kafka-scaling-best-practices/', note: 'Authoritative 2026 baseline: 100-200 partitions/broker, RF=3, acks=all, min.insync=2' },
      { title: 'Confluent — Kafka Replication Design', url: 'https://docs.confluent.io/kafka/design/replication.html', note: 'ISR mechanics, acks=0/1/all, leader election' },
      { title: 'Confluent — Kafka Efficient Design', url: 'https://docs.confluent.io/kafka/design/efficient-design.html', note: 'Sequential I/O, batching, page cache, zero-copy explanation' },
      { title: 'Confluent — Apache Kafka 4.0 Release Blog', url: 'https://www.confluent.io/blog/latest-apache-kafka-release/', note: 'Default KRaft, queues, faster rebalances' },
      { title: 'Confluent Developer — Data Replication Course', url: 'https://developer.confluent.io/courses/architecture/data-replication/', note: 'Pull-based replication, high watermark' },
      { title: 'LinkedIn Engineering — Running Kafka at Scale', url: 'https://engineering.linkedin.com/kafka/running-kafka-scale', note: 'LinkedIn cluster metrics + tiered architecture' },
      { title: 'LinkedIn Engineering — 7 Trillion Messages Per Day', url: 'https://www.linkedin.com/blog/engineering/open-source/apache-kafka-trillion-messages', note: '4000+ brokers, 7M partitions, KIPs LinkedIn contributed' },
      { title: 'InfoQ — Tales of Kafka at Cloudflare: 1 Trillion Messages', url: 'https://www.infoq.com/articles/kafka-clusters-cloudflare/', note: '14 clusters, 330 nodes, real production case study' },
      { title: 'ByteByteGo — Why Kafka is Fast', url: 'https://bytebytego.com/guides/why-is-kafka-fast/', note: 'The "5 reasons" framing with sequential I/O + zero-copy' },
      { title: '2-Minute Streaming — Zero Copy in Kafka (with TLS caveat)', url: 'https://blog.2minutestreaming.com/p/apache-kafka-zero-copy-operating-system-optimization', note: 'The TLS-disables-zero-copy nuance that distinguishes a senior answer' },
      { title: 'Anil Goyal — Kafka Topics, Partitions, Replication, ISR Deep Dive', url: 'https://medium.com/@anil.goyal0057/kafka-topics-partitions-replication-isr-leader-election-acks-deep-dive-a744def1d413', note: 'Partition lifecycle, immutability rule' },
      { title: 'KIP-405 — Tiered Storage GA Release Notes', url: 'https://cwiki.apache.org/confluence/x/9xDOEg', note: 'Production state of S3/HDFS-backed retention' },
    ],
    kind: 'flow',
    regions: [
      // Topic region wraps the partition column. It overlaps the broker
      // regions intentionally — the topic *is* the set of partitions across
      // brokers; the visual overlap makes that "spread over brokers" story
      // legible. Light alpha (8%) keeps things readable.
      { id: 'r-topic', label: 'Topic: events', color: '#a855f7', x: 380, y: -80, w: 360, h: 1480 },
      // 3 broker regions — each holds 2 leader partitions + 4 follower
      // replica markers. Replica layout: P0 leads B0, replicas on B1+B2;
      // P1 leads B1, replicas on B0+B2; etc. This is the standard 3-broker,
      // 6-partition, RF=3 balanced layout.
      { id: 'r-broker-0', label: 'Broker 0  ·  Leaders: P0, P3  ·  Followers: P1, P2, P4, P5', color: '#f97316', x: 360, y: -40, w: 500, h: 440 },
      { id: 'r-broker-1', label: 'Broker 1  ·  Leaders: P1, P4  ·  Followers: P0, P2, P3, P5', color: '#f97316', x: 360, y: 440, w: 500, h: 440 },
      { id: 'r-broker-2', label: 'Broker 2  ·  Leaders: P2, P5  ·  Followers: P0, P1, P3, P4', color: '#f97316', x: 360, y: 920, w: 500, h: 440 },
      // Consumer group regions — each wraps its 6 workers + storage LB +
      // 3 DBs. Real-time on top, analytics below; same 6-worker shape
      // because each group reads all 6 partitions independently
      // (pubsub: true on every partition Queue makes this work in the sim).
      { id: 'r-group-rt', label: 'Consumer Group: real-time (60k events/sec)', color: '#10b981', x: 880, y: -20, w: 580, h: 660 },
      { id: 'r-group-an', label: 'Consumer Group: analytics (60k events/sec independent stream)', color: '#10b981', x: 880, y: 700, w: 580, h: 660 },
    ],
    allowedComponents: [
      'client',
      'loadBalancer',
      'queue',
      { type: 'service', role: 'worker' },
      'database',
      'kafkaReplica',
      'kafkaController',
    ],
    initialNodes: () => [
      node('events-svc-a', 'client', { x: 40, y: 120 }, { rps: 20000, readRatio: 0 }),
      node('events-svc-b', 'client', { x: 40, y: 320 }, { rps: 20000, readRatio: 0 }),
      node('events-svc-c', 'client', { x: 40, y: 520 }, { rps: 20000, readRatio: 0 }),
    ],
    requirements: [
      {
        key: 'syncSuccess',
        label: 'Sync success rate ≥ 99% (producers ack at the partition)',
        test: (r) => r.successRate >= 0.99,
        lesson:
          'Producers write 60k events/sec aggregate. Each event must reach a partition (Queue). If sync success drops, the ' +
          'Partition Router capacity is exceeded — or producers aren\'t wired through a router. (Q5: load balancing across nodes.)',
      },
      {
        key: 'asyncSuccess',
        label: 'Background success ≥ 99% (both consumer groups drain independently)',
        test: (r) => r.backgroundSuccessRate >= 0.99,
        lesson:
          'Each pubsub Queue (partition) emits its full rate to every downstream consumer group. With 6 partitions × 2 groups ' +
          '× 10k events/sec/partition = 120k background-attempted. Each group needs cap for 60k aggregate (6 workers × 10k) ' +
          'feeding a sink that absorbs 60k. If either group under-provisions workers or sinks, this metric drops.',
      },
      {
        key: 'hasPartitionedTopic',
        label: 'Has at least 4 Queues (partitioned topic)',
        predicate: { kind: 'presence', type: 'queue', min: 4 },
        lesson:
          'A single Queue caps parallelism — ordering is per-partition only. Real Kafka splits a topic into N partitions for ' +
          'linear scaling. Drop Queues representing partitions, each with `pubsub: true` so multiple consumer groups can ' +
          'read the same data independently. (Q5: partitioning.)',
      },
      {
        key: 'hasPartitionRouter',
        label: 'Has a Partition Router (Load Balancer fans writes across Queues)',
        predicate: { kind: 'presence', type: 'loadBalancer', min: 1 },
        lesson:
          'Real Kafka\'s producer library hashes the message key to pick a partition. We model that with a Load Balancer ' +
          'between Producers and the partitioned Queues — same routing-to-cluster pattern as Lesson 6, applied to the topic ' +
          'cluster. Without it, producers fan-out indiscriminately or pile onto one partition.',
      },
      {
        key: 'hasConsumerGroup',
        label: 'Consumer Groups: at least 4 Workers reading the partitions',
        predicate: { kind: 'presence', type: 'service', role: 'worker', min: 4 },
        lesson:
          'A Kafka Consumer Group runs one consumer per partition for parallelism. With 6 partitions you can have up to 6 ' +
          'workers per group. More than 6 = idle consumers (partition count is the parallelism ceiling).',
      },
      {
        key: 'hasMultipleConsumerGroups',
        label: 'At least 2 independent consumer groups (the Kafka vs RabbitMQ differentiator)',
        predicate: { kind: 'metric', name: 'consumerGroupCount', op: '>=', value: 2 },
        lesson:
          'The defining Kafka feature: multiple consumer groups read the same topic independently, each tracking its own ' +
          'offset. Real-time analytics + batch ETL + fraud detection all read the same partitioned stream without coordinating. ' +
          'Tag each Worker with its `consumerGroup` (e.g. "realtime", "analytics") in the property panel. (Q2: Kafka vs RabbitMQ.)',
      },
      {
        key: 'hasStorage',
        label: 'Has at least one Database (persisted stream output)',
        predicate: { kind: 'presence', type: 'database', min: 1 },
        lesson:
          'Stream processing isn\'t complete until events land somewhere durable. The canonical shape reuses Lesson 6\'s ' +
          'cluster pattern on the sink side: each group\'s workers write through a Storage Load Balancer into a 3-DB cluster. ' +
          'Real pipelines write to S3 / Elasticsearch / analytics warehouses / Parquet on a data lake.',
      },
      {
        key: 'hasReplicaTopology',
        label: 'Shows replica topology: at least 6 Replica markers across brokers',
        predicate: { kind: 'presence', type: 'kafkaReplica', min: 6 },
        lesson:
          'Each partition has RF=3 copies — 1 leader + 2 follower replicas, distributed across separate brokers. The replica ' +
          'markers are decorative (sim ignores them) but they encode the durability story: if a broker fails, every partition ' +
          'leader on that broker is re-elected from its in-sync followers on the other brokers. Drop replica markers inside ' +
          'each broker region to depict where each partition\'s followers live. (Q5: fault tolerance, partitioning.)',
      },
      {
        key: 'hasController',
        label: 'Has a Controller (KRaft) for cluster coordination',
        predicate: { kind: 'presence', type: 'kafkaController', min: 1 },
        lesson:
          'Brokers coordinate through a Raft-replicated controller quorum (KRaft in modern Kafka; Zookeeper in older ' +
          'deployments). The controller owns cluster metadata: partition leadership, ISR membership, topic configs. Drop one ' +
          'KRaft Controllers node to show the control plane exists. (Q5: fault tolerance — leader election runs through here.)',
      },
    ],
    solution: () => {
      // 3 producer services × 20k events/sec = 60k aggregate writes.
      // Router (cap 60k) fans into 6 partitions at 10k each.
      // Each partition is pubsub:true → emits full 10k to BOTH consumer
      // groups' matching workers. Background-attempted = 60k × 2 = 120k.
      //
      // Real-time group:  6 workers (cap 10k) → storage-lb-rt (cap 60k)
      //                    → 3 DBs (cap 20k each) — drains 60k aggregate.
      // Analytics group:  same shape — independently drains 60k aggregate.
      //
      // Replica topology (RF=3, 6 partitions, 3 brokers, balanced):
      //   P0 lives on B0 (leader), B1 (follower), B2 (follower)
      //   P1 lives on B1 (leader), B0 (follower), B2 (follower)
      //   P2 lives on B2 (leader), B0 (follower), B1 (follower)
      //   P3 lives on B0 (leader), B1 (follower), B2 (follower)
      //   P4 lives on B1 (leader), B0 (follower), B2 (follower)
      //   P5 lives on B2 (leader), B0 (follower), B1 (follower)
      //
      // We render leader Queues at x=440 and follower replica markers at
      // x=640 inside the broker region they belong to.
      //
      // Verified: sync 100% (60k accepted at router → 60k accepted at queues);
      // background 100% (120k attempted → 120k served across both sinks).
      const replicaMarker = (id, partition, broker, leaderId, x, y) =>
        node(id, 'kafkaReplica', { x, y }, { partition, broker, isLeader: 'no', replicaOf: leaderId });
      return {
        nodes: [
          // Producers — y-spread to match the 3 broker bands they fan across
          node('events-svc-a', 'client', { x: 40, y: 200 }, { rps: 20000, readRatio: 0 }),
          node('events-svc-b', 'client', { x: 40, y: 680 }, { rps: 20000, readRatio: 0 }),
          node('events-svc-c', 'client', { x: 40, y: 1160 }, { rps: 20000, readRatio: 0 }),
          node('partition-router', 'loadBalancer', { x: 220, y: 680 }, { capacity: 60000 }),

          // KRaft Controllers (decorative) — sits above the router visually
          node('kraft-controllers', 'kafkaController', { x: 220, y: 80 }, {}),

          // Broker 0 band (y=-40..400): leaders P0 + P3, follower replicas for P1 P2 P4 P5
          node('partition-0', 'queue', { x: 440, y: 80 }, { topic: 'events', pubsub: true, minInsyncReplicas: 2 }),
          node('partition-3', 'queue', { x: 440, y: 260 }, { topic: 'events', pubsub: true, minInsyncReplicas: 2 }),
          replicaMarker('rep-P1-B0', 'P1', 'B0', 'partition-1', 660, 40),
          replicaMarker('rep-P2-B0', 'P2', 'B0', 'partition-2', 660, 140),
          replicaMarker('rep-P4-B0', 'P4', 'B0', 'partition-4', 660, 240),
          replicaMarker('rep-P5-B0', 'P5', 'B0', 'partition-5', 660, 340),

          // Broker 1 band (y=440..880): leaders P1 + P4, follower replicas for P0 P2 P3 P5
          node('partition-1', 'queue', { x: 440, y: 560 }, { topic: 'events', pubsub: true, minInsyncReplicas: 2 }),
          node('partition-4', 'queue', { x: 440, y: 740 }, { topic: 'events', pubsub: true, minInsyncReplicas: 2 }),
          replicaMarker('rep-P0-B1', 'P0', 'B1', 'partition-0', 660, 520),
          replicaMarker('rep-P2-B1', 'P2', 'B1', 'partition-2', 660, 620),
          replicaMarker('rep-P3-B1', 'P3', 'B1', 'partition-3', 660, 720),
          replicaMarker('rep-P5-B1', 'P5', 'B1', 'partition-5', 660, 820),

          // Broker 2 band (y=920..1360): leaders P2 + P5, follower replicas for P0 P1 P3 P4
          node('partition-2', 'queue', { x: 440, y: 1040 }, { topic: 'events', pubsub: true, minInsyncReplicas: 2 }),
          node('partition-5', 'queue', { x: 440, y: 1220 }, { topic: 'events', pubsub: true, minInsyncReplicas: 2 }),
          replicaMarker('rep-P0-B2', 'P0', 'B2', 'partition-0', 660, 1000),
          replicaMarker('rep-P1-B2', 'P1', 'B2', 'partition-1', 660, 1100),
          replicaMarker('rep-P3-B2', 'P3', 'B2', 'partition-3', 660, 1200),
          replicaMarker('rep-P4-B2', 'P4', 'B2', 'partition-4', 660, 1300),

          // Consumer Group: real-time (top band y=-20..620)
          node('worker-rt-0', 'service', { x: 900, y: 40 }, { role: 'worker', capacity: 10000, consumerGroup: 'realtime' }),
          node('worker-rt-1', 'service', { x: 900, y: 140 }, { role: 'worker', capacity: 10000, consumerGroup: 'realtime' }),
          node('worker-rt-2', 'service', { x: 900, y: 240 }, { role: 'worker', capacity: 10000, consumerGroup: 'realtime' }),
          node('worker-rt-3', 'service', { x: 900, y: 340 }, { role: 'worker', capacity: 10000, consumerGroup: 'realtime' }),
          node('worker-rt-4', 'service', { x: 900, y: 440 }, { role: 'worker', capacity: 10000, consumerGroup: 'realtime' }),
          node('worker-rt-5', 'service', { x: 900, y: 540 }, { role: 'worker', capacity: 10000, consumerGroup: 'realtime' }),
          node('storage-lb-rt', 'loadBalancer', { x: 1140, y: 280 }, { capacity: 60000 }),
          node('rt-db-0', 'database', { x: 1360, y: 140 }, { capacity: 20000 }),
          node('rt-db-1', 'database', { x: 1360, y: 290 }, { capacity: 20000 }),
          node('rt-db-2', 'database', { x: 1360, y: 440 }, { capacity: 20000 }),

          // Consumer Group: analytics (bottom band y=700..1360)
          node('worker-an-0', 'service', { x: 900, y: 760 }, { role: 'worker', capacity: 10000, consumerGroup: 'analytics' }),
          node('worker-an-1', 'service', { x: 900, y: 860 }, { role: 'worker', capacity: 10000, consumerGroup: 'analytics' }),
          node('worker-an-2', 'service', { x: 900, y: 960 }, { role: 'worker', capacity: 10000, consumerGroup: 'analytics' }),
          node('worker-an-3', 'service', { x: 900, y: 1060 }, { role: 'worker', capacity: 10000, consumerGroup: 'analytics' }),
          node('worker-an-4', 'service', { x: 900, y: 1160 }, { role: 'worker', capacity: 10000, consumerGroup: 'analytics' }),
          node('worker-an-5', 'service', { x: 900, y: 1260 }, { role: 'worker', capacity: 10000, consumerGroup: 'analytics' }),
          node('storage-lb-an', 'loadBalancer', { x: 1140, y: 1000 }, { capacity: 60000 }),
          node('an-db-0', 'database', { x: 1360, y: 860 }, { capacity: 20000 }),
          node('an-db-1', 'database', { x: 1360, y: 1010 }, { capacity: 20000 }),
          node('an-db-2', 'database', { x: 1360, y: 1160 }, { capacity: 20000 }),
        ],
        edges: [
          // Replication edges (Lesson 14): leader Queue → each of its 2
          // follower replicas. Sim filters these out (target is decorative)
          // but they render as dashed muted lines so the reader can see
          // which replica belongs to which leader at a glance.
          edge('partition-0', 'rep-P0-B1', 'replication'),
          edge('partition-0', 'rep-P0-B2', 'replication'),
          edge('partition-1', 'rep-P1-B0', 'replication'),
          edge('partition-1', 'rep-P1-B2', 'replication'),
          edge('partition-2', 'rep-P2-B0', 'replication'),
          edge('partition-2', 'rep-P2-B1', 'replication'),
          edge('partition-3', 'rep-P3-B1', 'replication'),
          edge('partition-3', 'rep-P3-B2', 'replication'),
          edge('partition-4', 'rep-P4-B0', 'replication'),
          edge('partition-4', 'rep-P4-B2', 'replication'),
          edge('partition-5', 'rep-P5-B0', 'replication'),
          edge('partition-5', 'rep-P5-B1', 'replication'),
          // Producers fan into router
          edge('events-svc-a', 'partition-router'),
          edge('events-svc-b', 'partition-router'),
          edge('events-svc-c', 'partition-router'),
          // Router fans across 6 partition leaders
          edge('partition-router', 'partition-0'),
          edge('partition-router', 'partition-1'),
          edge('partition-router', 'partition-2'),
          edge('partition-router', 'partition-3'),
          edge('partition-router', 'partition-4'),
          edge('partition-router', 'partition-5'),
          // Each partition (pubsub:true) emits full rate to BOTH groups' matching worker
          edge('partition-0', 'worker-rt-0'),
          edge('partition-0', 'worker-an-0'),
          edge('partition-1', 'worker-rt-1'),
          edge('partition-1', 'worker-an-1'),
          edge('partition-2', 'worker-rt-2'),
          edge('partition-2', 'worker-an-2'),
          edge('partition-3', 'worker-rt-3'),
          edge('partition-3', 'worker-an-3'),
          edge('partition-4', 'worker-rt-4'),
          edge('partition-4', 'worker-an-4'),
          edge('partition-5', 'worker-rt-5'),
          edge('partition-5', 'worker-an-5'),
          // Real-time group sink
          edge('worker-rt-0', 'storage-lb-rt'),
          edge('worker-rt-1', 'storage-lb-rt'),
          edge('worker-rt-2', 'storage-lb-rt'),
          edge('worker-rt-3', 'storage-lb-rt'),
          edge('worker-rt-4', 'storage-lb-rt'),
          edge('worker-rt-5', 'storage-lb-rt'),
          edge('storage-lb-rt', 'rt-db-0'),
          edge('storage-lb-rt', 'rt-db-1'),
          edge('storage-lb-rt', 'rt-db-2'),
          // Analytics group sink
          edge('worker-an-0', 'storage-lb-an'),
          edge('worker-an-1', 'storage-lb-an'),
          edge('worker-an-2', 'storage-lb-an'),
          edge('worker-an-3', 'storage-lb-an'),
          edge('worker-an-4', 'storage-lb-an'),
          edge('worker-an-5', 'storage-lb-an'),
          edge('storage-lb-an', 'an-db-0'),
          edge('storage-lb-an', 'an-db-1'),
          edge('storage-lb-an', 'an-db-2'),
        ],
      };
    },
  },

  fileStorageAtScale: {
    id: 'fileStorageAtScale',
    order: 18,
    difficulty: 'hard',
    title: 'File Storage at Scale (Design Dropbox)',
    slug: 'Design a cloud file storage service like Dropbox / Google Drive. Three workloads (metadata, uploads, downloads) + sync fan-out.',
    blurb:
      'Design a Dropbox/Google Drive-style file storage service. The architecture-layer answer separates THREE workloads with very different bottlenecks: (1) metadata operations dominate — browse / search / list / share at 10,000 ops/sec, heavily read-skewed and absorbed by an internal Cache; (2) uploads at 100 chunks/sec bypass the backend via presigned URLs — Client wires DIRECTLY to Blob Storage so backend never sees the bytes; (3) downloads at 5,000 chunks/sec go through a CDN at the edge. A sync fan-out path uses a pubsub Queue (same mechanic as Kafka) to broadcast "new chunk landed" events to multiple consumer groups representing different device types. Metadata DBs (relational, sharded) are visually distinct from Blob Storage (object store; in real Dropbox: Magic Pocket — custom exabyte-scale infra running off AWS).',
    background: [
      'What this lesson teaches well — on the canvas. Three distinct request streams flow through the same backend with three distinct bottleneck stories: metadata ops (read-heavy, cache-absorbed, sharded relational), uploads (low rate, byte-heavy, bypass via presigned URLs straight to blob storage), downloads (CDN-absorbed at the edge). The architecture separates metadata from blob storage (different DB roles: `database:metadata` vs `database:blob`) — sim semantics are the same, but the visual distinction matches what every canonical Dropbox/GDrive answer draws.',
      'The presigned URL bypass — the load-bearing optimization. Upload Clients have TWO outgoing edges: a small "coordination" stream to the Upload Service (which writes a manifest entry to the Metadata DB cluster) AND a direct edge to Blob Storage carrying the actual chunks. Without this bypass, every byte would flow through backend bandwidth — 100 chunks/sec × 4MB each = 400 MB/sec the backend would have to absorb. With presigned URLs, the backend is sized for ops, not bytes. The architecture-layer answer is "two parallel paths from the client."',
      'Sync fan-out via pubsub Queue. When a chunk lands in Blob Storage, the user\'s OTHER devices need to know. We model the event stream as a synthetic Client `sync-trigger` (representing Blob Storage events) feeding a Queue with `pubsub: true` (same mechanic as Lesson 17 — every consumer group sees every event). Two consumer groups represent two device types: real-time (mobile / laptop, always-connected) and batch (server-side reconciliation, less time-sensitive). Each group has its own worker pool draining the full event stream into a device-local sync state DB.',
      'Why the workload numbers are what they are. Real Dropbox: 500M users, 100M DAU, 100B files (avg 100KB), exabytes of storage. Our 10k metadata ops/sec + 100 uploads/sec + 5k downloads/sec + 1k sync events/sec is whiteboard scale — same patterns, ~3 orders of magnitude smaller. The PROPORTIONS are what matter: metadata >> downloads >> uploads, sync events << metadata. In a 2026 interview, walk through capacity math at the rate the interviewer asks for; the architecture stays the same.',
      'Extra extra — Kafka-style components we DO draw, and Dropbox-style internals we do NOT. Reuses from earlier lessons: pubsub Queue + consumer groups (Lesson 17), DB cluster behind LB (Lesson 10), internal cache + CDN (Lessons 7 + 14), R/W edge split (Lesson 8). The `magicPocket` decorative node is the Dropbox-specific tell: it labels the blob storage as Dropbox\'s custom infrastructure (off AWS since ~2015, exabyte-scale, SMR drives, 12+ nines durability). What we do NOT draw: chunking + content-defined chunking, hash-based deduplication, the presigned-URL signing mechanism itself, the WebSocket-or-long-polling sync protocol, conflict resolution (last-write-wins / "conflicted copy"). All five are in `simplifications.md` — deep-dive talk-track material, not whiteboard items.',
      'Soft caveat — single-region modeling. Real Dropbox/GDrive runs in multiple regions with cross-region replication for disaster recovery + geographic latency. Our canvas models a single region. The patterns transfer (clusters + LBs scale within a region; cross-region adds a separate layer of replication mechanics we don\'t represent). For an interview, mention "we\'d also have regional replication via Mirror... " as a follow-up when asked about availability.',
      'Where to dig further. Research is in `puzzle-research/dropbox.md` (8 parseable sources including the HelloInterview deep dive, GeeksforGeeks scale numbers, and four Dropbox engineering posts on Magic Pocket). Architecture vs production-reality is the split: HelloInterview teaches the canonical S3-backed answer; Dropbox\'s blog explains why Magic Pocket replaced S3 for 90%+ of user data. Both belong in a senior-level answer.',
    ],
    sources: [
      { title: 'Hello Interview — Design a File Storage Service Like Dropbox', url: 'https://www.hellointerview.com/learn/system-design/problem-breakdowns/dropbox', note: 'Canonical whiteboard answer + 4 deep-dive questions (chunking, performance, security, sync)' },
      { title: 'GeeksforGeeks — Design Dropbox System Design', url: 'https://www.geeksforgeeks.org/system-design/design-dropbox-a-system-design-interview-question/', note: 'Concrete scale numbers (100M DAU, 100B files, 10PB) + component breakdown' },
      { title: 'DesignGurus — How to Design a Cloud Storage Service', url: 'https://www.designgurus.io/blog/design-cloud-storage-service', note: 'Microservice separation (Auth/Upload/Metadata/Storage/Sync) + pub/sub sync model' },
      { title: 'Medium / Double Pointer — System Design Interview: Dropbox / Google Drive', url: 'https://medium.com/double-pointer/system-design-interview-dropbox-or-a-similar-file-storage-sharing-service-google-drive-34912a4c1c21', note: 'Request queue + per-client response queue sync pattern; 2MB chunk variant' },
      { title: 'System Design School — Design Dropbox: Complete Walkthrough', url: 'https://systemdesignschool.io/problems/dropbox/solution', note: 'Long-polling sync + 4MB chunks + SHA-256 dedup' },
      { title: 'Dropbox Engineering — Scaling to Exabytes (Magic Pocket)', url: 'https://dropbox.tech/infrastructure/magic-pocket-infrastructure', note: 'The custom exabyte-scale blob storage Dropbox built off AWS' },
      { title: 'Dropbox Engineering — Inside the Magic Pocket', url: 'https://dropbox.tech/infrastructure/inside-the-magic-pocket', note: 'Magic Pocket internals: erasure coding, durability targets, immutability' },
      { title: 'Dropbox Engineering — Improving storage efficiency in Magic Pocket (2024-2025)', url: 'https://dropbox.tech/infrastructure/improving-storage-efficiency-in-magic-pocket-our-immutable-blob-store', note: 'Recent overhead-reduction work in the immutable blob store' },
    ],
    kind: 'flow',
    allowedComponents: [
      'client',
      'rateLimiter',
      'loadBalancer',
      { type: 'service', role: 'appServer' },
      { type: 'service', role: 'worker' },
      { type: 'cache', role: 'internal' },
      { type: 'cache', role: 'cdn' },
      'queue',
      { type: 'database', role: 'metadata' },
      { type: 'database', role: 'blob' },
      'magicPocket',
    ],
    initialNodes: () => [
      node('metadata-clients', 'client', { x: 40, y: 100 }, { rps: 10000, readRatio: 0.95 }),
      node('upload-coord-clients', 'client', { x: 40, y: 360 }, { rps: 100, readRatio: 0 }),
      node('upload-byte-clients', 'client', { x: 40, y: 500 }, { rps: 100, readRatio: 0 }),
      node('download-clients', 'client', { x: 40, y: 660 }, { rps: 5000, readRatio: 1 }),
      node('sync-trigger', 'client', { x: 40, y: 880 }, { rps: 1000, readRatio: 0 }),
    ],
    requirements: [
      {
        key: 'syncSuccess',
        label: 'Sync success rate ≥ 99% across all three workloads',
        test: (r) => r.successRate >= 0.99,
        lesson:
          '10k metadata ops + 100 uploads + 5k downloads = 15,100 ops/sec sync-side. Drop one of: the metadata cache (DB overload), ' +
          'the CDN (blob layer melts under downloads), the presigned-URL bypass (backend bandwidth dies) — and success rate falls.',
      },
      {
        key: 'asyncSuccess',
        label: 'Background success ≥ 99% (sync fan-out drains)',
        test: (r) => r.backgroundSuccessRate >= 0.99,
        lesson:
          'Sync events fan out to multiple consumer groups (each device type sees the full event stream). With `pubsub: true` on ' +
          'the Sync Queue and 2 consumer groups, totalBackgroundAttempted = 1000 × 2 = 2000. Each group\'s workers need to drain 1000/sec.',
      },
      {
        key: 'hasGateway',
        label: 'Has a Load Balancer (gateway)',
        predicate: { kind: 'presence', type: 'loadBalancer', min: 1 },
        lesson:
          'A gateway LB fronts the metadata path so traffic can be spread across multiple service instances. Real systems also include a Rate Limiter ' +
          '(429 Too Many Requests) — encouraged but not required for this predicate.',
      },
      {
        key: 'hasMetadataCluster',
        label: 'Metadata DB cluster: 2+ Databases tagged role:metadata',
        predicate: { kind: 'presence', type: 'database', role: 'metadata', min: 2 },
        lesson:
          'Metadata ops dominate load — browse + search + list + share + version history. Default DB cap is 1000; serving 10k ' +
          'metadata ops/sec needs a sharded cluster behind a LB. Each database node should be configured with role: \'metadata\'.',
      },
      {
        key: 'hasBlobStorage',
        label: 'Blob Storage cluster: 2+ Databases tagged role:blob',
        predicate: { kind: 'presence', type: 'database', role: 'blob', min: 2 },
        lesson:
          'Blob Storage is architecturally distinct from the Metadata DB — different access patterns, scale, cost model. Tag your ' +
          'storage nodes with role: \'blob\' so the canvas reads as a real Dropbox/GDrive diagram. Production reality is S3 (or Dropbox\'s ' +
          'Magic Pocket).',
      },
      {
        key: 'hasMetadataCache',
        label: 'Has an internal Cache (absorbs metadata reads)',
        predicate: { kind: 'presence', type: 'cache', role: 'internal', min: 1 },
        lesson:
          'Metadata reads are 95% of metadata ops (browse + search). Without a cache, 9,500 reads/sec slam the metadata DB cluster — over the ' +
          'aggregate 3,000 cap. An internal cache at 85% hit rate reduces DB read load to ~1,400/sec — well within capacity.',
      },
      {
        key: 'hasCdn',
        label: 'Has a CDN at the edge (absorbs downloads)',
        predicate: { kind: 'presence', type: 'cache', role: 'cdn', min: 1 },
        lesson:
          'Downloads at 5,000 chunks/sec would melt the blob layer if served from origin. A CDN at the edge with 90% hit rate ' +
          'reduces origin load to 500/sec — comfortable for the blob cluster.',
      },
      {
        key: 'hasSyncQueue',
        label: 'Has a Queue (for sync fan-out)',
        predicate: { kind: 'presence', type: 'queue', min: 1 },
        lesson:
          'Sync events fan out to multiple device types. A Queue with `pubsub: true` broadcasts each event to every consumer group (each ' +
          'group represents a different device class). Same mechanic as Lesson 17 (Kafka).',
      },
      {
        key: 'hasMultipleConsumerGroups',
        label: 'At least 2 consumer groups for sync',
        predicate: { kind: 'metric', name: 'consumerGroupCount', op: '>=', value: 2 },
        lesson:
          'Real Dropbox needs to sync to multiple device types (laptops, mobile, server-side reconciliation). Tag each Worker with its ' +
          'consumerGroup (e.g. "realtime-devices", "batch-devices") in the property panel. With the Sync Queue\'s `pubsub: true` flag, ' +
          'every group sees the full event stream independently.',
      },
    ],
    solution: () => ({
      // === Workload + capacity math (verified) ===
      // Metadata path (10k ops/sec, 95% read):
      //   → rate-limit (cap 12k) → gateway-lb (cap 12k) → 2 metadata-svcs at cap 5000 each
      //   each service: 4750 reads + 250 writes
      //   reads:  9500 total → metadata-cache (cap 12k, hit 0.85) absorbs 8075;
      //           1425 miss → metadata-db-lb → 3 metadata DBs (475 each)
      //   writes: 500 total → metadata-db-lb → 3 DBs (167 each)
      //   plus upload-service writes: 100 → 33 per DB
      //   each metadata DB: 475 + 167 + 33 = 675 ops/sec (cap 1000 ✓)
      //
      // Upload bytes (100/sec, presigned bypass):
      //   → blob-lb (cap 8000) → 3 blob-storages (cap 5000 each) → 33/sec each
      //
      // Download (5k/sec):
      //   → cdn (cap 1M, hit 0.9) absorbs 4500; 500 miss → blob-lb
      //   total at blob-lb: 100 uploads + 500 download misses = 600
      //   per blob storage: 200/sec (cap 5000 ✓)
      //
      // Sync (1000 events/sec, pubsub):
      //   → sync-queue (pubsub:true) with out-degree 2
      //   totalBackgroundAttempted = 1000 × 2 = 2000
      //   each consumer group's worker sees full 1000/sec
      //   workers (cap 1500) drain to per-group sink DBs (cap 2000)
      //   totalBackgroundServed = 2000 → 100%
      nodes: [
        // ─── Producers ─────────────────────────────────────────────────
        node('metadata-clients', 'client', { x: 40, y: 100 }, { rps: 10000, readRatio: 0.95 }),
        node('upload-coord-clients', 'client', { x: 40, y: 360 }, { rps: 100, readRatio: 0 }),
        node('upload-byte-clients', 'client', { x: 40, y: 500 }, { rps: 100, readRatio: 0 }),
        node('download-clients', 'client', { x: 40, y: 660 }, { rps: 5000, readRatio: 1 }),
        node('sync-trigger', 'client', { x: 40, y: 880 }, { rps: 1000, readRatio: 0 }),

        // ─── Metadata tier ────────────────────────────────────────────
        node('gateway-rate-limit', 'rateLimiter', { x: 240, y: 100 }, { capacity: 12000 }),
        node('gateway-lb', 'loadBalancer', { x: 440, y: 100 }, { capacity: 12000 }),
        node('metadata-svc-0', 'service', { x: 640, y: 40 }, { role: 'appServer', capacity: 5000 }),
        node('metadata-svc-1', 'service', { x: 640, y: 160 }, { role: 'appServer', capacity: 5000 }),
        node('metadata-cache', 'cache', { x: 840, y: 100 }, { role: 'internal', capacity: 12000, hitRate: 0.85 }),
        node('metadata-db-lb', 'loadBalancer', { x: 1040, y: 100 }, { capacity: 3000 }),
        node('metadata-db-0', 'database', { x: 1240, y: 20 }, { role: 'metadata', capacity: 1000 }),
        node('metadata-db-1', 'database', { x: 1240, y: 120 }, { role: 'metadata', capacity: 1000 }),
        node('metadata-db-2', 'database', { x: 1240, y: 220 }, { role: 'metadata', capacity: 1000 }),

        // ─── Upload coordination ──────────────────────────────────────
        node('upload-service', 'service', { x: 440, y: 360 }, { role: 'appServer', capacity: 200 }),

        // ─── Blob tier ─────────────────────────────────────────────────
        node('cdn', 'cache', { x: 240, y: 660 }, { role: 'cdn', hitRate: 0.9 }),
        node('blob-lb', 'loadBalancer', { x: 640, y: 580 }, { capacity: 8000 }),
        node('blob-storage-0', 'database', { x: 880, y: 480 }, { role: 'blob', capacity: 5000 }),
        node('blob-storage-1', 'database', { x: 880, y: 600 }, { role: 'blob', capacity: 5000 }),
        node('blob-storage-2', 'database', { x: 880, y: 720 }, { role: 'blob', capacity: 5000 }),
        node('magic-pocket', 'magicPocket', { x: 1120, y: 600 }, {}),

        // ─── Sync tier ─────────────────────────────────────────────────
        node('sync-queue', 'queue', { x: 240, y: 880 }, { topic: 'chunk-events', pubsub: true }),
        node('realtime-worker', 'service', { x: 440, y: 820 }, { role: 'worker', capacity: 1500, consumerGroup: 'realtime-devices' }),
        node('batch-worker', 'service', { x: 440, y: 940 }, { role: 'worker', capacity: 1500, consumerGroup: 'batch-devices' }),
        node('realtime-sink-db', 'database', { x: 640, y: 820 }, { role: 'metadata', capacity: 2000 }),
        node('batch-sink-db', 'database', { x: 640, y: 940 }, { role: 'metadata', capacity: 2000 }),
      ],
      edges: [
        // Metadata flow
        edge('metadata-clients', 'gateway-rate-limit'),
        edge('gateway-rate-limit', 'gateway-lb'),
        edge('gateway-lb', 'metadata-svc-0'),
        edge('gateway-lb', 'metadata-svc-1'),
        edge('metadata-svc-0', 'metadata-cache', 'read'),
        edge('metadata-svc-1', 'metadata-cache', 'read'),
        edge('metadata-cache', 'metadata-db-lb', 'read'),
        edge('metadata-svc-0', 'metadata-db-lb', 'write'),
        edge('metadata-svc-1', 'metadata-db-lb', 'write'),
        edge('metadata-db-lb', 'metadata-db-0'),
        edge('metadata-db-lb', 'metadata-db-1'),
        edge('metadata-db-lb', 'metadata-db-2'),

        // Upload coordination — writes a manifest into the metadata DB
        edge('upload-coord-clients', 'upload-service'),
        edge('upload-service', 'metadata-db-lb', 'write'),

        // Upload bytes — presigned URL bypass (Client direct to Blob Storage)
        edge('upload-byte-clients', 'blob-lb'),
        edge('blob-lb', 'blob-storage-0'),
        edge('blob-lb', 'blob-storage-1'),
        edge('blob-lb', 'blob-storage-2'),

        // Downloads — CDN at the edge, fall through to blob-lb on miss
        edge('download-clients', 'cdn'),
        edge('cdn', 'blob-lb'),

        // Sync fan-out — pubsub Queue broadcasts to 2 consumer groups
        edge('sync-trigger', 'sync-queue'),
        edge('sync-queue', 'realtime-worker'),
        edge('sync-queue', 'batch-worker'),
        edge('realtime-worker', 'realtime-sink-db'),
        edge('batch-worker', 'batch-sink-db'),
      ],
    }),
  },

  tinyurlAtScale: {
    id: 'tinyurlAtScale',
    order: 16,
    difficulty: 'hard',
    title: 'TinyURL at Interview Scale',
    blurb:
      'The canonical FAANG interview question: design a URL shortener at scale. 100 URL creates/sec from Posters, 10,000 redirects/sec from Visitors, plus 500 analytics events/sec that log every origin-side click. You\'re defending 8 questions interviewers ask: ID generation, collision avoidance, hot keys, caching, analytics logging, rate limiting, malicious URLs, link expiration. This puzzle answers 5 architecturally (CDN, KGS, RateLimiter, Cache, Queue+Workers); the other 3 (malicious filtering, TTL, custom aliases) are documented in simplifications.md as out-of-scope-for-the-canvas. Targets: reads ≥ 99%, writes ≥ 99%, background ≥ 99%, sync p99 ≤ 100ms, must use CDN + Rate Limiter + KGS + Queue.',
    kind: 'flow',
    allowedComponents: [
      'client',
      'loadBalancer',
      'rateLimiter',
      { type: 'cache', role: 'cdn' },
      { type: 'service', role: 'appServer' },
      { type: 'service', role: 'worker' },
      'kgs',
      'queue',
      { type: 'cache', role: 'internal' },
      'database',
    ],
    initialNodes: () => [
      node('posters', 'client', { x: 40, y: 60 }, { rps: 100, readRatio: 0 }),
      node('visitors', 'client', { x: 40, y: 280 }, { rps: 10000, readRatio: 1 }),
      node('analytics-gen', 'client', { x: 40, y: 540 }, { rps: 500, readRatio: 0 }),
    ],
    requirements: [
      {
        key: 'reads',
        label: 'Redirects served ≥ 99% (Visitors load short URLs)',
        test: (r) => r.readSuccessRate >= 0.99,
        lesson:
          '10k reads/sec can\'t hit the origin directly — a CDN at the edge absorbs the bulk; an internal Cache absorbs misses; ' +
          'the URL DB only sees the long-tail. Find which layer is dropping.',
      },
      {
        key: 'writes',
        label: 'Writes served ≥ 99% (URL creates + analytics events)',
        test: (r) => r.writeSuccessRate >= 0.99,
        lesson:
          'Writes include both Posters (URL creates → KGS → DB) and the Analytics Generator (events → Queue). If writes drop, ' +
          'check the KGS capacity (default 500 keys/sec — well over 100 needed) and that analytics events reach a Queue.',
      },
      {
        key: 'asyncSuccess',
        label: 'Background success ≥ 99% (analytics workers drain the queue)',
        test: (r) => r.backgroundSuccessRate >= 0.99,
        lesson:
          'Analytics events that enqueue must reach the Analytics DB through Workers. 500 events/sec needs 500 jobs/sec of ' +
          'Worker capacity. Watch the bottleneck row.',
      },
      {
        key: 'p99Latency',
        label: 'Sync p99 latency ≤ 100ms',
        test: (r) => r.avgP99Latency <= 100,
        lesson:
          'With CDN absorbing 95% of reads at ~5ms p99 and the rest passing through a cache (78ms p99 worst case), the served ' +
          'average lands well under 100ms. Without a CDN, every redirect pays the full origin chain.',
      },
      {
        key: 'hasCdn',
        label: 'Uses a CDN at the edge (handles hot keys, Q7+Q8)',
        predicate: { kind: 'presence', type: 'cache', role: 'cdn', min: 1 },
        lesson:
          'A CDN absorbs viral URLs at the edge — 95% hit rate keeps your origin out of the hot path. Without one, a celebrity ' +
          'sharing a short URL melts your service. (Source page Q7: "Should we cache?" Q8: "How do we handle hot keys?")',
      },
      {
        key: 'hasKgs',
        label: 'Uses a Key Generation Service (Q1+Q2)',
        predicate: { kind: 'presence', type: 'kgs', min: 1 },
        lesson:
          'KGS pre-generates short IDs offline and vends them to App Servers. Without it, every URL create costs a DB lookup ' +
          'to check "is this ID taken?" — turning writes into expensive collision checks. (Source page Q1: "How do you generate ' +
          'a unique short ID?" Q2: "How do you avoid collisions?")',
      },
      {
        key: 'hasRateLimiter',
        label: 'Uses a Rate Limiter at the gateway (Q4)',
        predicate: { kind: 'presence', type: 'rateLimiter', min: 1 },
        lesson:
          'A Rate Limiter sits between the public-facing edge and your origin, dropping abusive traffic above a per-second rate. ' +
          'Without it, a runaway client can saturate your App Servers. (Source page Q4: "Do we rate-limit requests from abusive clients?")',
      },
      {
        key: 'hasQueue',
        label: 'Uses a Queue for async analytics (Q6)',
        predicate: { kind: 'presence', type: 'queue', min: 1 },
        lesson:
          'Synchronously logging every redirect would couple read latency to your analytics-write speed. The Queue decouples: ' +
          'ack the redirect immediately, log asynchronously through Workers. (Source page Q6: "How do we store logs for analytics?")',
      },
    ],
    solution: () => ({
      // 100 writes + 10k reads + 500 analytics-events = three independent flows.
      //
      // Read path: Visitors → CDN (95% hit, 9500 served) → RateLimiter →
      //   LB → 2 Apps → Internal Cache (80% hit, 400 served) → URL DB (100 misses).
      // Write path: Posters → RateLimiter → LB → Apps → KGS → URL DB.
      // Analytics path: Analytics Gen → Analytics Queue → 2 Workers → Analytics DB.
      //
      // Numbers verified by hand:
      //   reads: 9500 + 400 + 100 = 10000 served, 100% rate.
      //   writes (Posters): 100, all reach URL DB. Analytics writes: 500 terminate at Queue.
      //   total writeSuccessRate = (100+500)/(100+500) = 100%.
      //   background: 500 jobs/sec drained by 2 Workers @ cap 250 each = 500 cap. 100%.
      //   p99 avg: CDN hits dominate at 5ms; weighted avg ~12ms.
      nodes: [
        node('posters', 'client', { x: 40, y: 60 }, { rps: 100, readRatio: 0 }),
        node('visitors', 'client', { x: 40, y: 280 }, { rps: 10000, readRatio: 1 }),
        node('cdn-1', 'cache', { x: 220, y: 280 }, { role: 'cdn' }),
        node('rate-limiter-1', 'rateLimiter', { x: 440, y: 180 }),
        node('lb-1', 'loadBalancer', { x: 640, y: 180 }),
        node('app-1', 'service', { x: 840, y: 100 }, { role: 'appServer' }),
        node('app-2', 'service', { x: 840, y: 280 }, { role: 'appServer' }),
        node('cache-1', 'cache', { x: 1060, y: 100 }, { role: 'internal' }),
        node('kgs-1', 'kgs', { x: 1060, y: 280 }),
        node('url-db', 'database', { x: 1280, y: 180 }),
        node('analytics-gen', 'client', { x: 40, y: 540 }, { rps: 500, readRatio: 0 }),
        node('analytics-queue', 'queue', { x: 320, y: 540 }),
        node('analytics-worker-1', 'service', { x: 560, y: 480 }, { role: 'worker', capacity: 250 }),
        node('analytics-worker-2', 'service', { x: 560, y: 600 }, { role: 'worker', capacity: 250 }),
        node('analytics-db', 'database', { x: 820, y: 540 }),
      ],
      edges: [
        // Read path
        edge('visitors', 'cdn-1', 'read'),
        edge('cdn-1', 'rate-limiter-1', 'read'),
        // Write path
        edge('posters', 'rate-limiter-1', 'write'),
        // Shared origin chain
        edge('rate-limiter-1', 'lb-1'),
        edge('lb-1', 'app-1'),
        edge('lb-1', 'app-2'),
        // Reads from apps → cache → DB on miss
        edge('app-1', 'cache-1', 'read'),
        edge('app-2', 'cache-1', 'read'),
        edge('cache-1', 'url-db', 'read'),
        // Writes from apps → KGS → URL DB
        edge('app-1', 'kgs-1', 'write'),
        edge('app-2', 'kgs-1', 'write'),
        edge('kgs-1', 'url-db', 'write'),
        // Analytics pipeline (independent flow)
        edge('analytics-gen', 'analytics-queue'),
        edge('analytics-queue', 'analytics-worker-1'),
        edge('analytics-queue', 'analytics-worker-2'),
        edge('analytics-worker-1', 'analytics-db'),
        edge('analytics-worker-2', 'analytics-db'),
      ],
    }),
  },

  ecommerceAtScale: {
    id: 'ecommerceAtScale',
    order: 19,
    difficulty: 'hard',
    title: 'E-Commerce at Scale (Design Amazon)',
    slug: 'Design an Amazon-class e-commerce site. Three workloads with different consistency regimes + an async saga at checkout.',
    blurb:
      'Design an e-commerce backend that serves a 100:10:1 browse-vs-cart-vs-checkout workload from one canvas. The architecture-layer answer is THREE sync flows with different consistency regimes — (1) catalog browsing at 10,000 ops/sec, 98% reads, AP/eventually consistent, absorbed by a CDN at the edge + an internal cache in front of a sharded catalog DB; (2) cart at 1,000 ops/sec, AP-biased (Werner Vogels: "we always want to honor cart adds — revenue producing"), cache + DB cluster; (3) checkout at 100 ops/sec, CP/strongly consistent, writes hit an Order Service that posts to an Order Queue. The Queue uses `pubsub: true` so each order event fans out to THREE consumer groups (inventory, payment, notification) running the saga in parallel. Idempotency keys + compensating transactions + flash-sale contention live in the lesson copy + simplifications.md (talk-track, not canvas).',
    background: [
      'What this lesson teaches well — on the canvas. Three distinct request streams share one backend with three distinct bottleneck stories: browse (read-heavy, CDN+cache absorbs, sharded DB serves the long tail), cart (balanced read/write, AP-biased, cache+DB), checkout (writes-only, hits a pubsub Queue and triggers an async saga). The three flows have three different consistency regimes — and you can see all three on the canvas.',
      'Cart = AP, Order = CP — the Werner Vogels framing. "[For the shopping cart] we always want to honor requests to add items… it\'s revenue producing. In this case you choose high availability — errors are hidden from the customer and sorted out later." Same customer, same site, but the system biases toward AP for cart edits and CP for order submission. Multiple downstream services (inventory, payment, notification) need to see the same authoritative state when an order lands. This is a textbook example of the consistency-availability trade-off applied per-feature, not per-system.',
      'The pubsub Queue as a saga substrate. When checkout happens, the Order Service writes ONE event to the Order Queue. With `pubsub: true` (same mechanic as Lesson 17 — Kafka topics with multiple consumer groups), three downstream worker pools each see the full event stream: one runs inventory reservation, one runs payment, one runs notifications. This is the choreography flavor of the saga pattern. If payment fails, the Payment Worker publishes a compensation event that the others react to (compensating-transaction logic is talk-track, not on canvas).',
      'Why the workload numbers are what they are. Real Amazon: 300M+ products, ~1.5M orders/day, billions of catalog reads/day. Our 10,000 browse + 1,000 cart + 100 checkout is whiteboard scale. The PROPORTIONS are what matter: browse ≫ cart ≫ checkout. Each Order triggers a fan-out of 3 saga events, so the async load is 300 jobs/sec. Same proportions hold from whiteboard to Amazon — in a real interview, walk through capacity math at the rate the interviewer asks for; the architecture stays the same.',
      'Extra extra — patterns we DO draw vs do NOT draw. Drawn: pubsub Queue + consumer groups (Lesson 17), CDN at edge + internal Cache (Lessons 7+14), sharded DB cluster behind LB (Lesson 10), R/W edge split (Lesson 8). NOT drawn: idempotency keys for payment retries (Stripe pattern), compensating transactions / saga rollback, product search (ElasticSearch / OpenSearch — same cache-fronted DB pattern as catalog), recommendations (pre-computed cache, refreshed offline by Spark/Hadoop), flash-sale contention (purchase tokens, partitioned inventory locks). All five are in `simplifications.md` — senior-level talk-track, not whiteboard items.',
      'Soft caveat — single-region modeling. Real Amazon spans multiple regions for DR + geographic latency. Our canvas models one region. The patterns transfer (LB + cluster scale within a region; cross-region adds a layer of replication mechanics we don\'t represent here). For an interview, mention "we\'d also add multi-region active-passive with cross-region replication for the Order/Inventory DBs" as a follow-up when asked about availability. The Regional/SRE track is on the roadmap.',
      'Where to dig further. Research is in `puzzle-research/ecommerce.md` (8 parseable sources including the Werner Vogels CAP-theorem trade-off interview, microservices.io\'s canonical saga pattern reference, Stripe\'s idempotency blog post, and HelloInterview\'s multi-step-processes pattern). Architecture vs production-reality: HelloInterview / SystemDesignHandbook teach the canonical microservices answer; the highscalability.com Werner Vogels piece explains WHY Amazon biased cart toward AP and checkout toward CP. Both belong in a senior-level answer.',
    ],
    sources: [
      { title: 'Highscalability — Amazon Architecture (Werner Vogels)', url: 'https://highscalability.com/amazon-architecture/', note: 'Cart = AP, Checkout = CP — the CAP-theorem trade-off applied per-feature' },
      { title: 'microservices.io — Saga Pattern', url: 'https://microservices.io/patterns/data/saga.html', note: 'Canonical saga reference: choreography vs orchestration, compensating transactions' },
      { title: 'Stripe Engineering — Designing Robust APIs (Idempotency)', url: 'https://stripe.com/blog/idempotency', note: 'Idempotency keys for payment retries; exponential backoff + jitter' },
      { title: 'CodeKarle — Amazon System Design', url: 'https://www.codekarle.com/system-design/Amazon-system-design.html', note: 'Full service decomposition + pre-deduction inventory + Redis-with-TTL reconciliation' },
      { title: 'Hello Interview — Multi-step Processes Pattern', url: 'https://www.hellointerview.com/learn/system-design/patterns/multi-step-processes', note: 'How to handle multi-step e-commerce flows with sagas + workflow systems (Temporal, Cadence)' },
      { title: 'systemdesignhandbook.com — Design E-Commerce System', url: 'https://www.systemdesignhandbook.com/guides/design-e-commerce-system-design/', note: 'Consistency boundaries explicit: strong for money/orders/inventory, eventual for catalog/cart/search/recs' },
      { title: 'Medium / Siddhi Gaikwad — Saga in E-Commerce Checkout', url: 'https://medium.com/@siddhi.gaikwad.iitb/understanding-the-saga-design-pattern-through-an-e-commerce-checkout-flow-65eb015e8654', note: 'Three-step saga walkthrough with compensation map' },
      { title: 'IGotAnOffer — Amazon System Design Interview Guide', url: 'https://igotanoffer.com/en/advice/amazon-system-design-interview', note: 'Interview-format context for Amazon system design questions' },
    ],
    kind: 'flow',
    allowedComponents: [
      'client',
      'loadBalancer',
      { type: 'cache', role: 'cdn' },
      { type: 'cache', role: 'internal' },
      { type: 'service', role: 'appServer' },
      { type: 'service', role: 'worker' },
      'queue',
      { type: 'database', role: 'metadata' },
    ],
    initialNodes: () => [
      node('browse-clients', 'client', { x: 40, y: 100 }, { rps: 10000, readRatio: 1.0 }),
      node('cart-clients', 'client', { x: 40, y: 400 }, { rps: 1000, readRatio: 0.5 }),
      node('checkout-clients', 'client', { x: 40, y: 700 }, { rps: 100, readRatio: 0 }),
    ],
    requirements: [
      {
        key: 'syncSuccess',
        label: 'Sync success rate ≥ 99% across all three workloads',
        test: (r) => r.successRate >= 0.99,
        lesson:
          '10,000 browse + 1,000 cart + 100 checkout = 11,100 ops/sec sync-side. Drop one of: the CDN (catalog tier melts under raw browse), the catalog cache (sharded DB sees 1,000/sec — over the per-shard cap), the cart cache (cart DB doubles up on reads), or the Order Queue (checkout latency balloons + chain failures cascade) — and success rate falls.',
      },
      {
        key: 'asyncSuccess',
        label: 'Background success ≥ 99% (saga fan-out drains)',
        test: (r) => r.backgroundSuccessRate >= 0.99,
        lesson:
          'Order events fan out to three saga concerns (inventory, payment, notification). With `pubsub: true` on the Order Queue and 3 consumer groups, totalBackgroundAttempted = 100 × 3 = 300. Each consumer group\'s worker pool needs to drain 100/sec into its sink.',
      },
      {
        key: 'hasCdn',
        label: 'Has a CDN at the edge (absorbs browse)',
        predicate: { kind: 'presence', type: 'cache', role: 'cdn', min: 1 },
        lesson:
          'Browse at 10,000 ops/sec would melt the catalog tier if served from origin. A CDN at the edge with 90% hit rate reduces origin load to 1,000/sec — comfortable for the catalog service cluster.',
      },
      {
        key: 'hasCatalogCache',
        label: 'Has an internal Cache (absorbs catalog reads)',
        predicate: { kind: 'presence', type: 'cache', role: 'internal', min: 1 },
        lesson:
          'Even after the CDN absorbs 90% of browse, 1,000 reads/sec still hit the catalog service tier. Without an internal cache, those 1,000 reads all hit the sharded catalog DB cluster — over the per-shard cap. An internal cache at 85% hit rate reduces DB read load to ~150/sec.',
      },
      {
        key: 'hasCatalogShards',
        label: 'Catalog DB cluster: 3+ databases tagged role:metadata',
        predicate: { kind: 'presence', type: 'database', role: 'metadata', min: 3 },
        lesson:
          'Even at 150 reads/sec (after the cache), one DB would be a single point of failure. Three sharded DBs behind a load balancer spread load and survive a single node failure. Tag each with role: metadata.',
      },
      {
        key: 'hasOrderQueue',
        label: 'Has a Queue (for async order fan-out)',
        predicate: { kind: 'presence', type: 'queue', min: 1 },
        lesson:
          'Checkout writes hit an Order Queue so the saga runs async. Without a queue, checkout latency = sum of all downstream steps (reserve inventory + charge payment + notify) and a failure mid-chain cascades back to the user. The queue makes checkout snappy and tolerates downstream wobbles.',
      },
      {
        key: 'hasSagaConsumerGroups',
        label: 'At least 3 consumer groups for the saga (inventory + payment + notification)',
        predicate: { kind: 'metric', name: 'consumerGroupCount', op: '>=', value: 3 },
        lesson:
          'The order saga has three concerns: reserve inventory, charge payment, fire notifications. Each gets its own Worker pool with a distinct consumerGroup tag (e.g. "inventory-saga", "payment-saga", "notification-saga"). With the Order Queue\'s `pubsub: true` flag, every order event reaches every consumer group independently — same Kafka mechanic as Lesson 17.',
      },
    ],
    solution: () => ({
      // === Workload + capacity math (verified) ===
      //
      // Browse path (10,000 r/s, 100% reads):
      //   → cdn (cap 50000, hit 0.9) absorbs 9000; 1000 miss
      //   → browse-lb (cap 2000) → catalog-svc × 2 (cap 2000 each)
      //   each catalog-svc: 500 reads
      //   → catalog-cache (cap 5000, hit 0.85) absorbs 850
      //   150 miss → catalog-db-lb (cap 1000)
      //   → 3 catalog DBs (cap 300 each) — 50 each (cap 300 ✓)
      //
      // Cart path (1,000 r/s, 50/50):
      //   → cart-svc (cap 1500): 500 reads + 500 writes
      //   reads → cart-cache (cap 2000, hit 0.7) absorbs 350; 150 miss
      //   writes → cart-cache (pass-through) → cart-db
      //   cart-db sees 150 reads + 500 writes = 650 ops/s (cap 1500 ✓)
      //
      // Checkout path (100 w/s, all writes):
      //   → order-svc (cap 200) → order-queue (pubsub:true, accepts 100 ✓)
      //
      // Async (saga fan-out via pubsub):
      //   order-queue with out-degree 3 → totalBackgroundAttempted = 100 × 3 = 300
      //   each worker (cap 200) drains its 100/s feed
      //   each sink DB (cap 200) accepts 100 ✓
      //   totalBackgroundServed = 300 → 100% ✓
      nodes: [
        // ─── Producers ─────────────────────────────────────────────────
        node('browse-clients', 'client', { x: 40, y: 100 }, { rps: 10000, readRatio: 1.0 }),
        node('cart-clients', 'client', { x: 40, y: 400 }, { rps: 1000, readRatio: 0.5 }),
        node('checkout-clients', 'client', { x: 40, y: 700 }, { rps: 100, readRatio: 0 }),

        // ─── Browse tier ──────────────────────────────────────────────
        node('cdn', 'cache', { x: 240, y: 100 }, { role: 'cdn', capacity: 50000, hitRate: 0.9 }),
        node('browse-lb', 'loadBalancer', { x: 440, y: 100 }, { capacity: 2000 }),
        node('catalog-svc-0', 'service', { x: 640, y: 40 }, { role: 'appServer', capacity: 2000 }),
        node('catalog-svc-1', 'service', { x: 640, y: 160 }, { role: 'appServer', capacity: 2000 }),
        node('catalog-cache', 'cache', { x: 840, y: 100 }, { role: 'internal', capacity: 5000, hitRate: 0.85 }),
        node('catalog-db-lb', 'loadBalancer', { x: 1040, y: 100 }, { capacity: 1000 }),
        node('catalog-db-0', 'database', { x: 1240, y: 20 }, { role: 'metadata', capacity: 300 }),
        node('catalog-db-1', 'database', { x: 1240, y: 120 }, { role: 'metadata', capacity: 300 }),
        node('catalog-db-2', 'database', { x: 1240, y: 220 }, { role: 'metadata', capacity: 300 }),

        // ─── Cart tier ────────────────────────────────────────────────
        node('cart-svc', 'service', { x: 440, y: 400 }, { role: 'appServer', capacity: 1500 }),
        node('cart-cache', 'cache', { x: 640, y: 400 }, { role: 'internal', capacity: 2000, hitRate: 0.7 }),
        node('cart-db', 'database', { x: 840, y: 400 }, { role: 'metadata', capacity: 1500 }),

        // ─── Checkout tier + saga ────────────────────────────────────
        node('order-svc', 'service', { x: 440, y: 700 }, { role: 'appServer', capacity: 200 }),
        node('order-queue', 'queue', { x: 640, y: 700 }, { topic: 'order-events', pubsub: true }),
        node('inventory-worker', 'service', { x: 840, y: 600 }, { role: 'worker', capacity: 200, consumerGroup: 'inventory-saga' }),
        node('payment-worker', 'service', { x: 840, y: 720 }, { role: 'worker', capacity: 200, consumerGroup: 'payment-saga' }),
        node('notification-worker', 'service', { x: 840, y: 840 }, { role: 'worker', capacity: 200, consumerGroup: 'notification-saga' }),
        node('inventory-db', 'database', { x: 1040, y: 600 }, { role: 'metadata', capacity: 200 }),
        node('payment-gateway', 'database', { x: 1040, y: 720 }, { role: 'metadata', capacity: 200 }),
        node('notification-sink', 'database', { x: 1040, y: 840 }, { role: 'metadata', capacity: 200 }),
      ],
      edges: [
        // Browse path
        edge('browse-clients', 'cdn'),
        edge('cdn', 'browse-lb'),
        edge('browse-lb', 'catalog-svc-0'),
        edge('browse-lb', 'catalog-svc-1'),
        edge('catalog-svc-0', 'catalog-cache'),
        edge('catalog-svc-1', 'catalog-cache'),
        edge('catalog-cache', 'catalog-db-lb'),
        edge('catalog-db-lb', 'catalog-db-0'),
        edge('catalog-db-lb', 'catalog-db-1'),
        edge('catalog-db-lb', 'catalog-db-2'),

        // Cart path
        edge('cart-clients', 'cart-svc'),
        edge('cart-svc', 'cart-cache'),
        edge('cart-cache', 'cart-db'),

        // Checkout + saga fan-out (pubsub queue × 3 consumer groups)
        edge('checkout-clients', 'order-svc'),
        edge('order-svc', 'order-queue'),
        edge('order-queue', 'inventory-worker'),
        edge('order-queue', 'payment-worker'),
        edge('order-queue', 'notification-worker'),
        edge('inventory-worker', 'inventory-db'),
        edge('payment-worker', 'payment-gateway'),
        edge('notification-worker', 'notification-sink'),
      ],
    }),
  },

  flashSaleAtScale: {
    id: 'flashSaleAtScale',
    order: 19.1,
    difficulty: 'hard',
    title: 'Flash Sale Spike (Bulkhead a Hot SKU)',
    slug: 'Follow-up to L19: a 500 r/s flash-sale spike for a hot SKU melts the shared order tier. Protect normal checkout by giving the spike its own lane.',
    blurb:
      'This is a follow-up to Lesson 19. The full e-commerce canvas is pre-populated — your job is the spike. A flash-sale launch (PS5, concert tickets, viral SKU) drives 500 r/s of order intents for ONE product. Wired into the shared Order Service, that spike will starve normal checkout traffic — the Order Svc capacity (cap 200) gets crushed and 80% of orders drop. The pattern: BULKHEAD the flash-sale traffic into its own lane (separate Queue + Worker + DB) so the spike can\'t cascade into normal checkout. Plus a RATE LIMITER at the gateway returns 429 to most flash-sale visitors (the architecture says "most are turned away by design — there\'s only one PS5 left"). Background success ≥ 99% and total sync ≥ 95% (the rate-limiter\'s 429s ARE expected drops).',
    background: [
      'What this lesson teaches well — on the canvas. Bulkheading (give the spike its own lane so it can\'t starve the shared resources) + rate limiting (throttle the input below downstream capacity, accept that most visitors get 429). Both patterns are real-world flash-sale architecture — used by Ticketmaster, Sony PlayStation Direct, every concert-on-sale system. The teaching is "isolate the hot lane + admit only what downstream can serve."',
      'The Werner Vogels framing for spikes. A flash-sale spike is the inverse of cart\'s AP-bias: it\'s a deliberate AVAILABILITY rejection. The system EXPLICITLY says "we cannot serve you" (HTTP 429 Too Many Requests) to 60-80% of flash-sale visitors, because the inventory only exists for 100 customers. The pedagogical insight: dropping requests is NOT a system failure — it\'s the correct response to an unservable spike. Real Ticketmaster shows a waiting room with a "your turn" position; same idea, friendlier UX.',
      'Why bulkhead + rate-limit, not just rate-limit. Imagine you only added the Rate Limiter (no bulkhead): the admitted flash-sale traffic still flows through the SHARED Order Service. Even after the limiter trims it down, the shared queue + workers see TWO competing event streams (normal + flash) — and the saga workers (cap 200 each) get squeezed. With BULKHEAD too, the flash-sale lane has its own queue + worker + DB; normal checkout\'s saga is mathematically untouched. This is the difference between throttling INPUT and isolating BLAST RADIUS.',
      'Patterns NOT shown — talk-track only. (1) Purchase tokens / waiting room: visitors request a token; only the first N get one; the rest see a queue position. Conceptually similar to rate-limiter + queue, but with a visible UX. (2) Partitioned inventory locks: the 100-unit count split across 10 partitions; each partition has its own lock, distributing contention. Real-world for very-hot SKUs at very-high scale. (3) Optimistic concurrency on inventory rows (version counters + conditional update). All three appear in simplifications.md.',
      'Why the success-rate threshold is 95% not 99%. Rate-limiter drops are intentional. 500 r/s spike with a 200 r/s admission cap means 60% of flash-sale visitors get 429 — they are turned away, by design. The combined sync success rate works out to 97.4% (L19\'s 11,100 of 11,100 + flash\'s 200 of 500). Setting the bar at 95% accepts the deliberate drops; setting it at 99% would force you to admit ALL flash traffic (which would melt inventory). The 95% threshold is HOW you encode "drops are OK here" in the puzzle math.',
      'Soft caveat — single-region modeling. Real flash-sale architecture often combines multi-region routing (some regions absorb the spike, some don\'t) with token systems. We model single-region. The bulkhead + rate-limit patterns transfer to multi-region; cross-region adds DNS / geo-routing layers.',
      'Where to dig further. Research is in `puzzle-research/ecommerce.md` (the systemdesignhandbook source has the explicit flash-sale section: "Flash sales require partitioning, queueing, or purchase tokens to manage contention"). Real-world deep dives: Ticketmaster\'s queue-it integration, Shopify\'s flash-sale stack ("BFCM live map"), the Werner Vogels Amazon CAP-theorem framing applied to spikes.',
    ],
    sources: [
      { title: 'systemdesignhandbook.com — Design E-Commerce System (flash-sale section)', url: 'https://www.systemdesignhandbook.com/guides/design-e-commerce-system-design/', note: 'Explicit: "Flash sales require partitioning, queueing, or purchase tokens to manage contention"' },
      { title: 'Highscalability — Amazon Architecture (Werner Vogels CAP)', url: 'https://highscalability.com/amazon-architecture/', note: 'The "explicit availability rejection" framing — dropping is a valid system response' },
      { title: 'Hello Interview — Multi-step Processes Pattern', url: 'https://www.hellointerview.com/learn/system-design/patterns/multi-step-processes', note: 'Saga / workflow context that the flash lane mirrors at smaller scale' },
      { title: 'Stripe Engineering — Designing Robust APIs (Idempotency + retries)', url: 'https://stripe.com/blog/idempotency', note: 'Rate-limited retries with exponential backoff — same primitive used by waiting-room systems' },
    ],
    kind: 'flow',
    allowedComponents: [
      'client',
      'rateLimiter',
      'loadBalancer',
      { type: 'cache', role: 'cdn' },
      { type: 'cache', role: 'internal' },
      { type: 'service', role: 'appServer' },
      { type: 'service', role: 'worker' },
      'queue',
      { type: 'database', role: 'metadata' },
    ],
    initialNodes: () => {
      // Pre-populate the full L19 canvas (so the student starts from a
      // working e-commerce backend) PLUS a new unwired flash-sale client
      // group representing the spike. The student's job is to add the flash
      // lane (rate limiter + queue + worker + DB), not rebuild L19.
      const l19 = puzzles.ecommerceAtScale.solution();
      return [
        ...l19.nodes,
        node('flash-sale-clients', 'client', { x: 40, y: 1020 }, { rps: 500, readRatio: 0 }),
      ];
    },
    initialEdges: () => puzzles.ecommerceAtScale.solution().edges,
    requirements: [
      {
        key: 'syncSuccess',
        label: 'Sync success rate ≥ 95% (rate-limiter drops are expected)',
        test: (r) => r.successRate >= 0.95,
        lesson:
          'Flash-sale rejections are INTENTIONAL — most visitors get 429 because the inventory only exists for ~100 customers. The 95% threshold accepts the rate-limiter drops; setting it at 99% would force you to admit all 500 r/s (which would melt the inventory worker).',
      },
      {
        key: 'asyncSuccess',
        label: 'Background success ≥ 99% (saga + flash worker drain)',
        test: (r) => r.backgroundSuccessRate >= 0.99,
        lesson:
          'The L19 saga (300 jobs/sec from 100 orders × 3 consumer groups) plus the flash inventory worker (200 jobs/sec from admitted flash orders) must all drain. If the flash lane isn\'t bulkheaded, the saga workers compete with flash for the same 200 cap and drop saga events.',
      },
      {
        key: 'hasFlashRateLimiter',
        label: 'Has a Rate Limiter (throttle the flash spike at the gateway)',
        predicate: { kind: 'presence', type: 'rateLimiter', min: 1 },
        lesson:
          'Without admission control, 500 r/s of flash traffic hits whatever you wired it to and either melts that component or competes with normal traffic. A Rate Limiter at the gateway caps the spike to ~200 r/s (matching downstream capacity) and returns 429 Too Many Requests for the rest. This is real flash-sale architecture — Ticketmaster + PlayStation Direct + Shopify all do this.',
      },
      {
        key: 'hasFlashLane',
        label: 'Bulkheaded flash lane: at least 2 Queues on the canvas',
        predicate: { kind: 'presence', type: 'queue', min: 2 },
        lesson:
          'Bulkheading = give the flash-sale spike its own Queue + Worker + DB so it can\'t contend with the shared saga workers. With one queue (the L19 Order Queue): admitted flash traffic still fans out through the same 3 saga workers, squeezing normal checkout. With two queues (Order Queue + Flash Queue), the flash worker drains independently and the L19 saga is untouched.',
      },
    ],
    solution: () => {
      // Inherit L19 canonical entirely, then ADD the flash lane:
      //   flash-sale-clients (500 r/s)
      //     → flash-rate-limiter (cap 200, drops 300 at 429)
      //     → flash-order-queue (work-queue; not pubsub — single consumer)
      //     → flash-inventory-worker (cap 200, group 'flash-inventory')
      //     → flash-inventory-db (cap 200)
      //
      // Sync math:
      //   L19 paths unchanged: 11,100 served / 11,100 attempted
      //   Flash: 500 attempted → 200 admitted by rate limiter → 200 enqueued
      //   Combined sync: 11,300 served / 11,600 attempted = 97.4% (passes 95%)
      //
      // Async math:
      //   L19 saga: 300 jobs/sec served (unchanged from L19)
      //   Flash: 200 jobs/sec into worker (cap 200) → 200 served
      //   Combined async: 500 served / 500 attempted = 100%
      const l19 = puzzles.ecommerceAtScale.solution();
      return {
        nodes: [
          ...l19.nodes,
          node('flash-sale-clients', 'client', { x: 40, y: 1020 }, { rps: 500, readRatio: 0 }),
          node('flash-rate-limiter', 'rateLimiter', { x: 240, y: 1020 }, { capacity: 200 }),
          node('flash-order-queue', 'queue', { x: 440, y: 1020 }, { topic: 'flash-sale-orders', pubsub: false }),
          node('flash-inventory-worker', 'service', { x: 640, y: 1020 }, { role: 'worker', capacity: 200, consumerGroup: 'flash-inventory' }),
          node('flash-inventory-db', 'database', { x: 840, y: 1020 }, { role: 'metadata', capacity: 200 }),
        ],
        edges: [
          ...l19.edges,
          edge('flash-sale-clients', 'flash-rate-limiter'),
          edge('flash-rate-limiter', 'flash-order-queue'),
          edge('flash-order-queue', 'flash-inventory-worker'),
          edge('flash-inventory-worker', 'flash-inventory-db'),
        ],
      };
    },
  },

  searchAtScale: {
    id: 'searchAtScale',
    order: 19.2,
    difficulty: 'hard',
    title: 'Search at Scale (ElasticSearch + indexing pipeline)',
    slug: 'Follow-up to L19: add a separate search architecture. Sharded search index + async indexing pipeline from the catalog. Two layers, one read path, one write path.',
    blurb:
      'This is a follow-up to Lesson 19. The full e-commerce canvas is pre-populated — your job is the search architecture. In real systems, full-text search runs on a read-optimized derivative of the catalog (ElasticSearch / OpenSearch / Solr), NOT the catalog DB itself. The architecture has TWO independent paths: (1) a QUERY path (Search Clients → Search Service → Search Cache → sharded Search Index cluster) — separate from catalog browsing, optimized for inverted-index lookup; (2) an async INDEXING pipeline (Item Updates → Indexing Queue → Indexing Workers → Search Index) — pulls change events from the auth store and writes search documents. Eventually-consistent by design (1-5 second lag is normal). New role: `database:searchIndex` (amber color). Reuses the existing CDC + Queue + Workers pattern from L17/L19.',
    background: [
      'What this lesson teaches well — on the canvas. Search is its own architectural layer beside the auth store, not on top of it. The auth store (Catalog DB) is the source of truth for writes; the Search Index is a read-optimized derivative populated asynchronously via CDC + Kafka + Indexing Workers. You can see both layers on the canvas: the L19 catalog tier is the auth store; the new search tier sits beside it with its own read path and its own write pipeline.',
      'Why ElasticSearch is its own component (`database:searchIndex`). A relational metadata DB and a search index look similar in a hand-drawn diagram but differ at every important axis: data structure (B-tree vs inverted index), access pattern (key lookup vs full-text query), consistency model (strongly consistent vs eventually consistent with the auth store), capacity profile (1k ops/sec vs 10-50k), latency profile (relational 30ms vs in-memory inverted-index ~5ms). The amber `Search Index` node on the canvas signals "this is the search tier" at a glance — matches how every senior-level system design diagram draws it.',
      'The async indexing pipeline — the load-bearing pattern. Indexing is expensive: Lucene segments + segment merges + replica syncs. Synchronous indexing on the catalog write path would slow every write 10-100x. The async pipeline lets the source DB commit fast; the indexing pipeline catches up in seconds. Real production: CDC reads change events from Postgres / DynamoDB → Kafka topic → Flink (or Kafka consumers) curate search documents → bulk-write to ES. We model this as a synthetic `item-updates` Client (50 events/sec, representing CDC) → Indexing Queue → 2 Indexing Workers → Search Index.',
      'Sharding + replication on the search index. A single search index is a SPOF + a throughput bottleneck. Real ES clusters shard for parallel query (each shard answers its portion in parallel; results merged at the coordinating node) AND replicate each shard Y ways for availability + throughput (total query TPS = X × Y). 3 shards behind a load balancer is the minimum viable cluster.',
      'Patterns NOT modeled here — talk-track only. (1) Ranking / relevance: TF-IDF, BM25, learning-to-rank, personalization signals. Massive topic; not on canvas. (2) Autocomplete / type-ahead: separate cache + prefix-trie. (3) Spell correction / fuzzy matching: Lucene feature. (4) Synonym expansion, multilingual search. (5) Index rebuild pipelines (when schema changes, reindex everything from the auth store — a real operational concern). All in simplifications.md.',
      'Soft caveat — eventual consistency. "I just updated the product price and it doesn\'t show in search yet" is normal for real systems. The indexing pipeline has lag — typically 1-5 seconds in production ES setups. In an interview, mention this as a known trade-off: the alternative (synchronous indexing) makes every write 10-100x slower and creates tight coupling between auth store and search tier.',
      'Where to dig further. Research is in `puzzle-research/search-at-scale.md` (Hello Interview ES deep dive + FB Post Search problem breakdown + DoorDash + Confluent production blog posts). The Hello Interview ES deep dive is the single best summary for interview prep.',
    ],
    sources: [
      { title: 'Hello Interview — Elasticsearch Deep Dive for System Design Interviews', url: 'https://www.hellointerview.com/learn/system-design/deep-dives/elasticsearch', note: 'Canonical interview reference: ES as a search layer, CDC + Kafka pipeline, inverted index, sharding + replication' },
      { title: 'Hello Interview — Design Facebook\'s Post Search', url: 'https://www.hellointerview.com/learn/system-design/problem-breakdowns/fb-post-search', note: 'Concrete numbers + service decomposition: Query Service / Ingestion Service / inverted index in Redis' },
      { title: 'Confluent — Building a Scalable Search Architecture', url: 'https://www.confluent.io/blog/building-a-scalable-search-architecture/', note: 'Production blueprint: Kafka + Flink + ElasticSearch as the canonical pipeline' },
      { title: 'DoorDash Engineering — Faster Indexing with Kafka + ES', url: 'https://careersatdoordash.com/blog/open-source-search-indexing/', note: 'Real-world Kafka + ES indexing pipeline at production scale' },
    ],
    kind: 'flow',
    allowedComponents: [
      'client',
      'loadBalancer',
      { type: 'cache', role: 'cdn' },
      { type: 'cache', role: 'internal' },
      { type: 'service', role: 'appServer' },
      { type: 'service', role: 'worker' },
      'queue',
      { type: 'database', role: 'metadata' },
      { type: 'database', role: 'searchIndex' },
    ],
    initialNodes: () => {
      // Pre-populate the full L19 canvas + add the new search-side producers
      // (Search Clients for queries + Item Updates as a synthetic CDC source
      // representing catalog change events). The student wires the search
      // pipeline and the indexing pipeline.
      const l19 = puzzles.ecommerceAtScale.solution();
      return [
        ...l19.nodes,
        node('search-clients', 'client', { x: 40, y: 1020 }, { rps: 2000, readRatio: 1.0 }),
        node('item-updates', 'client', { x: 40, y: 1300 }, { rps: 50, readRatio: 0 }),
      ];
    },
    initialEdges: () => puzzles.ecommerceAtScale.solution().edges,
    requirements: [
      {
        key: 'syncSuccess',
        label: 'Sync success rate ≥ 99% across all four workloads',
        test: (r) => r.successRate >= 0.99,
        lesson:
          'L19\'s 11,100 + 2,000 search queries + 50 item-update events = 13,150 sync ops. Drop the Search Cache (shards melt under 2k r/s), miss the search index sharding (single shard hot), or skip the search path entirely (Search Clients drop to 0% served) — success rate falls.',
      },
      {
        key: 'asyncSuccess',
        label: 'Background success ≥ 99% (saga + indexing pipeline both drain)',
        test: (r) => r.backgroundSuccessRate >= 0.99,
        lesson:
          'L19\'s saga (300 events/sec, pubsub × 3 consumer groups) + the new indexing pipeline (50 events/sec → indexing workers → search index) must both drain. Combined async = 350 ops/sec.',
      },
      {
        key: 'hasSearchIndex',
        label: 'Has at least 1 Search Index node (role:searchIndex)',
        predicate: { kind: 'presence', type: 'database', role: 'searchIndex', min: 1 },
        lesson:
          'A search index is architecturally distinct from a relational metadata DB. Real systems use ElasticSearch / OpenSearch / Solr; we model it as a database with role: \'searchIndex\' (amber color). Make at least one so the canvas reads as a proper two-layer architecture.',
      },
      {
        key: 'hasSearchIndexCluster',
        label: 'Sharded Search Index cluster: 3+ nodes tagged role:searchIndex',
        predicate: { kind: 'presence', type: 'database', role: 'searchIndex', min: 3 },
        lesson:
          'A single search index is a SPOF and a throughput bottleneck. Real ES clusters shard across N nodes for parallel query (each shard answers its portion in parallel) AND replicate each shard for availability. 3 shards behind a load balancer mirrors the production minimum.',
      },
      {
        key: 'hasIndexingPipeline',
        label: 'Has an indexing pipeline: 2+ Queues on the canvas',
        predicate: { kind: 'presence', type: 'queue', min: 2 },
        lesson:
          'Indexing is async — items flow Item-Updates → Indexing Queue → Indexing Workers → Search Index. L19\'s Order Queue covers one queue; L19.2 adds an Indexing Queue. With both present, you have the canonical two-pipeline e-commerce backend (orders + indexing).',
      },
    ],
    solution: () => {
      // Inherit L19 canonical entirely, then ADD:
      //   Query path:
      //     search-clients (2000 r/s)
      //       → search-svc (cap 3000)
      //       → search-cache (cap 5000, hit 0.7) — absorbs 1400; 600 miss
      //       → search-idx-lb (cap 5000) — fans to 3 shards
      //       → search-idx-{0,1,2} (cap 10000 each)
      //
      //   Indexing pipeline:
      //     item-updates (50 events/sec, CDC source)
      //       → indexing-queue (pubsub: false work queue)
      //       → indexing-worker-{0,1} (cap 100 each, group 'search-indexer')
      //       → search-idx-lb (write path — same LB acts as coordinating node)
      //
      // Sync math:
      //   L19 unchanged: 11,100 served / 11,100 attempted
      //   Search query: 2000 → cache absorbs 1400; 600 miss → 200/shard → all served
      //   Item updates: 50 → indexing-queue accepts all (queue terminates sync)
      //   Combined: 13,150 served / 13,150 attempted = 100%
      //
      // Async math:
      //   L19 saga (pubsub × 3 groups): 300 served / 300 attempted
      //   Indexing (work-queue × 2 workers, each gets 25): 50 served / 50 attempted
      //   Combined: 350 served / 350 attempted = 100%
      const l19 = puzzles.ecommerceAtScale.solution();
      return {
        nodes: [
          ...l19.nodes,
          // ─── Search query path ───────────────────────────────────────
          node('search-clients', 'client', { x: 40, y: 1020 }, { rps: 2000, readRatio: 1.0 }),
          node('search-svc', 'service', { x: 240, y: 1020 }, { role: 'appServer', capacity: 3000 }),
          node('search-cache', 'cache', { x: 440, y: 1020 }, { role: 'internal', capacity: 5000, hitRate: 0.7 }),
          node('search-idx-lb', 'loadBalancer', { x: 640, y: 1020 }, { capacity: 5000 }),
          node('search-idx-0', 'database', { x: 840, y: 940 }, { role: 'searchIndex', capacity: 10000 }),
          node('search-idx-1', 'database', { x: 840, y: 1040 }, { role: 'searchIndex', capacity: 10000 }),
          node('search-idx-2', 'database', { x: 840, y: 1140 }, { role: 'searchIndex', capacity: 10000 }),
          // ─── Indexing pipeline (CDC + workers) ───────────────────────
          node('item-updates', 'client', { x: 40, y: 1300 }, { rps: 50, readRatio: 0 }),
          node('indexing-queue', 'queue', { x: 240, y: 1300 }, { topic: 'catalog-changes', pubsub: false }),
          node('indexing-worker-0', 'service', { x: 440, y: 1260 }, { role: 'worker', capacity: 100, consumerGroup: 'search-indexer' }),
          node('indexing-worker-1', 'service', { x: 440, y: 1360 }, { role: 'worker', capacity: 100, consumerGroup: 'search-indexer' }),
        ],
        edges: [
          ...l19.edges,
          // Query path
          edge('search-clients', 'search-svc'),
          edge('search-svc', 'search-cache'),
          edge('search-cache', 'search-idx-lb'),
          edge('search-idx-lb', 'search-idx-0'),
          edge('search-idx-lb', 'search-idx-1'),
          edge('search-idx-lb', 'search-idx-2'),
          // Indexing pipeline — workers write to the same search-idx-lb
          // (which acts as the coordinating node for both reads and writes)
          edge('item-updates', 'indexing-queue'),
          edge('indexing-queue', 'indexing-worker-0'),
          edge('indexing-queue', 'indexing-worker-1'),
          edge('indexing-worker-0', 'search-idx-lb'),
          edge('indexing-worker-1', 'search-idx-lb'),
        ],
      };
    },
  },

  // ─── Sandbox lesson: write a Custom Program ─────────────────────────────
  // Pedagogy: real systems-design components have declared behavior; the
  // Custom Program is the escape hatch. The student writes JavaScript that
  // decides how much flow passes through, modeling admission control / rate
  // limiting / sampling. The default identity function ships overloading
  // the VPS; cutting reads to 1000 protects it.
  customProgramSandbox: {
    id: 'customProgramSandbox',
    order: 22,
    difficulty: 'medium',
    title: 'Custom Program — Admission Control',
    blurb:
      'Write JavaScript that protects an overloaded VPS. A Client sends 2000 read req/s to a VPS that handles 1000 — drop a Custom Program in the middle and write a transform() that lets at most 1000 req/s through. Admission control: shed surplus at the gate so the expensive downstream isn\'t the bottleneck.',
    slug: 'Write JavaScript that protects an overloaded VPS.',
    background: [
      'Up until now every component has had a *declared* shape: a VPS handles N req/s, a Load Balancer splits evenly, a Cache short-circuits reads. The Custom Program is the escape hatch — it runs whatever JavaScript you write, every Run, as a flow node.',
      'The setup: a Client sends 2000 read req/s to a VPS that can only handle 1000. Without protection, the VPS drops half and becomes the bottleneck. Your job: write a Custom Program between them that lets at most 1000 req/s through — admission control. Successful requests still flow; surplus traffic is shed at the gate, before the expensive downstream hop.',
      'Edit the Custom Program node\'s JavaScript in the Properties panel. The function signature is in the default code — it takes {readIn, writeIn, latencyIn, p99LatencyIn} and returns {readOut, writeOut, latencyAdd, p99LatencyAdd}. Outputs are clamped to the input (a node can\'t manufacture traffic). Errors in your code degrade to pass-through and surface as a warning.',
    ],
    sources: [
      {
        title: 'Stripe — Scaling your API with rate limiters',
        url: 'https://stripe.com/blog/rate-limiters',
        note: 'Token-bucket and load-shedding patterns; the same shape as what you\'re writing here.',
      },
      {
        title: 'Adrian Cockcroft — Adaptive concurrency limits',
        url: 'https://www.adrianhornsby.tech/post/load-shedding',
        note: 'Why protecting a downstream from overload matters more than serving every request.',
      },
    ],
    kind: 'flow',
    allowedComponents: ['client', 'customProgram', 'vps'],
    initialNodes: () => [
      node('client-1', 'client', { x: 60, y: 220 }, { rps: 2000, readRatio: 1 }),
      node(
        'vps-1',
        'vps',
        { x: 720, y: 220 },
        { capacity: 1000, latency: 25, p99Latency: 75 }
      ),
    ],
    requirements: [
      {
        key: 'hasCustomProgram',
        label: 'Uses a Custom Program',
        predicate: { kind: 'presence', type: 'customProgram', min: 1 },
        lesson:
          'Drag a Custom Program onto the canvas between the Client and the VPS. Wire ' +
          'Client → Custom Program → VPS. Then click the Custom Program and edit its JavaScript.',
      },
      {
        key: 'vpsNotOverloaded',
        label: 'VPS is not the bottleneck',
        // The bottleneck label is the role-aware label of the highest-dropping
        // node. A successful admission-control solution drops at the gate, so
        // the customProgram becomes the bottleneck (or there are zero drops).
        test: (r) => r.bottleneckLabel !== 'VPS',
        lesson:
          'When your Custom Program lets the full 2000 req/s through, the VPS hits its 1000 ' +
          'cap and drops the surplus — the VPS becomes the bottleneck. Cap readOut at 1000 ' +
          'inside your transform() so the surplus is shed BEFORE it reaches the VPS.',
      },
      {
        key: 'served',
        label: 'Served ≥ 990 req/s',
        test: (r) => r.totalReadServed >= 990,
        lesson:
          'Your Custom Program should let through ~1000 req/s — close to the VPS\'s capacity ' +
          'so capacity isn\'t wasted, but not over it. Try `Math.min(input.readIn, 1000)`.',
      },
    ],
    solution: () => ({
      nodes: [
        node('client-1', 'client', { x: 60, y: 220 }, { rps: 2000, readRatio: 1 }),
        node(
          'gate-1',
          'customProgram',
          { x: 360, y: 220 },
          {
            displayLabel: 'Admission Gate',
            code: [
              '// Admission control: shed surplus traffic at the gate so the VPS',
              '// never sees more than it can handle.',
              'function transform(input) {',
              '  const CAP = 1000;',
              '  return {',
              '    readOut: Math.min(input.readIn, CAP),',
              '    writeOut: input.writeIn,',
              '    latencyAdd: 1,',
              '    p99LatencyAdd: 3,',
              '  };',
              '}',
            ].join('\n'),
          }
        ),
        node(
          'vps-1',
          'vps',
          { x: 720, y: 220 },
          { capacity: 1000, latency: 25, p99Latency: 75 }
        ),
      ],
      edges: [
        edge('client-1', 'gate-1'),
        edge('gate-1', 'vps-1'),
      ],
    }),
  },

  // ─── JavaScript Sandbox track (dataflow simulator) ─────────────────────
  // 12 lessons (J1-J12) that teach JS via the customProgram. The graph is
  // always textInput → customProgram → textOutput; the lesson is the JS the
  // player writes inside transform(input). Test cases grade behavior at
  // specific inputs. See journal Part 24 for the design conversation.

  j1Hello: jsLesson({
    id: 'j1Hello',
    order: 'J1',
    difficulty: 'easy',
    title: 'Hello, transform()',
    blurb:
      'Welcome to the JavaScript track. Every lesson is the same shape: a Text Input, a Custom Program (your code), and a Text Output. Click the Custom Program node to edit its code. Your function should return "Hello, " followed by whatever the Text Input emits. Press Run to test your code against the cases below.',
    background: [
      'In real systems, this exact shape is everywhere. An HTTP handler receives a request body (string), runs your code, returns a response body (string). A Kafka consumer reads a message (bytes), runs your code, writes a new message (bytes). The wires carry serialized data — your code is the deserializer + business logic + reserializer.',
      'In this track, wires carry plain strings. Your function takes one string in and returns one string out. That\'s the simplest possible serialization protocol — and it\'s how every Unix pipeline works (stdout → stdin).',
    ],
    initialInputValue: 'world',
    starterCode: [
      '// Edit this so the output is "Hello, " followed by the input.',
      '// For example, input "world" should produce "Hello, world".',
      'function transform(input) {',
      '  return input;',
      '}',
    ].join('\n'),
    solutionCode: [
      'function transform(input) {',
      '  return "Hello, " + input;',
      '}',
    ].join('\n'),
    testCases: [
      { input: 'world', expected: 'Hello, world' },
      { input: 'Claude', expected: 'Hello, Claude' },
      { input: '', expected: 'Hello, ' },
    ],
  }),

  j2Uppercase: jsLesson({
    id: 'j2Uppercase',
    order: 'J2',
    difficulty: 'easy',
    title: 'Uppercase',
    blurb:
      'Strings in JavaScript have built-in methods. Return the input converted to uppercase. Hint: `.toUpperCase()`.',
    background: [
      'JavaScript strings carry methods — small functions attached to every string value. `.toUpperCase()` returns a new uppercase copy; `.toLowerCase()` returns lowercase. Strings in JS are immutable, so methods always return new strings instead of modifying the original. This is the same model as Python and Java; different from C, where strings are mutable arrays.',
    ],
    initialInputValue: 'hello world',
    starterCode: [
      '// Return the input as uppercase. Hint: input.toUpperCase()',
      'function transform(input) {',
      '  return input;',
      '}',
    ].join('\n'),
    solutionCode: [
      'function transform(input) {',
      '  return input.toUpperCase();',
      '}',
    ].join('\n'),
    testCases: [
      { input: 'hello world', expected: 'HELLO WORLD' },
      { input: 'JavaScript', expected: 'JAVASCRIPT' },
      { input: '', expected: '' },
    ],
  }),

  j3Reverse: jsLesson({
    id: 'j3Reverse',
    order: 'J3',
    difficulty: 'easy',
    title: 'Reverse the input',
    blurb:
      'Reverse the characters of the input. JS doesn\'t have a `.reverse()` method on strings — but arrays do. The idiomatic trick: split into an array of characters, reverse the array, join it back.',
    background: [
      'Method chaining is one of JS\'s most-used patterns. Each method returns a new value, and you can call the next method on that result without storing intermediate variables. `input.split("").reverse().join("")` reads almost like English: "split into chars, reverse them, join them back."',
      'In production code, this same chaining shape shows up everywhere: parse → validate → transform → serialize. Each step takes the previous step\'s output as its input. The textInput → customProgram → textOutput graph on your canvas is the same idea, just made visual.',
    ],
    initialInputValue: 'hello',
    starterCode: [
      '// Reverse the input string.',
      '// Hint: input.split("").reverse().join("")',
      'function transform(input) {',
      '  return input;',
      '}',
    ].join('\n'),
    solutionCode: [
      'function transform(input) {',
      '  return input.split("").reverse().join("");',
      '}',
    ].join('\n'),
    testCases: [
      { input: 'hello', expected: 'olleh' },
      { input: 'JavaScript', expected: 'tpircSavaJ' },
      { input: 'a', expected: 'a' },
      { input: '', expected: '' },
    ],
  }),

  j4WordCount: jsLesson({
    id: 'j4WordCount',
    order: 'J4',
    difficulty: 'easy',
    title: 'Count the words',
    blurb:
      'Count the number of words in the input. A word is anything separated by whitespace. Return the count as a string (every wire in this track carries a string).',
    background: [
      'When you `.split(" ")` on a string, you get an array of the pieces between spaces. `.length` on an array gives the count. The challenge is that numbers and strings are different types in JS — to send a number through a string wire, you have to convert it, either with `String(n)` or by concatenating: `"" + n`.',
      'This type conversion is exactly what real systems do at network boundaries. When you respond from an HTTP handler with a number, you\'re actually sending its string representation; the receiver parses it back to a number. Type discipline at boundaries is what makes distributed systems work.',
      'Edge cases: what does `"".split(" ")` return? Try it. The simplest answer ("just split and count") may not be the right one when the input is empty.',
    ],
    initialInputValue: 'the quick brown fox',
    starterCode: [
      '// Return the number of words in the input, as a string.',
      '// Words are separated by spaces. An empty input has 0 words.',
      'function transform(input) {',
      '  return input;',
      '}',
    ].join('\n'),
    solutionCode: [
      'function transform(input) {',
      '  if (input === "") return "0";',
      '  return String(input.split(" ").length);',
      '}',
    ].join('\n'),
    testCases: [
      { input: 'the quick brown fox', expected: '4' },
      { input: 'one', expected: '1' },
      { input: 'a b c d e', expected: '5' },
      { input: '', expected: '0' },
    ],
  }),

  j5ConditionalGreeting: jsLesson({
    id: 'j5ConditionalGreeting',
    order: 'J5',
    difficulty: 'easy',
    title: 'Conditional greeting',
    blurb:
      'If the input is empty, return "(no name)". Otherwise, return "Hi, " + input. Practice writing an if/else.',
    background: [
      'Almost every real-world function starts with input validation: handle the empty/null/malformed case before the happy path. The pattern is so common it has names — "guard clauses", "defensive programming", "fail-fast".',
      'In JS, the falsy values are `false`, `0`, `""`, `null`, `undefined`, and `NaN`. An `if (input)` check treats an empty string as false, which is often what you want for "did the caller give me anything?" Be careful though — `if (input)` also treats `"0"` as truthy (it\'s a non-empty string), so the check is exactly "is this a non-empty string?", not "is this a real value?"',
    ],
    initialInputValue: 'Claude',
    starterCode: [
      '// If input is empty, return "(no name)".',
      '// Otherwise, return "Hi, " + input.',
      'function transform(input) {',
      '  return "Hi, " + input;',
      '}',
    ].join('\n'),
    solutionCode: [
      'function transform(input) {',
      '  if (input === "") {',
      '    return "(no name)";',
      '  }',
      '  return "Hi, " + input;',
      '}',
    ].join('\n'),
    testCases: [
      { input: 'Claude', expected: 'Hi, Claude' },
      { input: 'world', expected: 'Hi, world' },
      { input: '', expected: '(no name)' },
    ],
  }),

  j6Repeat: jsLesson({
    id: 'j6Repeat',
    order: 'J6',
    difficulty: 'medium',
    title: 'Repeat the input',
    blurb:
      'Return the input repeated 3 times, separated by " | ". For "hi" the output should be "hi | hi | hi". Use a loop.',
    background: [
      'JavaScript\'s `for` loop is the same shape as C\'s: `for (let i = 0; i < n; i++) { ... }`. Inside the loop you build up the answer in an accumulator variable — most often a string with `+=` or an array with `.push()`.',
      'There\'s also a shorter way that doesn\'t use a loop at all: `Array(3).fill(input).join(" | ")`. Both work. Use whichever feels clearer — there\'s no single "correct" idiom in JavaScript, and that\'s actually a deliberate part of the language design.',
      'In production code, "join with a separator" is the bread-and-butter pattern for building human-readable summaries: CSV rows, log lines, query strings. The `.join()` method exists specifically because this pattern is so common.',
    ],
    initialInputValue: 'hi',
    starterCode: [
      '// Return the input repeated 3 times, joined by " | ".',
      '// Example: input "hi" → output "hi | hi | hi".',
      'function transform(input) {',
      '  return input;',
      '}',
    ].join('\n'),
    solutionCode: [
      'function transform(input) {',
      '  let out = "";',
      '  for (let i = 0; i < 3; i++) {',
      '    if (i > 0) out += " | ";',
      '    out += input;',
      '  }',
      '  return out;',
      '}',
    ].join('\n'),
    testCases: [
      { input: 'hi', expected: 'hi | hi | hi' },
      { input: 'ok', expected: 'ok | ok | ok' },
      { input: '', expected: ' |  | ' },
    ],
  }),

  j7FirstWord: jsLesson({
    id: 'j7FirstWord',
    order: 'J7',
    difficulty: 'medium',
    title: 'Extract the first word',
    blurb:
      'Return just the first word of the input. Words are separated by spaces. If the input is empty, return "".',
    background: [
      'String indexing in JS uses zero-based positions: `input[0]` is the first character, `input.length - 1` is the index of the last. `.slice(start, end)` returns the substring from `start` (inclusive) up to `end` (exclusive); omit `end` to get the rest of the string.',
      'To find the first space, use `.indexOf(" ")`. It returns the index of the first match, or `-1` if not found. The "not found" case is the trap — when there\'s no space, the whole input IS the first word, so you return it unchanged.',
      'Real-world cousin: parsing HTTP request lines (`"GET /path HTTP/1.1"` → split on space) and command-line argument parsing both use this same shape. The first whitespace-separated token has a special role in the protocol.',
    ],
    initialInputValue: 'the quick brown fox',
    starterCode: [
      '// Return just the first word.',
      '// Hint: input.indexOf(" "), input.slice(0, n).',
      '// If there is no space, the whole input is the first word.',
      'function transform(input) {',
      '  return input;',
      '}',
    ].join('\n'),
    solutionCode: [
      'function transform(input) {',
      '  const spaceAt = input.indexOf(" ");',
      '  if (spaceAt === -1) return input;',
      '  return input.slice(0, spaceAt);',
      '}',
    ].join('\n'),
    testCases: [
      { input: 'the quick brown fox', expected: 'the' },
      { input: 'hello', expected: 'hello' },
      { input: 'one two', expected: 'one' },
      { input: '', expected: '' },
    ],
  }),

  j8ValidateEmail: jsLesson({
    id: 'j8ValidateEmail',
    order: 'J8',
    difficulty: 'medium',
    title: 'Validate an email',
    blurb:
      'Return "valid" if the input looks like an email (has one @ with at least one character on each side, plus a "." after the @), else "invalid". Use a regex.',
    background: [
      'Regular expressions ("regex") are a tiny pattern-matching language built into JS strings. `/pattern/.test(string)` returns true/false; `/pattern/.exec(string)` returns the matched parts. The pattern syntax is dense but the basics cover most uses: `.` (any char), `*` (zero or more), `+` (one or more), `^` (start), `$` (end), `[abc]` (any of a/b/c), `\\d` (digit), `\\w` (word char).',
      'Real email validation is famously hard — the official spec (RFC 5322) allows things you would never put in a real input field (quoted local parts, IP literals, etc.). In production, the right move is usually "send a confirmation email" — if the email arrives, it\'s valid. The 90% regex below is fine for client-side feedback, not for security checks.',
      'Try a regex like `/^.+@.+\\..+$/`. Read it as: start, one-or-more-chars, @, one-or-more-chars, ".", one-or-more-chars, end.',
    ],
    initialInputValue: 'corey@example.com',
    starterCode: [
      '// Return "valid" if input matches the email shape, else "invalid".',
      '// Hint: a regex like /^.+@.+\\..+$/ catches the common cases.',
      'function transform(input) {',
      '  return "invalid";',
      '}',
    ].join('\n'),
    solutionCode: [
      'function transform(input) {',
      '  if (/^.+@.+\\..+$/.test(input)) return "valid";',
      '  return "invalid";',
      '}',
    ].join('\n'),
    testCases: [
      { input: 'corey@example.com', expected: 'valid' },
      { input: 'a@b.c', expected: 'valid' },
      { input: 'no-at-sign', expected: 'invalid' },
      { input: 'a@b', expected: 'invalid' },
      { input: '', expected: 'invalid' },
    ],
  }),

  j9JsonInOut: jsLesson({
    id: 'j9JsonInOut',
    order: 'J9',
    difficulty: 'medium',
    title: 'JSON in, JSON out',
    blurb:
      'The input is a JSON object string like `{"name":"world"}`. Parse it, uppercase the `name` field, and return the result as a JSON string. **This lesson is the serializer story made literal** — real microservices do this exact dance at every HTTP boundary.',
    background: [
      'JSON is the most common data format on the modern internet. HTTP APIs, configs, logs, metrics, even most NoSQL databases store data as JSON. The contract: a JSON value is *always* serialized as a string before it travels (over a wire, into a file, into a queue), and *always* deserialized at the other end.',
      '`JSON.parse(string)` turns a JSON string into a real JS object. `JSON.stringify(object)` turns a JS object back into a JSON string. These two functions are doing the same work as Avro / protobuf / msgpack in other ecosystems — they\'re the serializer + deserializer.',
      'Your transform() here is structurally identical to a real REST API handler: receive a JSON request body (string), parse it, do something with the object, return a JSON response body (string). The wires on your canvas are the same wires in production — they carry strings, and your code is what gives those strings meaning.',
    ],
    sources: [
      {
        title: 'MDN — JSON.parse and JSON.stringify',
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON',
        note: 'The two functions that turn JSON strings into JS objects and back.',
      },
      {
        title: 'json.org — the JSON spec, on one page',
        url: 'https://www.json.org/',
        note: 'The whole format fits on a single diagram.',
      },
    ],
    initialInputValue: '{"name":"world"}',
    starterCode: [
      '// Parse the input as JSON, uppercase its `name` field,',
      '// and return the new object as a JSON string.',
      '// Hint: JSON.parse + obj.name.toUpperCase() + JSON.stringify',
      'function transform(input) {',
      '  return input;',
      '}',
    ].join('\n'),
    solutionCode: [
      'function transform(input) {',
      '  const obj = JSON.parse(input);',
      '  obj.name = obj.name.toUpperCase();',
      '  return JSON.stringify(obj);',
      '}',
    ].join('\n'),
    testCases: [
      { input: '{"name":"world"}', expected: '{"name":"WORLD"}' },
      { input: '{"name":"claude"}', expected: '{"name":"CLAUDE"}' },
      { input: '{"name":"a"}', expected: '{"name":"A"}' },
    ],
  }),

  j10CustomProtocol: jsLesson({
    id: 'j10CustomProtocol',
    order: 'J10',
    difficulty: 'hard',
    title: 'Custom protocol → JSON',
    blurb:
      'The input is a tiny key/value protocol: `key=value` pairs, one per line. Parse it into a JSON object. For input `name=world\\nage=5`, return `{"name":"world","age":"5"}`. All values stay as strings.',
    background: [
      'Real systems are full of custom text protocols. HTTP headers are key:value pairs separated by newlines. INI configs are key=value with section headers. Environment variables are KEY=value in process memory. Every one of them is parsed by code that looks like what you\'re about to write — split lines, split each line on a separator, build a structure.',
      'The pattern: `.split("\\n")` gives lines, `.split("=")` gives the key/value of each. Build an object incrementally with `obj[key] = value`. Then `JSON.stringify` it.',
      'Once you can write a parser, you can write a *serializer* (the reverse — object back to text). That\'s where the customProgram framing pays off: every serialization format in the wild is just user code on both sides of the wire, agreed in advance on the shape.',
    ],
    initialInputValue: 'name=world\nage=5',
    starterCode: [
      '// Parse "key=value" lines into a JSON object.',
      '// Example: "name=world\\nage=5" → {"name":"world","age":"5"}',
      '// All values stay strings — no type coercion.',
      'function transform(input) {',
      '  return "{}";',
      '}',
    ].join('\n'),
    solutionCode: [
      'function transform(input) {',
      '  const obj = {};',
      '  for (const line of input.split("\\n")) {',
      '    if (!line) continue;',
      '    const eq = line.indexOf("=");',
      '    if (eq === -1) continue;',
      '    const key = line.slice(0, eq);',
      '    const value = line.slice(eq + 1);',
      '    obj[key] = value;',
      '  }',
      '  return JSON.stringify(obj);',
      '}',
    ].join('\n'),
    testCases: [
      { input: 'name=world\nage=5', expected: '{"name":"world","age":"5"}' },
      { input: 'host=localhost\nport=3000', expected: '{"host":"localhost","port":"3000"}' },
      { input: 'a=1', expected: '{"a":"1"}' },
      { input: '', expected: '{}' },
    ],
  }),

  j11ComposeTwo: {
    id: 'j11ComposeTwo',
    order: 'J11',
    track: 'javascript',
    difficulty: 'medium',
    title: 'Compose two programs',
    blurb:
      'This lesson starts with TWO Custom Programs wired in series: Input → Program A → Program B → Output. Make Program A uppercase the input and Program B reverse it. The graph is your pipeline.',
    background: [
      'Real distributed systems are built exactly like this — a pipeline of single-purpose stages, each one taking the previous one\'s output and emitting its own. Unix `cat file | grep foo | wc -l`. Kafka producer → topic → consumer → topic → consumer. ETL: extract → transform → load.',
      'The big payoff: each stage stays simple. You don\'t have one giant program that does everything; you have small programs that each do one thing and are easy to test and replace. The "small piece of code wired into a graph" pattern is at the heart of platform engineering. The customProgram + wires + text I/O graph on your canvas is a working microservices pipeline in miniature.',
      'For this lesson: open Program A, write `return input.toUpperCase();`. Open Program B, write `return input.split("").reverse().join("");`. The wires do the rest.',
    ],
    kind: 'dataflow',
    allowedComponents: ['textInput', 'customProgram', 'textOutput'],
    initialNodes: () => [
      node('input-1', 'textInput', { x: 40, y: 220 }, { value: 'hello' }),
      node('prog-a', 'customProgram', { x: 260, y: 220 }, {
        displayLabel: 'A',
        code: [
          '// Program A: uppercase the input.',
          'function transform(input) {',
          '  return input;',
          '}',
        ].join('\n'),
      }),
      node('prog-b', 'customProgram', { x: 520, y: 220 }, {
        displayLabel: 'B',
        code: [
          '// Program B: reverse the input.',
          'function transform(input) {',
          '  return input;',
          '}',
        ].join('\n'),
      }),
      node('output-1', 'textOutput', { x: 780, y: 220 }),
    ],
    initialEdges: () => [
      edge('input-1', 'prog-a'),
      edge('prog-a', 'prog-b'),
      edge('prog-b', 'output-1'),
    ],
    testCases: [
      { input: 'hello', expected: 'OLLEH' },
      { input: 'JavaScript', expected: 'TPIRCSAVAJ' },
      { input: 'a', expected: 'A' },
      { input: '', expected: '' },
    ],
    solution: () => ({
      nodes: [
        node('input-1', 'textInput', { x: 40, y: 220 }, { value: 'hello' }),
        node('prog-a', 'customProgram', { x: 260, y: 220 }, {
          displayLabel: 'A',
          code: [
            'function transform(input) {',
            '  return input.toUpperCase();',
            '}',
          ].join('\n'),
        }),
        node('prog-b', 'customProgram', { x: 520, y: 220 }, {
          displayLabel: 'B',
          code: [
            'function transform(input) {',
            '  return input.split("").reverse().join("");',
            '}',
          ].join('\n'),
        }),
        node('output-1', 'textOutput', { x: 780, y: 220 }),
      ],
      edges: [
        edge('input-1', 'prog-a'),
        edge('prog-a', 'prog-b'),
        edge('prog-b', 'output-1'),
      ],
    }),
  },

  j12FizzBuzz: jsLesson({
    id: 'j12FizzBuzz',
    order: 'J12',
    difficulty: 'medium',
    title: 'FizzBuzz',
    blurb:
      'The classic. Input is a number as a string. If divisible by 3 → "Fizz". If by 5 → "Buzz". If by both → "FizzBuzz". Otherwise return the number unchanged.',
    background: [
      'FizzBuzz is the de-facto first-interview programming question. It tests: can you write a function, can you handle conditionals, do you understand the order of cases (divisible-by-15 must come before divisible-by-3, or be expressed as "both"). It\'s a tiny puzzle that catches the rare programmer who really can\'t code their way out of it.',
      'JS modulo is `%`. `15 % 3` is `0`. `15 % 5` is `0`. `15 % 15` is `0`. The "divisible by 3 AND 5" case is equivalent to "divisible by 15" — and you can check that first to avoid the order-of-cases trap.',
      'You\'ll need `parseInt(input)` or `Number(input)` to turn the string-input into a number. JS, like most languages, does NOT do arithmetic on strings — `"15" % 3` actually returns 0 here because JS coerces, but it\'s bad form. Convert types explicitly.',
    ],
    initialInputValue: '15',
    starterCode: [
      '// Input is a number-as-string. Implement FizzBuzz:',
      '//   divisible by 3      → "Fizz"',
      '//   divisible by 5      → "Buzz"',
      '//   divisible by both   → "FizzBuzz"',
      '//   anything else       → the number unchanged',
      'function transform(input) {',
      '  return input;',
      '}',
    ].join('\n'),
    solutionCode: [
      'function transform(input) {',
      '  const n = Number(input);',
      '  if (n % 15 === 0) return "FizzBuzz";',
      '  if (n % 3 === 0) return "Fizz";',
      '  if (n % 5 === 0) return "Buzz";',
      '  return input;',
      '}',
    ].join('\n'),
    testCases: [
      { input: '1', expected: '1' },
      { input: '3', expected: 'Fizz' },
      { input: '5', expected: 'Buzz' },
      { input: '6', expected: 'Fizz' },
      { input: '10', expected: 'Buzz' },
      { input: '15', expected: 'FizzBuzz' },
      { input: '30', expected: 'FizzBuzz' },
      { input: '7', expected: '7' },
    ],
  }),
};

export const puzzleOrder = [
  'buildComputer',
  'homeNetwork',
  'reachTheInternet',
  'pointDomain',
  'yourFirstRequest',
  'serverOverload',
  'addLoadBalancer',
  'persistWithDatabase',
  'cacheHitRate',
  'latencyAddsUp',
  'addACache',
  'readWriteSplit',
  'whyHaveTwo',
  'urlShortener',
  'clusterDatabase',
  'readReplicas',
  'asyncNotifications',
  'newsfeedCore',
  'addCdn',
  'twitterAtScale',
  'tinyurlAtScale',
  'streamProcessingAtScale',
  'fileStorageAtScale',
  'ecommerceAtScale',
  'flashSaleAtScale',
  'searchAtScale',
  'customProgramSandbox',
  // JS Sandbox track (dataflow). Filtered separately in the Palette via the
  // track toggle so they don't mix with the systems-design lessons by default.
  'j1Hello',
  'j2Uppercase',
  'j3Reverse',
  'j4WordCount',
  'j5ConditionalGreeting',
  'j6Repeat',
  'j7FirstWord',
  'j8ValidateEmail',
  'j9JsonInOut',
  'j10CustomProtocol',
  'j11ComposeTwo',
  'j12FizzBuzz',
];
export const defaultPuzzleId = 'buildComputer';

export function evaluatePuzzle(puzzle, simResult) {
  if (!simResult || !simResult.ok) {
    return { passed: false, results: [], error: simResult ? simResult.error : null };
  }
  // Dataflow puzzles grade themselves via test cases (input → expected
  // output). Each test case becomes one row in the requirements view,
  // showing what was run, what came back, and what was expected.
  if (puzzle.kind === 'dataflow' && Array.isArray(simResult.caseResults)) {
    const results = simResult.caseResults.map((c, i) => ({
      key: `case-${i}`,
      label: `Input ${JSON.stringify(c.input)} → ${JSON.stringify(c.expected)}`,
      lesson: c.passed
        ? null
        : c.programErrors && c.programErrors.length > 0
          ? `Your code threw an error on this input: ${c.programErrors[0].error}`
          : `Got ${JSON.stringify(c.actual)} instead — review the transform() body.`,
      passed: c.passed,
      input: c.input,
      expected: c.expected,
      actual: c.actual,
    }));
    return {
      passed: results.length > 0 && results.every((r) => r.passed),
      results,
    };
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
