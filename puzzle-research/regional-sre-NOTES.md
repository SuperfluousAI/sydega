# Regional / AZ / SRE puzzle track — tabled for later

Captured 2026-05-13 during the e-commerce planning conversation. Not building now; revisit after Lesson 19 ships and we play-test e-commerce. This doc preserves the analysis so we don't re-derive it from scratch.

## Why this is its own track

E-commerce (Lesson 19) and other "single-region" canon puzzles assume the cluster Just Works. Real production hardens this with:
- Multi-AZ deployment (replicas across physically isolated DCs)
- Multi-region deployment (active-active or active-passive, geo failover)
- RTO/RPO targets (recovery time / recovery point)
- Chaos engineering / blast radius / bulkheading
- Health checks + auto-routing on failure
- Geo-DNS / latency-based routing

The pedagogy doesn't fit any existing puzzle cleanly — it's its own SRE-flavored angle.

## What the simulator can do today (no new code needed)

- **Failure injection** (per-node `failed` flag) → manually fail nodes to simulate AZ failure
- **Failure-driven leader promotion** (built for Kafka in Lesson 17) → when a `queue` fails, the first healthy `kafkaReplica` is promoted. This is a real failover primitive; it can be generalized to any role.
- **Decorative regions** (visual zones from Lesson 3's LAN/Internet) → label "us-east-1a / us-east-1b" without sim semantics
- **Multi-instance redundancy** (LB + N servers) → already the pattern

## What the simulator can NOT do today (gaps)

These are the things that would limit teaching value:

1. **Region-aware client traffic** — a client carries no region tag; "US-East client must hit US-East gateway" can't be expressed
2. **Cross-region replication lag** — latency is per-node, not per-edge or per-distance; no concept of "syncing across regions takes 100ms vs within-region 1ms"
3. **Automatic failover routing during sim** — failure is binary; traffic doesn't auto-route to standby. Player must manually toggle `failed` flags and re-run.
4. **Geo-DNS** — not represented at all
5. **Quorum reads/writes across regions** — partial via ISR; not multi-leader

## Two paths (decision deferred)

**Option A — Build on current primitives, diagrammatic lesson.**
- Visual region zones (decorative)
- Students place replicas across zones
- Sim feedback by manually failing nodes; observe what survives
- Lesson copy carries the SRE concepts (RTO/RPO, active-active vs active-passive, chaos engineering, bulkheading)
- **Cost: low.** Could ship in ~half a day.
- **Risk:** lighter sim feedback than other capstones; teaches concepts but feels more "diagram quiz" than "interactive system."

**Option B — Extend the sim, then build a small track (2-3 puzzles).**
- Add region tags to clients + nodes
- Add per-edge latency (so cross-region edges are slow)
- Add auto-failover routing: when a node fails, traffic flows to a sibling with the same role/region
- Then build:
  - L20: Survive a single-AZ failure (multi-AZ replication)
  - L21: Survive a region failure (cross-region active-passive)
  - L22 (stretch): Latency-aware geo-routing (active-active with sticky)
- **Cost: high.** 1-2 days of sim changes before first lesson lands.
- **Payoff:** real SRE track with interactive feedback, not diagrams.

## Recommendation (preserved for next time we touch this)

After Lesson 19 (e-commerce) ships and gets play-tested, decide based on:
1. Does e-commerce naturally pull "but how would this survive an AZ failure?" — if yes, that's a strong bridge to **Option B**
2. If e-commerce stands alone and the SRE angle feels disconnected, ship **Option A** as a single lesson (L20) instead

## Specific SRE concepts to teach (when we get here)

In rough priority order — pick subset for first puzzle:
- **AZ vs Region** — distinguish physical isolation from geographic isolation
- **Multi-AZ replication** — RDS-style: one writer, replicas in other AZs, automatic failover
- **Active-passive multi-region** — primary serves, secondary syncs; manual failover or DNS-flip
- **Active-active multi-region** — both regions serve, conflict resolution required
- **RTO** (recovery time) vs **RPO** (recovery point) — how fast you recover, how much data you might lose
- **Blast radius** — bulkheading, cellular architecture; one AZ goes down, only that cell's customers feel it
- **Chaos engineering** — Netflix Chaos Monkey origin story; "if you can't tolerate a server failure in dev, you can't tolerate it in prod"
- **Health checks** — readiness vs liveness; what triggers a re-route
- **Circuit breakers** — fail-fast vs cascade; Hystrix / Resilience4j pattern
- **Graceful degradation** — when recommendations are down, still allow checkout

## Sources to fetch (when we get here)

Not fetched yet — saved for the research pass:
- AWS Well-Architected Framework — Reliability Pillar
- Google SRE Book / Workbook — Ch. 23 (Managing Critical State), Ch. 26 (Data Integrity)
- Netflix Tech Blog — Chaos Monkey, Hystrix, regional failover playbook
- HelloInterview — multi-region question (if they have one)
- Vitess "scale on YouTube" multi-region docs
- AWS Multi-AZ vs Multi-Region whitepaper
- Brendan Burns / Kelsey Hightower talks on cellular architecture

## Cross-references with existing memory

- [[feedback-extend-primitives]] — the "extend sim" answer (Option B) IS the right approach if SRE becomes a track, not a one-off lesson. We extended for Kafka (ISR, pubsub, failover); same playbook applies here.
- [[feedback-pause-to-play-cadence]] — definitely play-test e-commerce before committing to Option B's investment.
- Existing failover primitive (Kafka leader promotion) is a strong base — don't build from scratch.

## When to revive this doc

- After Lesson 19 (e-commerce) ships AND gets a play session
- When operator says "what about availability / failover / multi-region"
- Before any chaos-engineering or SRE-flavored puzzle starts
