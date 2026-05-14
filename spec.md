# Systems Design Game

## What
A browser-based puzzle game that teaches systems design by letting the player drag canonical components (CPU, Router, Load Balancer, Database, …) onto a canvas, wire them together, tune their properties, and press **Run** to check the design against the active lesson's pass criteria. Each lesson is a small, focused scenario ("Build a Computer," "Add a Load Balancer," "Replicate your reads") with a reading panel for the concept and a measurable pass/fail checklist. Think Scratch, but the blocks are infrastructure primitives and the simulator is the unit test.

Today the game ships **6 lessons across 3 simulator kinds** (composition, connectivity, flow) and **19 component types**.

## Why
Most systems-design education is text-based: read a book, watch a video, write whiteboard answers in an interview. The tradeoffs ("add a cache vs. add replicas vs. raise capacity") are only viscerally real when the learner sees a number drop or a node turn red. A drag-and-drop sim collapses the loop between "I think X will help" and "X did/didn't help" from days to seconds, and it makes the failure mode legible — *which* node was the bottleneck, not just "your design is slow." The game is also a low-stakes sandbox for the canonical tradeoffs (consistency vs. availability, cache vs. replicate, scale-up vs. scale-out) without provisioning real infrastructure.

## Out of scope
- **Multiplayer / accounts / persistence.** Single-player, client-side only. Lesson completion is persisted in `localStorage`; the canvas itself is not.
- **Discrete-event simulation.** Steady-state math only — capacity caps, average latencies, cache hit ratio, resource aggregation. No p50/p99, burstiness, queue depth, or replication lag.
- **Mobile.** Desktop browser only.
- **Server-side anything.** Pure SPA, no backend.
- **Authoring tool / GUI.** Puzzles are JS objects in `src/lib/puzzles.js`. JSON-puzzle authoring is a planned framework change (see `framework.md`); a *visual* authoring tool is a v3+ concern.

## The 6 lessons

| # | Lesson | Sim kind | What it teaches | Key components introduced |
|---|---|---|---|---|
| 1 | Build a Computer | composition | A computer is a sum of hardware; programs have resource requirements | CPU, RAM, Disk, Computer (container), Program |
| 2 | On the Home Network | composition | LANs hand out IPs; devices on the same Router can find each other | Router (wired, with CIDR + live device IPs), Phone, Web Server |
| 3 | Point a Domain at a VPS | connectivity | A request walks Visitor → Domain → DNS Record → VPS, and DNS values must match | Visitor, Domain, DNS Record, VPS |
| 4 | Add a Load Balancer | flow | One server has finite capacity; an LB spreads traffic across many | Client, Load Balancer |
| 5 | URL Shortener | flow | Read-heavy workloads benefit from caches; bottlenecks shift as you change topology | App Server, Cache, Database |
| 6 | Replicate Your Reads | flow | Reads can scale via replicas; writes must still hit the primary | Read Replica (sink that rejects writes) + edge `kind` (R / W / R+W) |

## The three simulator kinds

Every puzzle has a `kind` that selects its simulator. All three return a kind-tagged object whose shape includes:
- `ok: boolean` and `kind: string`
- `warnings: string[]` for human-readable hints
- `perNode: Record<id, Object>` for per-node display data
- `nodesByType: Record<type, count>` — framework primitive used by `presence` predicates

### `flow`
Topo-sort the DAG, propagate req/s from each Client, cap incoming flow at each node's capacity, accumulate latency along the worst incoming path. Caches terminate the hit fraction locally; misses continue downstream. Sinks (Database, Read Replica) terminate accepted flow as "served." Passthrough nodes with no downstream are *stranded* — their flow is dropped, plus a yellow warning. Reads/writes are tracked separately via per-edge `kind: 'read' | 'write' | 'both'`; Read Replicas reject writes.

Returns: `successRate, readSuccessRate, writeSuccessRate, avgLatency, totalServed, totalDropped, bottleneckNodeId, …`

### `composition`
Aggregates hardware per Computer (CPU cores + RAM + Disk) by walking `parentNode` relationships. A Program is "hosted" if its parent Computer provides enough of each resource. Routers + Phones + Web Servers participate in LAN membership: a device is on the LAN iff there's an edge between it and a Router (`assignLanIps` does the work; see `src/lib/lanIp.js`). The Web Server is on the LAN iff it's hosted in a Computer that's wired to a Router.

Returns: `allHosted, orphanCount, programCount, computersOnLanCount, phonesOnLanCount, webServersOnLanCount, …` plus per-Router `perNode` entries with `{ cidr, ip, devices: [{ id, type, label, ip }] }`.

### `connectivity`
Each Visitor wants to reach a `targetDomain`. The chain Visitor → Domain → DNS Record → VPS is walked; the DNS record's `value` must match the VPS's IP. Failures surface a per-Visitor `reason` string.

Returns: `allReach, visitorCount, …` plus per-Visitor `perNode` entries.

## The framework primitive: declarative predicates

Originally requirements were JS functions: `test: (r) => r.successRate >= 0.99`. That blocked JSON-authored puzzles. The framework primitive:

```js
{ predicate: { kind: 'metric', name: 'successRate', op: '>=', value: 0.99 } }
```

Plus `evaluatePredicate(predicate, simResult) → boolean` in `src/lib/puzzles.js`. A switch over `predicate.kind`. Three kinds today:

| Kind | Schema | Read from |
|---|---|---|
| `metric` | `{ name, op, value }` where `op` ∈ `>=, <=, >, <, ==` | named numeric field on the sim result |
| `presence` | `{ type, min?, max? }` | `simResult.nodesByType[type]` |
| `simFlag` | `{ name }` | boolean field on the sim result |

Add new kinds *only when a real puzzle needs them*. See `framework.md` for the design rationale and the explicit list of overengineering temptations being avoided.

**Legacy `test: (fn)` requirements still work** — both shapes coexist. The mixed shape is the migration strategy.

**Each requirement may carry a `lesson:` string** that renders under the requirement row when it fails. Doubles as the hint system. Always shown on failure, not gated by a future guardrails toggle.

## Container behavior (R1–R6)

A separate first-class contract for the Computer (and any future container component) lives in `CONTAINER_BEHAVIOR.md`. Tested by 19 unit tests in `src/lib/containerBehavior.test.js` + 2 in `src/components/SystemNode.test.jsx`. Summary:

- **R1**: Frame extends past whichever side a child overlaps, by `overshoot + 16px padding`.
- **R2**: Other sides do not move.
- **R3**: The parent's underlying `position` and `style.width/height` never change while a child is being dragged.
- **R4**: A child detaches when its *center* crosses the baseline edge of any of the four sides.
- **R5**: Vibrate-shake only triggers on "leaving" drags.
- **R6**: The banner (header) is rendered inside the frame so it resizes with it.

The Router is **not** a container — devices wire to it via edges (LAN membership = adjacency). Only the Computer is a container today.

## LAN model

`src/lib/lanIp.js` exposes a pure `assignLanIps(nodes, edges) → Map<nodeId, { ip, cidr, routerId }>`. Each Router is its own subnet defined by its `cidr` (default `192.168.1.0/24`). The Router takes `.1`; devices wired to it get `.2`–`.254` via a stable hash (FNV-1a) on node id with linear-probe collision handling. Cross-router IP collisions are *correct* — two routers can both hand out `.42` to their respective devices because they're independent subnets.

Edges are treated as undirected for membership: `device → router` and `router → device` both count.

The composition simulator stamps LAN info into `perNode` so the UI can render live IPs as the player wires things.

## Functional requirements

1. The palette renders the active puzzle's `allowedComponents` and drag-from-palette creates a node at the drop position.
2. Two nodes can be wired via the floating-edge system: drag from any side of one node to any side of another. Edges anchor at perimeter intersections (not fixed dot positions) so they always meet the visible edge cleanly. The Computer palette item has a `prepopulate` checkbox that auto-adds CPU + RAM + Disk inside the Computer on drop.
3. Selecting a node opens the right-hand property panel; edits apply immediately. The selected component also surfaces pedagogical info (description / usage / connections / real-world analog) in the top-overlay info pane inside the canvas.
4. Deleting a node: select + press the Delete button in PropertyPanel, OR drag the node onto the floating trash bin. The trash bin appears at drag-start anchored to the node's bounding rect (never overlapping), stays stationary, and only relocates if the cursor lingers over it for 2s without moving.
5. Pressing **Run** runs the puzzle's simulator and evaluates each requirement, showing green/red checkmarks + a "Puzzle solved!" banner on all-green.
6. On a failed requirement, the `lesson:` text (if any) renders underneath as a dim italic explanation.
7. Per-puzzle warnings (stranded flow, orphan hardware, etc.) surface yellow rows below the requirement checklist.
8. The simulator returns `ok: false` with an error string when the graph has a cycle.
9. A request is "served" ONLY when it terminates at a sink role or a cache hit. Passthrough nodes with no downstream count their flow as dropped, not served.
10. Pressing **Reset** returns the canvas to the active puzzle's `initialNodes()`.
10a. Pressing **💡 Hint** places the first missing canonical *node* (whose parent, if any, already exists on the canvas) OR if every canonical node is present, wires the first missing canonical *edge* whose endpoints both exist. Computed from `puzzle.solution()`; edge identity is `source→target:kind` so a Read and a Write between the same pair are distinct. A one-line `.puzzle-hint-message` ("💡 Placed: Cache" / "💡 Wired: App Server → Cache") appears below the action buttons; cleared on Reset, Show solution, and puzzle switch. Renders only when the puzzle has a `solution()` function.
10b. Pressing **✨ Show solution** replaces the canvas with the puzzle's full canonical graph (`puzzle.solution()`). Reversible via Reset → `initialNodes()`. Renders only when the puzzle has a `solution()`.
10c. Pressing **↶ Undo** (or `Cmd/Ctrl+Z`) reverts the last edit; `Shift+Cmd/Ctrl+Z` / `Cmd/Ctrl+Y` redoes. History is capped at 50 entries each direction and cleared on puzzle switch.
11. Lesson completion is persisted in `localStorage`; a completed lesson's tile shows a check.
12. Each lesson's reading panel (if it has `background:` paragraphs) auto-expands inline below the title on first visit; collapses on subsequent visits. The `Read full lesson ▸` toggle expands/collapses at any time. The canvas stays visible while reading (no modal).
13. Connection validity is enforced at draw time: `source.hasOutput && target.hasInput` must both hold; the connection is otherwise rejected. Direction is independently controlled per edge via two endpoint dot/arrow toggles.
14. Each edge has two orthogonal axes:
    - **R/W kind** (`data.kind: 'read' | 'write' | 'both'`) — cycled by clicking the edge body. Colored label at midpoint. Used by Lesson 6 simulator routing.
    - **Direction arrows** (`data.arrows: { source, target }`) — toggled by clicking each endpoint dot. Drives the animation direction (forward / reverse / bidirectional / static).

## Non-functional requirements
- **Stack:** React 19 + Vite + React Flow v11. No backend.
- **Dev server:** Vite binds to `0.0.0.0:5173` so LAN devices (phone, second laptop) can hit the dev server for cross-device testing.
- **Bundle size:** Informational only; not currently gating.
- **Browser support:** Latest Chrome, Firefox, Safari on desktop.
- **Performance:** All three simulators run synchronously in well under 50ms for graphs of any size a puzzle realistically requires.
- **Tests:** Vitest + @testing-library/react + jsdom. **363 tests passing as of 2026-05-13.**
- **Accessibility:** Drag-and-drop is mouse-only. Known gap; not gating for current scope.

## Stack constraints
- **React 19** (functional components + hooks only).
- **Vite** as dev server and build tool.
- **React Flow** for the canvas (drag/connect/zoom/minimap, parentNode-based containers).
- **No CSS framework.** Plain CSS in `src/App.css` + `src/index.css`.
- **No state management library.** `useState` at the App level; React Flow handles its own internals.
- **No TypeScript.** JSX only.
- **Vitest with jsdom** for unit + component tests.

## Counts (as of 2026-05-11)

| Thing | Count |
|---|---|
| Lessons shipped | 6 |
| Simulator kinds | 3 (composition, connectivity, flow) |
| Component types | 19 |
| Component roles | 4 (source, passthrough, cache, sink) |
| Container component types | 1 (Computer) |
| Wired component types | 18 (everything except Computer) |
| Framework predicate kinds | 3 (`metric`, `presence`, `simFlag`) |
| Edge axes | 2 (R/W kind via body click + Direction arrows via endpoint dot click) |
| Requirements using declarative `predicate:` shape | 2 (Lesson 2 `hasRouter`, Lesson 4 `hasLB`) |
| Requirements using legacy `test:` shape | many (rest of the puzzles) |
| Tests passing | 363 |
| Test files | 11 (`puzzles.test.js`, `lanIp.test.js`, `edgeGeometry.test.js`, `graph.test.js`, `simulator.test.js`, `containerBehavior.test.js`, `SystemNode.test.jsx`, `FloatingEdge.test.js`, `ComponentInfo.test.jsx`, `containerVisualBounds.test.js`, `PuzzleBar.test.jsx`) |
| Container behavior rules (R1–R6) | 6 |
| Default LAN CIDR | `192.168.1.0/24` |
| Router occupies host byte | `.1` |
| Device host byte range | `.2`–`.254` |
| Dev server bind | `0.0.0.0:5173` |
| Drag-to-trash relocate threshold | 2s overlap + stationary cursor |
| Trash relocate slots | 4 (rotates around node corners) |
| Web Server default port range | 49152–65535 (RFC 6335 dynamic) |
| Router default admin port | 80 |

## Spec invariants (testable assertions)

Pinned by test files in `src/lib/` and `src/components/`. The first set is *behavior* (what the system does); the second is *visual contract* (what the player sees) — added after Part 5's wife-test pushback surfaced bug classes that behavioral tests alone don't catch.

### Behavior
- Every puzzle in `puzzleOrder` exists in `puzzles` and has all required fields (`kind`, `title`, `blurb`, `order`, `allowedComponents`, `initialNodes`, `requirements`).
- Every puzzle's `allowedComponents` references real types in `componentTypes`.
- Every component type has `info.description`, `info.usage`, `info.connects` populated (no blank pedagogical pane).
- `simulate(flowPuzzle, [client5000, lb], [client→lb]).totalServed === 0` — flow that dead-ends at a Load Balancer is dropped, not served. *(Part 1's bug.)*
- `simulate(graphWithCycle).ok === false` — cycles are rejected.
- For flow sim: `totalAttempted === totalServed + totalDropped` (conservation).
- `evaluatePredicate({ kind: 'presence', type: 'loadBalancer', min: 1 }, { nodesByType: { loadBalancer: 1 } }) === true`.
- `assignLanIps` is deterministic: same input → same output.
- Within a single router's pool, all assigned device IPs are unique.
- Router's IP is `.1` of its CIDR; devices fall in `.2`–`.254`.
- Two routers with the same CIDR maintain independent pools.
- `getFloatingEdgeEndpoints` returns perimeter intersections on each side; `exitSide` correctly identifies top/right/bottom/left.
- `prepopulateComputerHardware` results: every added child's bounding rect is strictly inside the (possibly enlarged) Computer's bounds.
- `defaultsFor('webServer').port` returns a fresh integer in `[49152, 65535]` per call; `defaultsFor('router').port === 80`.
- `endpointClassName(true) === 'with-arrow'`; `endpointClassName(false) === 'as-dot'`; the two are mutually exclusive.

### Visual contract (CSS / DOM structure)
- `.computer-frame` and `.system-node` both use `box-sizing: border-box` — so their borders don't push the visible perimeter outside React-Flow node bounds (which would make floating-edge endpoints visually land inside the node body).
- `.floating-handle:hover` does NOT contain a `transform:` declaration — overriding the per-side transforms React Flow uses to position handles would yank them inward into the node body.
- A Computer with `hasInput && hasOutput` renders exactly 8 floating handles (4 source + 4 target); one per side (top / right / bottom / left); handles are siblings of `.computer-frame`, not children, so the frame can't occlude them.
- `ComponentInfo` renders a placeholder when no node is selected; renders description / usage / connects when one is.
- `PuzzleBar` shows the reading toggle when the puzzle has background paragraphs; hides it otherwise; the toggle text reflects expanded state.
- `PuzzleBar` renders the `💡 Hint` button iff `puzzle.solution` is a function AND `onHint` is provided; renders `.puzzle-hint-message` iff `hintMessage` is non-null. (Covered by `PuzzleBar.test.jsx`.)

## Component types (current registry)

Grouped by the lesson that introduces them:

- **Lesson 1 (composition):** `cpu`, `ram`, `disk`, `computer` (container), `program`
- **Lesson 2 (composition):** `router` (wired, CIDR-aware), `phone`, `webServer`
- **Lesson 3 (connectivity):** `visitor`, `domain`, `dnsRecord`, `vps`
- **Lessons 4–6 (flow):** `client`, `loadBalancer`, `appServer`, `cache`, `database`, `readReplica`

Each has: `label`, `color`, `role`, `hasInput`, `hasOutput`, `defaults`, `props`, plus optional `container`, `nodeStyle`, `acceptsReads`, `acceptsWrites`. The schema is JS today; planned migration to JSON is in `framework.md`.

## Open questions

DECIDE BEFORE BUILDING MORE LESSONS:
- **Edge-time enforcement of `presence` / future `edge` predicates.** Today predicates evaluate at Run only. A "guardrails: on" mode that blocks invalid edges at draw time would prevent the player from ever getting into a "this can't possibly work" graph state. See `framework.md`. Likely worth doing once we have a second puzzle that needs an `edge` predicate.
- **Custom-puzzle URLs / JSON loader.** Out-of-scope today; covered by `framework.md` step 6+.

DECIDE DURING BUILDING:
- **A WAN model.** Bridging the Lesson 2 LAN with the Lesson 3 connectivity simulator (i.e. "your home Router has a public IP and devices behind NAT can reach the wider internet") is a big pedagogical payoff but a non-trivial sim extension. Defer until a lesson actually needs it.
- **Visual feedback when a node violates a predicate.** Today the player only finds out on Run. A live "this requirement is currently failing" indicator on the canvas (separate from the checklist) would shorten the feedback loop. Worth doing if user testing shows confusion.
- **Discrete-event simulator.** Needed for p50/p99 and queue depth puzzles. Defer.

## Status

The codebase is past v0 in every dimension that matters (lessons, sim kinds, test coverage, framework primitives, UX) but pre-1.0 in the sense that nothing has been shipped publicly. Local development via `npm run dev` (bound to `0.0.0.0` for LAN testing); tests via `npx vitest run`. See `journal.md` for the build history (Parts 1–7) and `framework.md` for the planned JSON-authored puzzle migration.

## Direction — FAANG-grade puzzles (planned)

Committed direction as of 2026-05-12. The platform is being extended to support FAANG system-design-interview-grade puzzles. Two existing tools cover this space — [paperdraw.dev](https://paperdraw.dev/) and [SyDe.cc](https://syde.cc/).

**Audience:** the operator (self-learning) and the students they mentor. This is not a race against paperdraw.dev for market share. **Strategy:** match the components and simulator features needed for our use cases, with the pedagogical curriculum (Lessons 1–6) as the load-bearing thing. FAANG-grade Lessons 7+ are the culmination of the curriculum, not a separate product. Share publicly when the operator considers it complete.

Full background, scoring, and decision rationale: `research.md` "FAANG system design interview compatibility — research." Decision state: `journal.md` Session 1 Part 7.

### Planned new component types
- **Message Queue** — async fan-out, queue depth, drain rate.
- **Worker / Consumer** — drains a queue, processes asynchronously.
- **CDN** — geographic edge cache; latency varies by region.
- **Search Index** — eventually-consistent read path separate from primary DB.
- **Object Storage** — bandwidth-bound (not RPS-bound); for media/blobs.
- **Sharded Database** — partition key, hot-shard awareness.
- **API Gateway** — sits in front of LB conceptually.

### Planned simulator extensions
- **Multiple workload types per puzzle** — reads / writes / search / media as independent flows on the same canvas.
- **Async paths** — write returns 202 before queue drains; main path latency excludes background work.
- **p50 / p99 latency** — not just mean. Tail latencies are what FAANG cares about.
- **Failure injection** — disable a component, re-simulate, watch downstream.
- **Replication lag** — for read-your-writes consistency modeling.
- **Fan-out semantics** — one write triggers N downstream actions (newsfeed-on-write).
- **Geographic distribution** — multi-region replication with cross-region latency.

### Planned modes
Two UI modes; both reuse the same components + simulator extensions.

- **Multi-phase puzzles** (extension of current model). A single puzzle has 3-4 phases that unlock sequentially: steady state → traffic spike → component failure → cost optimization. Reuses the existing predicate framework. Each phase has its own requirements; player iterates on the same canvas.
- **Sandbox mode** (new). Blank canvas, no auto-grading, workload knobs (RPS slider, read ratio slider, spike button), per-node failure injection. The metrics tell you if it works; no system says "you passed." This is what an actual FAANG interviewer would use during a live call. Defaults will mirror paperdraw.dev's conventions where they make sense; we'll refine our own visual language as we learn what feels right.

### Planned lessons
- **Lesson 7 — Scale the URL Shortener** (multi-phase). Reuses Lesson 5's setup. Adds Queue + Worker + CDN + Analytics DB. Phases: steady state → 10x spike → 100x spike → primary DB failure. Lower complexity than a full Twitter puzzle; exercises all the new infrastructure on a familiar conceptual base.
- **Lesson 8 — Design Twitter Newsfeed** (multi-phase). The canonical FAANG SDI question. Reuses everything from Lesson 7 plus fan-out semantics.

### Sequencing
~5-7 focused sessions of work, in this order:
1. Build the new components + simulator extensions (no puzzles yet).
2. Lesson 7 (multi-phase) — first FAANG-grade puzzle, lowest risk.
3. Sandbox mode — reuses components from step 1, adds the new mode wrapper.
4. Lesson 8 (multi-phase) — Twitter Newsfeed.

After step 2 we have something publishable (a real Scale-the-URL-Shortener multi-phase puzzle). Whether to actively share at that point is an open decision.
