# Architecture Caveats

Architectural decisions we made on purpose, and the corners we cut to ship them. Each one names a simplification, the reason we chose it, the future scenario where it'll bite, and what we do when that scenario arrives.

Format adapted from `superfluous-ai/infra/docs/caveats.md`. Goal: enough background that the *why* survives even when the operator forgets the conversation that led here.

---

## 1. Async paths are identified by Queue/Worker node type, not an edge flag

### The Decision

Confirmed 2026-05-12. When the simulator encounters a Queue node, the edge *into* the Queue ends the synchronous request path. The edge *out* of the Queue (typically to a Worker node) starts an async path. There is no per-edge `async: true` flag. The semantics are implied by node type.

### Why We Chose This

The alternative — making every edge carry an `async` boolean — would let us mark any edge in the graph as async. More flexible, but also more confusing: a player drawing `App Server → Database` could accidentally mark it async, which is conceptually nonsense (writes to a DB are sync until proven otherwise).

Encoding "async" in the node type (Queue = async boundary by definition) means:
- The player doesn't have to think about per-edge semantics.
- The simulator's behavior follows the visual: if you see a Queue, you know the request is being deferred.
- Real-world architectures match this; "you put a queue in front of the worker" is how people draw it.

### When This Will Bite

A puzzle where the same physical service handles sync and async traffic on different code paths. Imagine an App Server that responds to API calls synchronously *and* fires-and-forgets logging events to a tail. Today we'd model the logging tail as `App Server → Queue → Worker`, which forces logging through a separate node — fine pedagogically, slightly wrong physically.

We'd also struggle to model "this endpoint is sync, that endpoint is async" on the same service. Today we'd split the service into two nodes.

### What We Do When That Scenario Arrives

Add an optional `data.async: true` flag on edges. Default false. Honor it everywhere the node-type rule would have. The two systems coexist; the implicit-by-type rule stays the default. No data migration needed; existing puzzles all continue to work because the new flag is optional.

---

## 2. Success rate splits into main-path and background-path

### The Decision

Confirmed 2026-05-12. Once async paths exist, `successRate` is the *main-path* (client-visible) success rate: did the originating request get a response (synchronously, or get accepted into a queue)? A new metric `backgroundSuccessRate` tracks whether async work eventually completed (queue drained, worker processed).

### Why We Chose This

Lumping them together is the obvious wrong choice. A celebrity tweets, the fanout queue backs up for an hour, every follower's newsfeed is stale — but the *client* who tweeted got a 202 instantly. To them the system worked. To the follower it didn't.

Two metrics let puzzles express which kind of failure they care about. Lesson 7's Scale puzzle would care about main-path success (clients can shorten URLs). A future "Design newsfeed at fan-out scale" puzzle would care about background success (followers actually see the tweet).

Predicates can target either: `{ kind: 'metric', name: 'successRate', op: '>=', value: 0.99 }` or `{ kind: 'metric', name: 'backgroundSuccessRate', op: '>=', value: 0.95 }`.

### When This Will Bite

When a puzzle needs more than two paths. Imagine "Design Twitter Newsfeed" with: client post (main), fanout-on-write (background 1), search index update (background 2). Two background paths with independent success rates. Our model collapses them into one.

Also: nested async. If the fanout worker enqueues to another queue, the second-level async path is invisible — it just adds to `backgroundSuccessRate`.

### What We Do When That Scenario Arrives

Generalize from `{ successRate, backgroundSuccessRate }` to a path-keyed map: `{ pathSuccessRates: { main: 0.99, fanout: 0.98, searchIndex: 0.93 } }`. Each Queue defines a path key in its config; everything downstream rolls up under that key. Predicates take a `path` parameter.

The current two-axis model is forward-compatible: rename `successRate` to `pathSuccessRates.main` and `backgroundSuccessRate` to a path the operator names.

---

## 3. p99 latency is multiplier-based, not distribution-based

### The Decision

Confirmed 2026-05-12 after competitor research. paperdraw.dev's marketing language ("RPS simulation, watch latency change") suggests they use a similar steady-state approach with a tail proxy. Distribution-aware simulators like MATLAB SimEvents are out of scope for a browser SDI tool.

Each component carries a `p99Latency` field, defaulting to `latency * 3` (3× mean is a coarse industry rule of thumb). The simulator accumulates p99 along the worst incoming path the same way it accumulates mean. Players can tune `p99Latency` per-component if they want realistic numbers.

### Why We Chose This

The "right" way to compute p99 across a graph is to model each component's latency as a probability distribution (mean + variance, or a full histogram), then convolve distributions through the graph topology. This is what discrete-event simulators do.

Our simulator is steady-state math, not discrete-event — explicitly out of scope in `spec.md`. Pretending we do real p99 would over-promise. The multiplier model is honest: "this is roughly how much slower the tail is."

A 3× multiplier is conservative for well-behaved services (Cache hit, App Server under capacity). It's optimistic for services near capacity (queues forming, retries firing). Players who want realistic tail latency can adjust per-component; players who don't can ignore the field.

### When This Will Bite

Puzzles that hinge on tail-latency math. A rate-limiter puzzle ("99% of requests under 100ms") would be lying with our model — we don't model queue-tail amplification. A circuit-breaker puzzle would need to know when p99 crosses a threshold; the multiplier won't capture the dynamic where p99 explodes as utilization approaches capacity.

### What We Do When That Scenario Arrives

Two options:
1. **Add utilization-aware p99.** Each component's effective p99 = `baseP99 * utilizationMultiplier(currentLoad / capacity)`. Captures the "queues form near capacity" effect without leaving steady-state math. Probably 30–50 LOC.
2. **Ship a true discrete-event sim as a fourth simulator kind.** Only puzzles that need it use it; the existing three sim kinds (flow/composition/connectivity) stay multiplier-based.

Option 1 first. Option 2 only if a real puzzle demands it.

---

## 4. Queue depth is unbounded in v1

### The Decision

The Queue component models infinite buffering capacity. If the producer is faster than the consumer, the queue depth grows unboundedly without producing back-pressure. The simulator tracks "current queue depth = producer rate − consumer rate × time" but never drops messages due to a depth cap.

### Why We Chose This

Real queues drop messages or apply back-pressure when they hit a depth limit. Modeling that requires either:
- A time-stepped simulation (depth at t=0, t=1, t=2 …).
- A steady-state approximation that says "if producer > consumer, eventually fail at a configurable lag."

Both are more work than v1 needs. For Lesson 7's Scale puzzle, "queue is filling faster than workers drain" already shows up as `backgroundSuccessRate < 1` over a long enough simulation. The player sees the problem; they fix it by adding workers.

### When This Will Bite

A puzzle teaching memory-bounded queues ("Kafka's retention, RabbitMQ's queue length limits, SQS's message-age limits"). Today our queue is infinite RAM, so the player can't experience "the queue is full and now we drop." The lesson would lie.

Also: cascading-failure puzzles where a downstream slowdown causes upstream services to time out *because the queue grew unboundedly*. We can't model that today.

### What We Do When That Scenario Arrives

Add `Queue.config.maxDepth` (default: unlimited). When the steady-state model shows queue depth > maxDepth, mark the queue as overflowing and drop the excess. Effective success rate downstream of the queue caps at `consumerRate / producerRate`.

Pair with a UI indicator on the Queue node: "queue overflowing" warning when the rates don't balance and maxDepth is finite.

---

## 5. One Worker node = one consumer; pools are modeled as multiple nodes

### The Decision

A Worker node has its own throughput (`jobsPerSec`). To model a worker pool, the player drops multiple Worker nodes side-by-side with the same upstream Queue. This is exactly how multiple App Servers behind a Load Balancer work today; we're reusing the pattern.

### Why We Chose This

Two reasons:
- **Visual consistency.** A Computer is a Computer; multiple Computers means more Computers. A Worker is a Worker; multiple Workers means more Workers. No special "this Worker has N replicas" concept that breaks the rule.
- **Simulator simplicity.** Capacity is per-node, like every other component. Total worker capacity = sum of capacities, like LB → multiple App Servers already.

### When This Will Bite

When the player wants to model 100 workers visually. Today they'd drop 100 Worker nodes onto the canvas. That's ugly.

### What We Do When That Scenario Arrives

Add an optional `Worker.config.replicas` (default 1) that multiplies the node's throughput without requiring multiple visual nodes. Same shape we discussed for "horizontal scale" in the v0 spec's open questions ("how to model horizontal scale without polluting the canvas").

When we add this, it should be a property of *every* scalable node (App Server, Worker, Read Replica, etc.), not just Worker. It's a system-wide pattern.

---

## 6. CDN is single-region in v1

### The Decision

The CDN component models a single global edge cache. Hit rate, latency, capacity — all single numbers. There's no concept of "the user in Tokyo hits the Tokyo edge with low latency; the user in São Paulo hits the São Paulo edge."

### Why We Chose This

Geographic distribution is a big architectural surface. Multi-region requires:
- A region taxonomy on every node ("which region am I in").
- Per-region client populations (workload mixed by region).
- Inter-region latency matrix.
- Per-region hit rates on the CDN.

None of that fits in the v1 CDN. A single CDN node with one hit rate captures "we have an edge cache that absorbs most reads" — which is the lesson for Scale-the-URL-Shortener.

### When This Will Bite

Any puzzle teaching geographic distribution: "Design a global news service," "Design TikTok's video delivery network," "Why does the user in India see different content than the user in Brazil." These can't be modeled accurately with our single-region CDN.

The puzzle CAN still be played — it just won't show the actual lesson (proximity affects latency; misses fall back across continents and are slower than misses within continent).

### What We Do When That Scenario Arrives

Introduce a `region` field on every node. Default: "global" (the current behavior). Inter-region edges accrue cross-region latency. CDN nodes can have per-region hit rates.

This is a bigger lift than the other caveats — touching every node + adding a region taxonomy. Probably its own multi-session arc. Expected when we get to Lesson 9 or later ("Design a CDN" as a puzzle in itself).

---

## 7. Failure injection cascades one hop, not transitively

### The Decision

When a node is disabled (failure injected), the simulator drops all flow into that node and surfaces a warning. Downstream nodes that received flow *from* the disabled node now receive zero. They are not themselves disabled, and no queue-backup or retry-storm modeling kicks in upstream.

### Why We Chose This

Real cascading failures involve: retry storms (clients retrying the failed call, multiplying load on now-degraded paths), connection-pool exhaustion (upstream services holding open requests, starving their pool), thundering herds, etc. All require dynamic state we don't model.

For v1, "this node is down, the path through it is broken" is enough to teach the lesson. The player observes that disabling the Cache shifts all read load to the Database, and the Database is overwhelmed. The mechanism is right; the time-dynamics are missing.

### When This Will Bite

Puzzles teaching resilience patterns: circuit breakers, bulkheads, retry budgets, jittered backoff. Each one is a story about how a failure cascades and how to contain it. Our model can show the *static* end state ("DB overloaded after Cache dies"); it can't show the *dynamic* path ("the retries amplified load 3x in the first 30s before circuit-breaker tripped").

### What We Do When That Scenario Arrives

Add a discrete-event simulator kind. Time-stepped, models retries explicitly, models connection pools, models the order events happen. This is a real "fourth sim kind" decision, parallel to flow/composition/connectivity.

Defer until a resilience-patterns puzzle is in the active backlog. Until then, the simpler model serves.

---

## 8. Service-like components unified under one `service` type with a role config

### The Decision

Decided 2026-05-12. App Server, Worker, and any future request-handler components (API Gateway, Notification Service, Cron Job, Batch Job, etc.) are NOT distinct top-level component types. They are a single `service` component type with a `role` config field that names the sub-kind. Visual presentation (label, color, icon) is derived from the role; simulator behavior is shared.

This explicitly REJECTS the "visible distinction, shared implementation" approach where we'd keep separate top-level types (`appServer`, `worker`, ...) that share an internal helper. The unification is real all the way down — one entry in `componentTypes`, one info-pane mapping that keys on role, one palette item per role.

**Scope:** the unification covers components that are atomic services with abstract capacity (App Server, Worker, future API Gateway, etc.). It does NOT cover Program / Web Server (which live INSIDE a Computer with hardware requirements — different abstraction, different parent-child semantics).

### Why We Chose This

The earlier draft of this caveat had a threshold ("revisit unification at 5+ service-like types"). Operator rejected that: do the right thing now rather than wait for the migration to be more expensive. See memory record `feedback-prefer-unified-taxonomy.md`.

Architecturally honest:
- App Server and Worker share identical simulator math (capacity + latency + p99Latency, no special role-specific logic).
- The difference between them is *what's upstream* (LB vs Queue), not what they fundamentally are.
- The industry view ([Microsoft's Web-Queue-Worker pattern](https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/web-queue-worker), [diagram-tool conventions](https://vfunction.com/blog/architecture-diagram-guide/)) treats both as "services" with different interaction patterns.

### When This Will Bite

Three scenarios:

1. **A future service-like component needs genuinely different simulator behavior** — for example, an API Gateway that does rate-limiting (caps throughput per client), or a Notification Service with retry semantics. If the new role can't be expressed as a config knob on the same simulator code, we'd have to either (a) introduce role-specific sim branching (smell), or (b) finally split it into its own type.
2. **The role list gets unwieldy in the palette.** Today 2 roles (appServer, worker). At 10+ roles, the palette becomes a long menu. Worth considering grouping or filtering at that point.
3. **The migration we just did was for the wrong unification.** If it turns out Program / WebServer / Computer DO want to be folded into Service (per the `research.md` "App Server is a Computer with a web-app Program inside" speculation), we'd want a bigger refactor that this one prefigured.

### What We Do When That Scenario Arrives

**For scenario 1:** introduce role-specific behavior in the simulator branched on `config.role`. If the branching gets too dense (more than ~3 if-branches deep), split the role into its own top-level type AND keep the precedent caveat — this is the genuine "structural difference" case the unification was never meant to cover.

**For scenario 2:** add palette categories ("Compute" with appServer/worker/apiGateway, "Storage" with database/replica/cache, etc.) Palette grouping is a UI change, not a model change.

**For scenario 3:** plan a bigger refactor. The current `service` unification is a precedent, not an obstacle — the migration pattern (one type with role config) is the same shape we'd apply to Program/WebServer/Computer.

---

## Adding new caveats

When we cut a corner that future-us will regret if we forget about, add it here with:

1. **The Decision** — what we did, when, confirmed by whom.
2. **Why We Chose This** — the trade-off, honestly.
3. **When This Will Bite** — the concrete future scenario where this is wrong.
4. **What We Do When That Scenario Arrives** — the path to fix, not just "we'll think about it."

Don't add caveats for bugs that got fixed. Those go in `journal.md`. Don't add caveats for decisions we're going to revisit immediately. Those go in `framework.md` or in a session conversation. This file is for the **knowingly accepted simplifications** that are correct *for now* but wrong *eventually*.
