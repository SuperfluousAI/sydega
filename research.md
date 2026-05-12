# Component Research — what to add next

A taxonomy of the canonical systems-design components that exist, what each teaches, what the simulator would need to model it, and a ranked recommendation for what we should ship next. The goal: pick components by **concept density** (does it unlock a meaningfully new lesson?) not by completeness.

## Where we are today

Shipped (19 component types across 6 lessons; 3 simulator kinds):

| Lesson | Concepts taught | Components introduced |
|---|---|---|
| 1 — Build a Computer | A computer is a sum of hardware; programs have resource requirements | CPU, RAM, Disk, Computer (container), Program |
| 2 — On the Home Network | LANs hand out IPs from a CIDR; devices on the same Router can find each other | Router (wired, CIDR-aware), Phone, Web Server |
| 3 — Point a Domain at a VPS | Domain → DNS record → IP chain | Visitor, Domain, DNS Record, VPS |
| 4 — Add a Load Balancer | Horizontal scale-out, even-split distribution. Requires using an LB (presence predicate). | Client, Load Balancer |
| 5 — URL Shortener | Read-heavy caching, bottlenecks shift | App Server, Cache, Database |
| 6 — Replicate Your Reads | Reads can scale via replicas; writes still must go to the primary | Read Replica + edge kind (R / W / R+W) |

Simulator kinds: `composition` (Lessons 1+2), `connectivity` (Lesson 3), `flow` (Lessons 4–6).

Framework primitives (as of Part 3): declarative `predicate:` shape, `evaluatePredicate` dispatcher, `nodesByType` on every sim result, `lesson:` text on failed requirements. See `framework.md` for the design and `spec.md` for current counts.

## The canonical landscape — every concept I know, organized

### Storage / data
- **Read replica** — a follower DB that serves reads. Teaches replication, read-write split, replication lag.
- **Sharded database** — partitioned by key. Teaches data partitioning, hot shards.
- **Object storage** — blob storage for big files (S3). Teaches "don't store images in your DB."
- **Search index** — specialized read-optimized data store (Elasticsearch). Teaches secondary indexes that are eventually consistent.
- **Time-series DB** — Teaches different data shapes need different stores.
- **Backup / snapshot** — Teaches recoverability.
- **Data warehouse** — analytical store. Teaches OLTP vs OLAP separation.

### Caching beyond the existing one
- **CDN** — edge cache for static assets. Teaches geographic distribution + content origin offload.
- **Distributed cache (cluster)** — Redis cluster. Teaches consistent hashing.
- **Browser/client cache** — Teaches client-side caching, TTLs, ETags.

### Async / messaging
- **Message queue** (SQS / RabbitMQ) + **Worker** — Teaches decoupling producer from consumer, durability, retry semantics.
- **Event stream** (Kafka) — Teaches ordered append-only log, multiple independent consumers.
- **Pub/Sub topic** — Teaches fan-out events.
- **Dead-letter queue** — Teaches failure isolation.
- **Scheduler / cron** — Teaches time-driven work.

### Networking and ingress
- **API Gateway** — Teaches a single front door (routing, authn, rate limit at edge).
- **Reverse proxy / WAF** — Teaches L7 security boundary.
- **TLS / cert** — Teaches transport security (and how cert authority chains work).
- **Firewall / security group** — Teaches network-level access control.
- **VPN / private network** — Teaches private-vs-public networking.
- **Subdomain / wildcard** — Teaches DNS at scale.

### Compute and packaging
- **Container** (Docker image) — Teaches "code + dependencies packaged as one unit."
- **Container registry** — Teaches image storage and pull-on-deploy.
- **Pod / orchestrator** (Kubernetes-y) — Teaches scheduling + bin-packing.
- **Serverless function** (Lambda) — Teaches event-triggered ephemeral compute.
- **Auto-scaler** — Teaches dynamic capacity, scale-to-zero.

### Reliability and topology
- **Region** — Teaches blast radius, geo-routing.
- **Availability Zone** — Teaches fault domains within a region.
- **Health check / liveness probe** — Teaches "is this thing alive."
- **Failover / standby** — Teaches active-passive recovery.
- **Geo-routing DNS** — Teaches latency-based routing.

### Identity / auth
- **Auth service** (OAuth provider) — Teaches identity at the edge.
- **Session store** — Teaches state for stateless services.
- **JWT issuer / token** — Teaches stateless auth.
- **API key manager** — Teaches per-client credentialing.

### Observability
- **Logger / log aggregator** — Teaches centralized logs.
- **Metrics dashboard** — Teaches time-series telemetry.
- **Tracer / distributed tracing** — Teaches request correlation across services.
- **Alert manager** — Teaches actionable signal.

### Application-layer / utility
- **Rate limiter** — Teaches token bucket / sliding window protection.
- **Third-party API** — Teaches external dependencies, retries, idempotency.
- **Webhook receiver** — Teaches callback patterns.
- **WebSocket / long-poll** — Teaches server-push and real-time.
- **Email / SMS gateway** — Teaches the "side channel" output.
- **Payment processor** — Teaches idempotency keys, double-entry.

## What each component would require from the simulator

Mapping to existing simulator kinds (or new ones if needed):

| Component | Existing kind | New behavior needed |
|---|---|---|
| **Read replica** | flow | **Read/write split routing on edges or Client** (already flagged as Open Question) |
| **Sharded DB** | flow | Routing by key — pick one shard per request (could model as just multiple DBs behind a "shard router") |
| **Object storage** | flow | Just another sink. Nothing new. |
| **CDN** | flow | Same shape as Cache — hit_rate + downstream miss path. Trivial. |
| **Search index** | flow | Another sink for read traffic; eventual consistency lag is hard to model in steady-state. |
| **Message queue + Worker** | new: `async` | Queue absorbs writes; worker drains at its own rate; tail latency unbounded. Steady-state can still work: producer rate ≤ worker rate or queue grows. |
| **Pub/Sub topic** | flow + fan-out | One incoming, N outgoing (fan-out N, not split). Change branch policy. |
| **API Gateway** | flow | Like a Load Balancer with an auth or rate-limit "gate" before forwarding. |
| **Auth service** | flow | A passthrough that's required on the request path before the protected resource. Could just be modeled as another node in chain. |
| **Rate limiter** | flow | A node that drops a percentage of incoming traffic above a configured RPS. |
| **TLS / cert** | connectivity | Add a "cert" requirement to the chain (Visitor → Domain → DNS → VPS-with-cert). Pedagogically rich, semantically simple. |
| **Container** | composition | A Computer can hold N Containers; each Container holds a Program. Visual nesting deepens by one level. |
| **Pod / orchestrator** | composition | Auto-bin-packs containers across computers. Probably too much for now. |
| **Region / AZ** | new: `geographic` | Latency between nodes varies by region. Major simulator change. |
| **Health check / monitor** | n/a | Pure observation — doesn't affect flow. Could be a tap node. |
| **Logger / metrics / tracer** | n/a | Same — observational only. |
| **Auto-scaler** | flow | Dynamically changes a node's capacity based on incoming load. Requires time. |
| **CDN edge node + Origin** | flow + connectivity | A CDN is multi-PoP; you'd want region-aware geo-routing. |
| **WebSocket** | new: `bidirectional` | Long-lived connection, not req/resp. Hard to model in steady-state flow.|

**Three takeaways:**
1. **Most useful next components don't need a new simulator kind.** CDN, Read Replica, API Gateway, Rate Limiter, Object Storage, Search Index, Auth Service, Sharded DB — all can be modeled in `flow` with at most one new property (split policy, gate behavior).
2. **One unlock would multiply the catalogue: read/write split routing.** It's already flagged as an open question. Adding it unblocks Read Replica, "writes-bypass-cache" correctness, sharded primary writes, etc.
3. **A new `async` simulator kind unlocks an entire concept family** (queues, workers, event streams, fan-out). It's the biggest single-feature investment but the highest pedagogical payoff after the existing 4 lessons.

## Priority recommendation — what to add next

### Tier 1: ship next (high concept-density, low simulator-change cost)
- **Read Replica** — requires read/write split routing first. Together, ~1 lesson on replication + 1 unlocks correct cache behavior.
- **CDN + Object Storage** — pair. Teaches "static assets don't go through your app servers." Cheap to model; CDN is structurally identical to Cache.
- **Message Queue + Worker** — needs a new `async` simulator kind, but the concept (decouple slow work) is fundamental and shows up in 80% of real systems.
- **API Gateway** — a "front door" with rate-limit + auth gate. Replaces or wraps the LB in puzzles where auth or quotas matter.

### Tier 2: ship after Tier 1
- **Rate Limiter** — standalone, or as a property of API Gateway.
- **Auth Service + Session Store** — pair. Teaches: every authenticated request goes through auth first.
- **TLS / Cert** — extension to Lesson 2 (connectivity). Cheap, teaches "why HTTPS."
- **Container** — extension to Lesson 1. Teaches packaging and isolation.
- **Sharded Database** — requires partition-key routing.

### Tier 3: ship when puzzles demand them
- **Region / AZ** — needs a new simulator kind. Cool but heavy for a single concept.
- **Observability** (Logger, Metrics, Tracer) — observational; doesn't change other nodes' behavior. Could be cosmetic at first.
- **Health Check / Monitor** — pairs with auto-scaler or failover.
- **WebSocket / Long-poll** — needs bidirectional model.

### Skip indefinitely
- **Specialized stores** (time-series, graph, data warehouse) — too niche; covered by "another sink."
- **Email / SMS gateway** — same shape as third-party API.
- **VPN / firewall / security group** — security puzzles deserve their own track, not bolt-ons.
- **Pod / orchestrator / Kubernetes** — represents "the platform"; would warp the abstraction level.

## Proposed Lesson 5–10 arc

Each new lesson introduces 1–2 new components and teaches 1–2 new concepts. Lessons reuse earlier components.

5. **"Writes go to the primary, reads go to replicas"** — adds **Read Replica** + **read/write split** routing. Required before any cache-with-writes puzzle makes sense.
6. **"Don't serve images through your app servers"** — adds **CDN** + **Object Storage**. Teaches static-vs-dynamic split.
7. **"Don't make users wait for slow work"** — adds **Message Queue** + **Worker**. Introduces the `async` simulator kind. Teaches eventual completion, queue back-pressure, worker scale-out.
8. **"Stop the abuser"** — adds **API Gateway** + **Rate Limiter**. Teaches token-bucket protection, edge filtering.
9. **"Log in before you can use it"** — adds **Auth Service** + **Session Store**. Teaches edge auth, session lookup as a hot read.
10. **"Build Twitter (lite)"** — capstone. Combines fan-out timeline cache, async post processing (queue + worker), read replicas, CDN for avatars. No new components.

## A meta-observation worth flagging

Lesson 1 (Computer with Program) and Lesson 4 (App Server) **never meet** in our current world. They're parallel abstractions: a "Computer with a Program in it" and an "App Server" represent the same physical thing, but the player builds them in different lessons and the simulator treats them as unrelated.

A future lesson — or a refactor — could collapse this by saying *an App Server is a Computer with a `web-app` Program inside*. The visual then becomes: drag a Computer, drop a CPU/RAM/Disk + a web-app Program, give it a public IP → it can now serve HTTP. That's a beautiful arc from "what is a server" to "how do many servers cooperate." Worth a real discussion when we hit Lesson 6 or 7.

---

# Graph-format interop — what we could import/export

Surveying the open-source graph-format landscape so we can pick one for import/export with the option of adopting it internally. Captured as research; not yet a decision.

The operator's framing: *"we have such a comprehensive solution for describing the puzzles. is there a system or highly used open source graphing tool that we can potentially incorporate with? for instance, a user could have a graph or end graph in some specialized format. we could 'import it' by understanding the file type, parsing it, and then having a puzzle that is not only representative of what was imported, but works with our format and is hydrated by the parsing/translating component with default or sensible values that make our system work. likewise, we could export our json into the other format. for now i feel that one format to and from works. ... I would like that though because it would just allow us to use that format internally for everything but understand that it's not required."*

## What our format actually has

Two things often conflated as "the puzzle":

**A) Graph state** (the canvas):
- Nodes with: id, position (x/y), explicit width/height, typed `data` (component kind + per-type config), parent-child hierarchy (containers like Computer holding CPU/RAM/Disk)
- Edges with: source, target, `data.kind` (R/W/both), `data.arrows: { source, target }` (direction)

**B) Puzzle wrapper** (the lesson):
- Title, blurb, background paragraphs, allowedComponents, requirements (predicates), simulator kind, solution function, info pane copy per component type

**No external graph format captures (B).** Requirements/predicates/info are domain-specific to this game. The question is really about (A) — interop on graph state — with (B) staying in our JSON.

## Candidate formats

### Cytoscape JSON
- **What it is:** the JSON schema used by Cytoscape Desktop (biology network viz, 20+ years) and Cytoscape.js (~10k★, used in genomics, infosec, finance).
- **Shape:** `{ elements: { nodes: [{ data, position }], edges: [{ data }] } }`
- **Hierarchy:** native via `data.parent` (compound nodes) — **1:1 mapping** to our `parentNode`.
- **Typed data:** `data` is an arbitrary object, including nested objects (so our `arrows: { source, target }` survives).
- **Layout:** `position: { x, y }` per node.
- **Parser cost:** trivial — `JSON.parse`.
- **Round-trip fidelity:** ~95%. Loses only the `style.width/height` (Cytoscape uses style references) — we'd shim that in `data.width`/`data.height`.

### GraphML (XML)
- **What it is:** the lingua franca of academic graph viz. yEd, Gephi, NetworkX, Cytoscape all read/write it.
- **Hierarchy:** native via nested `<graph>` inside `<node>`.
- **Typed data:** declared schema upfront (`<key>` elements) then per-element `<data>`. More verbose than Cytoscape JSON but expressive.
- **Layout:** standard attributes exist, yEd extends with `y:Geometry`.
- **Parser cost:** medium — `DOMParser` + walk the tree.
- **Adoption:** strong in academia/data-science; weaker in webdev.

### DOT (Graphviz)
- **What it is:** the most universal graph DSL. Graphviz reads it; Mermaid descends from it; lots of docs systems embed it.
- **Hierarchy:** clusters (`subgraph cluster_pc { ... }`).
- **Typed data:** attributes on nodes/edges/clusters, but flat key-value (`[type=database, capacity=1000]`).
- **Layout:** optional `pos="x,y"` per node; otherwise auto-laid out.
- **Parser cost:** medium-hard. Existing libraries exist (`graphlib-dot`, `dotparser`) but adding a dep.
- **Strength:** great for *export* (you can pipe DOT to `graphviz` for static PNG/SVG; many docs systems render it inline).

### Mermaid
- **What it is:** the markdown-flavored DSL everyone uses for diagrams in GitHub READMEs, Notion, blog posts.
- **Hierarchy:** `subgraph`.
- **Typed data:** weak — limited to node labels and style classes.
- **Layout:** auto only; no positions.
- **Parser cost:** medium. Mermaid's own parser is heavy (full library); a focused subset is doable.
- **Strength:** users WILL paste Mermaid at us; supporting import-only is a high-leverage human-writable on-ramp.

### React Flow's own `toObject()`
- Worth naming: React Flow can already serialize `{ nodes, edges, viewport }` — that IS our current canvas format. Trivial.
- Not an external interop format; just our own state. Mentioning so we don't reinvent.

## Scoring against our needs

| Need | Cytoscape JSON | GraphML | DOT | Mermaid |
|---|---|---|---|---|
| Compound nodes (Computer/CPU hierarchy) | ✅ native | ✅ native | ⚠️ clusters | ⚠️ subgraph |
| Nested object data (`arrows: {…}`) | ✅ | ⚠️ flatten | ❌ flatten | ❌ |
| Explicit positions | ✅ | ✅ | ⚠️ optional | ❌ auto only |
| JSON-native (no DSL parser) | ✅ | ❌ XML | ❌ DSL | ❌ DSL |
| Human-writable | ⚠️ verbose | ❌ XML | ✅ | ✅✅ |
| Ecosystem reach | medium | high (academia) | very high | very high (docs) |
| 1-day implementation | ✅ | ⚠️ 2-3 days | ⚠️ 2 days | ⚠️ 2-3 days |

## Recommendation

**Pick Cytoscape JSON as the round-trip format.** Three reasons:

1. **Closest structural match.** Our `nodes/edges` with `data` and `parentNode` translate to Cytoscape's model with a thin shim. Almost no information loss either direction.
2. **JSON-native.** No DOMParser, no DSL grammar, no external library required. The whole import/export sits in maybe 200 lines.
3. **Real ecosystem.** Cytoscape.js is mature. Users could take their puzzle's graph state, visualize it in a different tool, mutate it, bring it back. That's a real "the data outlives the app" property.

**On adopting it internally** (the operator's floated question): plausible but not free. Cytoscape's compound-node convention (`data.parent`) is what we'd map our `parentNode` to. React Flow expects its own shape. So either:
- Keep React Flow's shape internally, translate at I/O. ~150 LOC. **Recommended.**
- Adopt Cytoscape's shape internally, translate at React Flow's boundary. ~300 LOC; touches every node/edge data access.

The first path is the right one. The "internal format" question is mostly aesthetic; the cost of switching outweighs the benefit unless we're also planning to render with Cytoscape.js.

**Bonus consideration — human-writable import via Mermaid.** Worth doing as a *second* path later. Pasting a Mermaid flowchart from a Stack Overflow answer and having it become a puzzle is a real "wow" moment that Cytoscape JSON doesn't offer. The data is lossy (no positions, no typed configs), but we can fill those in via the hydration layer described below.

## The hydration layer

Critical detail: a generic import won't say "this is a Load Balancer with capacity 50000." It'll say `type: "loadBalancer"` (or just `"LoadBalancer"`, or `[shape=box, label="LB"]`). The translator needs to:

1. **Map foreign type → our `componentTypes` key.** Handle aliases ("LB" → `loadBalancer`, "DB" → `database`).
2. **Fill in defaults via `defaultsFor(typeKey)`.** Any explicit config from the import overrides; everything else gets sensible defaults.
3. **Decide on unknown types.** Three options, in order of conservativeness:
   - Reject the whole import with a list of unknown types.
   - Skip unknown nodes with a warning.
   - Stub as opaque "Unknown" nodes that render but can't be simulated.
4. **Handle missing positions.** Run a simple auto-layout (left-to-right by topological depth, vertical spread for siblings). Don't need anything fancy.

This hydration layer is where our system's expressiveness shows up. It's the bridge between "generic graph" and "puzzle that makes sense in our world."

## What no format gives us

To be explicit so we don't over-promise the import story:

- **Puzzle requirements.** A Cytoscape file has no concept of "success rate ≥ 99%." The user imports a graph; we still need our puzzle wrapper around it (which they can edit, or which we generate stubs for).
- **Info pane copy.** Per-component pedagogical text is ours.
- **Sim semantics.** "Cache hit rate" is meaningful to our flow sim but not to a graph format.

So the import flow looks like: *"Drop this Cytoscape file → we extract topology + node configs → wrap it in a stub puzzle with no requirements (or empty ones the user fills in) → it renders and runs in our simulator."*

## Sketch of next steps if we proceed

Not committing to implementation yet. To scope:

1. **`src/lib/cytoscapeIO.js`** — pure module: `toCytoscape({ nodes, edges }) → object`, `fromCytoscape(object) → { nodes, edges, warnings }`. Tested with fixtures.
2. **Type-alias table** — `{ "LB": "loadBalancer", "DB": "database", "Cache": "cache", ... }` for tolerant import.
3. **Auto-layout fallback** — `layout({ nodes, edges }) → nodes with positions`. Topo-sort + place. ~50 LOC.
4. **UI affordances** — "Import…" and "Export…" buttons in PuzzleBar that read/write files. File picker via `<input type="file">`; download via `Blob` + anchor.
5. **Tests** — round-trip integrity (export → import → equal), all 6 puzzles serializable, hydration of unknown types, alias resolution.

Rough estimate: 1-2 days of focused work for Cytoscape JSON round-trip with hydration. Mermaid import-only would be another day on top.

## My one strong opinion

If we only do this once: **do Cytoscape JSON round-trip first.** Mermaid import is shinier but it's a one-way ramp; you can't take a puzzle out to Mermaid usefully because Mermaid can't represent the configs. Cytoscape JSON gives a real durable interop story. Mermaid is a phase-two import-only nicety that costs more than its long-term value.

## Decision deferred

Capturing this for later. Not implementing now. The Cytoscape-first recommendation should hold up regardless of when we revisit, but the choice of whether to also add Mermaid (or whether to adopt Cytoscape internally vs. translate-at-boundary) is open.

---

# FAANG system design interview compatibility — research

The operator's framing: *"do extensive research on interview questions for google system design and talk to me about what we may be able to add, i want to try to add a comprehensive real world puzzle that is sophisticated enough that this can be used by FAANG interviewers to use at an interview."*

This is research for a real architectural decision. Top finding upfront: **two existing tools already cover this space** ([paperdraw.dev](https://paperdraw.dev/) and [syde.cc](https://syde.cc/)). Anything we do here needs to be deliberate about differentiation. More on that below.

## The state of FAANG SDI today (2026)

### Format
- Each Google SDI interview is 45 minutes, focused on one complex problem ("Design YouTube").
- Google gives 1–3 SDI rounds depending on level; more for L5+ and for infra/security/ML domains.
- **Recent shift:** Google is returning to in-person interviews in 2026 to combat AI-assisted cheating, while also adding a new pre-interview screening tool (the Google Hiring Assessment) and weaving AI/ML system design into the rotation.

### The standard delivery framework (Hello Interview's "System Design in a Hurry")
Five stages, expected in this order:

1. **Requirements** (5 min). Functional ("users should be able to…") + Non-functional ("the system should be…"). Candidates are evaluated on their ability to prioritize the top 3 functional requirements rather than enumerate everything.
2. **Core Entities** (a few min). What are the things in this system — User, Post, Tweet, Video, Ride. Identifying them sets up the data model.
3. **API / Interface** (~5 min). REST endpoints or RPCs. Defines the contract between client and backend.
4. **Data Flow** (~5 min). For each API call, what happens — which services, which stores, what gets read/written.
5. **High-Level Design** (~15 min). Diagram the components + data flow. Boxes and arrows.
6. **Deep Dives** (~10 min, often two of them). Interviewer picks a component or trade-off to probe. "How would you handle 100x traffic on the read path?" "What if the primary DB fails?" "How do you keep replicas consistent?"

### The evaluation rubric (consistent across FAANG)

Four dimensions, scored independently. Strong technical answers with poor structure still cap mid-level.

| Dimension | What it looks like |
|---|---|
| **Structured Problem-Solving** | Did they clarify requirements before diving in? Manage their time? Stay focused on the top 3 features? |
| **Technical Depth** | Do they know how the tools actually work? Can they explain cache eviction, LB selection, distributed write paths? Surface knowledge caps you at mid-level. |
| **Trade-off Reasoning** | "I chose NoSQL because we need horizontal write scaling and can tolerate eventual consistency" beats "I chose MongoDB." Every tech choice should be defended. |
| **Communication** | Think out loud. Adjust when pushed back on. Ask for direction when stuck. |

### Level expectations
The bar moves significantly by level. Same answer, different scores:

- **L3 / new grad**: a clean high-level architecture with reasonable choices = strong score.
- **L5 / senior**: same answer = neutral. Need to volunteer trade-offs and deep dives without prompting.
- **L6+ / staff**: same answer = downleveled. Expected to proactively discuss failure modes, operational concerns, cost reasoning, multi-region — without being asked.

## The top FAANG questions

Stable list across years, with notes on what each one stresses:

| # | Question | What it tests |
|---|---|---|
| 1 | Design Twitter / Newsfeed | Fan-out (write vs read), feed generation, ranking, push vs pull |
| 2 | Design YouTube / Netflix | Video encoding pipeline, CDN, blob storage, streaming protocols |
| 3 | Design Uber / Lyft | Real-time geo-location, dispatch matching, surge pricing, ETA |
| 4 | Design WhatsApp / Messenger | Long-lived connections, presence, message delivery semantics, push |
| 5 | Design Google Drive / Dropbox | File sync, deltas, conflict resolution, block storage |
| 6 | Design URL Shortener | Hashing, base62, write-once-read-many, caching (we have this) |
| 7 | Design Google Search | Crawling, indexing, ranking, query latency at planet scale |
| 8 | Design Distributed File Storage (GFS-like) | Replication, consistency, master-chunk-server, recovery |
| 9 | Design Rate Limiter | Token/leaky bucket, distributed coordination, fairness |
| 10 | Design Web Crawler | Frontier queue, politeness, dedup, scale |
| 11 | Design Notification System | Fan-out at scale, push vs poll, prioritization, batching |
| 12 | Design Newsfeed (generic, any social) | Same as Twitter mostly; sometimes phrased as Instagram/Facebook |

Recent additions (post-2024):
- **Design a recommendation system** — feature store, model serving, A/B test infrastructure.
- **Design an ML training pipeline** — distributed training, parameter servers, gradient aggregation.
- **Design an LLM inference service** — batching, KV cache, autoscaling.

## What already exists in this space

**This is the part the operator should be most aware of.** Two tools are doing exactly the simulator-for-SDI thing:

### [paperdraw.dev](https://paperdraw.dev/)
- Browser-based, free.
- Supports: load balancers, services, databases, caches, queues, CDNs, object storage, client traffic flows.
- Request-per-second simulation; watches latency change across the architecture.
- **Failure injection**: overloads, outages, network failures.
- Pre-built examples: YouTube video streaming, WhatsApp messaging, Uber ride matching.
- Target audience: engineers preparing for system design interviews.

paperdraw.dev is uncannily close to where we'd be aiming. They have the queue+CDN+object-storage components we don't have, they have failure injection, and they have ready-built FAANG-style example systems. Their pedagogical depth is unclear from the landing page — they may be more "draw and simulate" than "learn from first principles."

### [syde.cc](https://syde.cc/)
- Also browser-based, also free.
- AWS / Azure / GCP cloud-architecture focus (named components from the real cloud catalogs).
- Production-style simulation; AI-assisted optimization; reliability/scalability/cost trade-offs.
- More targeted at "cloud architects designing real infra" than "students learning concepts."

SyDe is positioned differently — pre-deployment design tool, not a teaching tool. Less direct competition with our pedagogical angle, but if FAANG interviewers were going to point candidates somewhere, SyDe's named-cloud-component approach is a stronger match to how candidates talk during interviews.

### What's NOT out there

Both tools are *sandboxes*. Neither has:
- A **curriculum** that builds from foundations (we have: Lessons 1–6 form a learning arc).
- A **container model** for physical composition (our Computer-holds-CPU-RAM-Disk is unusual).
- A **first-principles** angle (we teach "what is a computer, what is a LAN, what is DNS" before getting to flow).
- Per-component **pedagogical info** integrated with the canvas (our ComponentInfo pane).

That's our differentiation, if we want it.

## Gap analysis — our platform vs FAANG-grade

What our platform does well:
- ✅ Lessons 1–6 cover networking + flow foundations cleanly.
- ✅ Flow simulator with capacity, latency, bottleneck detection, R/W split.
- ✅ Composition + connectivity sims for the non-flow concepts.
- ✅ Predicate framework lets us define grading criteria declaratively.
- ✅ Info pane teaches concepts inline.
- ✅ Solution button shows canonical answers for guided learning.

What our platform doesn't have that FAANG-grade puzzles need:

**Missing components:**
- **CDN** — geographic edge cache. Needs latency-by-region modeling.
- **Message Queue** — async fan-out. Needs queue depth + drain rate.
- **Worker / Consumer** — pulls from queue, processes async. Needs throughput rate.
- **Search Index** — eventually-consistent read path separate from primary DB.
- **Object Storage** — for blobs (videos, images). Bandwidth-bound, not RPS-bound.
- **Sharded Database** — partition key, hot shard awareness.
- **API Gateway** — sits in front of LB conceptually.

**Missing simulator features:**
- **Multiple workload types per puzzle.** Twitter has reads (timeline), writes (tweet), search, media uploads. Each is its own flow. Our sim handles one flow.
- **Async paths.** Write → queue → worker → store. The main path returns 202 before the write fully propagates. We don't model "this work happens later."
- **p50 / p99 latency.** Currently we report only average. FAANG cares about tail latencies.
- **Failure injection.** "Kill the primary DB and watch what happens."
- **Replication lag.** Read-your-writes consistency requires modeling lag.
- **Fan-out (write-side).** A tweet by a celebrity triggers N follower feed updates. Linear in N.
- **Geographic distribution.** Multi-region, with replication lag between regions.

**Missing UX modes:**
- **Sandbox mode** (vs puzzle mode). A FAANG interview is open-ended — no auto-grading. Candidate designs; sim shows whether it holds up; interviewer probes.
- **Workload knobs.** "Now imagine 10x traffic" — slider that scales the input.
- **Failure injection knobs.** "What if this component dies?" — checkbox to disable + re-simulate.
- **Capacity-estimation prompts.** "Estimate storage / bandwidth / QPS given X DAU." Math the candidate does by hand.

## What a "FAANG-grade puzzle" actually looks like

If we shipped Lesson 7 = "Design Twitter," it would need:

- **Workload profile**: 100M DAU, 500 tweets/sec write rate, 10k newsfeed reads/sec, 1k searches/sec, mean 200 follows per user (with a long tail of celebrities with 10M+ followers).
- **Components on canvas**: Client, CDN, API Gateway, LB, App Servers (multiple), Cache (timeline cache + object cache), Primary DB (write), Read Replicas, Queue (for fan-out), Fanout Workers, Search Index, Object Storage (for media), Notification Service.
- **Multiple flows**:
  - Post: Client → LB → App → write to Primary DB + enqueue fanout job + write to Object Storage if media.
  - Read newsfeed: Client → CDN → Cache → App → Read Replica (cache miss).
  - Search: Client → LB → App → Search Index.
  - Fanout: Queue → Worker → Newsfeed Cache (for each follower).
- **Pass criteria** (multiple, layered):
  - Steady-state: writes < 1% drop, reads < 200ms p99, all components < 80% utilization.
  - Spike: 10x writes for 60s, system recovers within X seconds.
  - Failure: primary DB unreachable, writes either queue or shed gracefully.
  - Celebrity fanout: a 10M-follower tweet doesn't melt the queue.

This is a 3–5 phase puzzle, not a single-shot one. Each phase = a deep dive the interviewer would have prompted.

## Three candidate FAANG-grade puzzles

In order of concept density and feasibility for our platform:

### A. "Scale the URL Shortener" — easiest, biggest leverage on existing work
We already have a URL Shortener (Lesson 5). Add:
- A counter service (Redis-style) to issue unique short IDs at scale.
- An analytics pipeline (queue → worker → analytics DB) for click tracking.
- A CDN for the redirect serving path.
- A 10x traffic phase, then a 100x phase.

Adds: Queue, Worker, CDN, Analytics DB. Reuses everything else. **Most realistic Lesson 7.**

### B. "Design Twitter Newsfeed" — the canonical FAANG question
The full scope above. Adds the most components but maps directly to the single most asked SDI question.

**Risk**: complexity. This is a multi-week effort. The puzzle would be sophisticated enough that finishing it requires understanding most of distributed systems.

### C. "Design a Web Crawler" — async-heavy, fewer components
- Seed list → Frontier Queue → Crawler workers → Parser → Deduplicator → Indexer → Storage.
- Pure async pipeline, no real-time read path.
- Forces queues, workers, dedup (Bloom filter) — concepts our platform doesn't have yet.

**Trade-off**: less popular than Twitter as an SDI question, but a cleaner architectural shape — pure data pipeline. Good "warm-up" before Twitter if we want to ship the async-path infrastructure first.

## The "puzzle vs sandbox" question

This is the architectural decision the operator should weigh in on:

- **Puzzle mode** (what we have): pre-defined initial graph, fixed pass criteria, single passing solution (give or take). Good for learning, bad for interview practice.
- **Sandbox mode** (what FAANG interviews need): blank canvas, workload knobs, failure knobs, multiple valid solutions, no auto-grading, the human interviewer probes.

We could:
1. Keep both. Pick a sandbox per puzzle (the "explore freely after solving"); use puzzle mode for guided learning.
2. Ship sandbox as a separate "Interview Practice" mode alongside the lesson tracks.
3. Make puzzles multi-phase (steady state → spike → failure → optimization) so a single puzzle covers more of an interview's range.

Option 3 is the lightest lift. Reusing the predicate framework, each phase has its own requirements; the puzzle "completes" when all phases pass. This still gives auto-grading but captures the iterative-deep-dive nature of an interview.

## What we definitely won't do

To stay honest about scope:

- **Replace the interview.** It's a conversation. We can be the shared whiteboard + simulator, not the interviewer.
- **Model real cloud services 1:1** (S3 vs DynamoDB vs Cassandra). The components stay abstract — "object storage" not "S3" — so the platform isn't a marketing tour. (SyDe took the opposite bet.)
- **Auto-evaluate trade-off reasoning.** "I chose NoSQL because…" is what the human interviewer evaluates. Our sim only shows whether the design works.
- **Coding interviews.** Adjacent space, well-served by LeetCode et al.

## Honest competitive read

If a candidate wants pure SDI practice today, paperdraw.dev is closer to what they need than we are. They have queues, CDNs, failure injection, pre-built examples — the whole SDI sandbox. We don't.

Our edge is the *pedagogical* angle. Someone who doesn't know what a load balancer is yet doesn't benefit from paperdraw.dev; they need our Lesson 1–6 arc first. Then they could go to paperdraw.dev for practice, OR we could be both.

The question is whether we want to compete with paperdraw.dev or complement it. Competing means shipping queues/CDNs/failure-injection. Complementing means staying focused on the pedagogical curriculum and accepting that SDI practice tools exist elsewhere.

## Recommendation (for the conversation)

If the operator commits to FAANG-grade puzzles:

1. **Ship Lesson 7 = "Scale the URL Shortener"** as the foothold. Lowest new-component cost; reuses Lesson 5's setup. Adds Queue + Worker + CDN + analytics DB. ~1–2 weeks of work for the components + simulator extensions.
2. **Stay focused on multi-phase puzzles** (steady → spike → failure → optimize) rather than building a separate sandbox mode. Reuses our predicate framework. Cheaper than introducing a new mode.
3. **Defer the full Twitter puzzle** until the queue/worker/CDN infrastructure is in place and proven via the URL Shortener scale puzzle.
4. **Don't try to compete with paperdraw.dev on breadth.** Stay deeper instead of wider — better explanations, more careful lessons, sharper feedback when wrong.

If the operator wants to back off the FAANG angle:

- Our existing 6 lessons are already strong as a pedagogical tool. Better to polish them (more puzzles in each conceptual area, sharper info copy, the JSON puzzle framework from `framework.md`) than to chase a market already occupied by paperdraw.dev / SyDe.

## Open questions for the operator

1. **Is FAANG interview compatibility the actual goal, or is it "ambitious-enough puzzles that prove our platform is serious"?** These have different answers.
2. **Do we want to be a teaching tool with optional SDI practice, or a SDI practice tool with optional teaching?** Both are viable; the prioritization changes downstream of which.
3. **How much new simulator infrastructure are we willing to add?** Queues + async paths is a real undertaking — probably 2-3 sessions of focused work.
4. **Are we comfortable being aware of paperdraw.dev's existence and shipping anyway?** I lean yes if the angle is pedagogy-first, no if the angle is "build a better paperdraw."

Capturing here. Not implementing.

Sources:
- [Google System Design Interview Questions (2026) — System Design Handbook](https://www.systemdesignhandbook.com/blog/google-system-design-interview-questions/)
- [Google System Design Interview: What Changed, What They Ask — Design Gurus Substack](https://designgurus.substack.com/p/googles-system-design-interview-in)
- [System Design Delivery Framework — Hello Interview](https://www.hellointerview.com/learn/system-design/in-a-hurry/delivery)
- [What FAANG Expects at Each Level in System Design Interviews — Design Gurus Substack](https://designgurus.substack.com/p/system-design-for-new-grad-vs-l5)
- [System Design Interview Questions: Top 40 for 2026 — System Design Handbook](https://www.systemdesignhandbook.com/guides/system-design-interview-questions/)
- [paperdraw.dev](https://paperdraw.dev/)
- [SyDe.cc](https://syde.cc/)
- [The Complete System Design Interview Guide (2026) — System Design Handbook](https://www.systemdesignhandbook.com/guides/system-design-interview/)
