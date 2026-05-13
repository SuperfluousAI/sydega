# Simplifications

Things this teaching tool deliberately abstracts away. Each entry names what the lesson glosses over, why, and what the full real-world picture looks like — so a student moving from this tool to an actual system design discussion can fill in the gaps.

Pedagogical companion to `caveats.md` (which tracks *build*-decisions). This file tracks *teaching*-decisions: where realism was traded for clarity.

---

## 1. DB clusters as generic write-capable pools (Lesson 6)

**Where it shows up**: Lesson 6 — *Add a Database Load Balancer*. The solution shape is `App → LB → {DB-1, DB-2, DB-3}` where the three DBs are interchangeable nodes accepting writes round-robin.

**What we say**: A Load Balancer sits in front of multiple Databases. Pick a DB, send the request, done.

**What's actually going on in production**: You can't just round-robin writes across multiple DB nodes without conflict resolution. Real systems do one of:

- **Sharding** — each DB node owns a slice of the key space (e.g., users A–M on DB-1, N–Z on DB-2). The "load balancer" is actually a sharding router that hashes the key and picks the right shard. Adding shards is hard (rebalancing).
- **Multi-master / leaderless replication** — every node accepts writes; conflicts are resolved by vector clocks (Riak), last-write-wins (Cassandra), or CRDTs (Riak again). Operational complexity is high.
- **Single-primary with failover** — only one node accepts writes at a time; others are hot standbys. Adding a "shard" really means adding more single-primary clusters and routing by key. This is what most real Postgres / MySQL deployments look like.

**Why we abstract**: Each of these would deserve its own lesson (or three). The pedagogical primitive at this stage is the *routing-layer pattern* — that the app talks to a logical endpoint, not to specific DB nodes. Sharding mechanics, conflict resolution, and rebalancing belong in a later, more advanced curriculum.

**What the next lesson refines**: Lesson 7 (Replicate Your Reads) re-uses the same LB primitive but specializes it for the read/write split, which is the most common real-world variant of "multiple DBs behind a router."

---

## 2. Read Replicas don't lag (Lessons 7+)

**Where it shows up**: Whenever `readReplica` is on the canvas. In our sim, a Read Replica serves a read the same as the Primary would — perfect, instant, consistent.

**What's actually going on**: Real Read Replicas lag the primary. A write committed at 12:00:00.000 might not show up on a replica until 12:00:00.150 — or longer under load. This causes "read-your-own-writes" bugs (user posts a comment, refreshes, comment isn't there yet) that drive a whole sub-industry of consistency-tuning, session-stickiness-to-primary, and synchronous-replica configs.

**Why we abstract**: Replication lag is a time-series phenomenon; our simulator is steady-state (rates, not events). A consistency-bug lesson needs a different sim shape (events with timestamps) and probably belongs in a v2 curriculum.

**What a student should know**: When you see "Read Replica" in a real design, expect a follow-up question about replication lag, eventual consistency, and read-your-own-writes guarantees. Standard answers: route the user's reads to the primary for N seconds after their write; use synchronous replicas at the cost of write latency; accept the lag and design the UI to tolerate it.

---

## 3. Queues never run out of space (Lessons 7+, future)

**Where it shows up**: The Queue component currently has no capacity field — it absorbs whatever you throw at it.

**What's actually going on**: Real queues have backlog limits. SQS has a 120k in-flight cap per queue. Kafka topics fill disks. RabbitMQ memory-bound or disk-bound. When the queue fills, producers either back-pressure (block) or drop. The asymmetric-failure mode that comes with this — "writes succeed but the backlog grows unbounded" — is one of the most common production incidents.

**Why we abstract**: A v1 queue lesson is about the *async boundary* — that some work doesn't need to finish before the user gets a response. Backpressure and backlog limits are a separate concept worth its own lesson (or a v2 enhancement to this lesson).

**What a student should know**: Real queues have caps. Always know what happens when the queue fills. "Drop" vs. "block" is an SLA decision.

---

## 4. TTL / link expiration (Lesson 13 — TinyURL)

**Where it shows up**: Lesson 13 doesn't model link expiration. The URL Database stores entries forever; no Cleanup Service sweeps expired keys back to the KGS.

**What we say**: URLs persist indefinitely. The architecture is steady-state.

**What's actually going on in production**: Real URL shorteners have a default TTL (typically 1-2 years per Bitly / TinyURL). Expired keys are reclaimed into the KGS pool via a Cleanup Service that runs during low-traffic windows. Accessing an expired link returns HTTP 410 Gone (not 404 — semantically distinct from "never existed").

**Why we abstract**: TTL is a time-axis concept; our simulator is steady-state (rates per second, not events over time). Modeling time decay requires a different sim shape.

**What a student should know**: Real systems answer "Q5: Do we support link expiration?" with: (a) default TTL, (b) lazy expiration on read, (c) scheduled background cleanup, (d) key recycling back to the KGS. Mention all four in an interview.

---

## 5. Custom aliases (Lesson 13 — TinyURL)

**Where it shows up**: Lesson 13's KGS vends auto-generated 7-char IDs. We don't model user-chosen short URLs (`myapp.co/launch-day`).

**What we say**: All short URLs come from the KGS pool. The lesson is about the auto-generation path.

**What's actually going on in production**: Real URL shorteners support custom aliases — users pick their own short URL (subject to length limits and a reserved-name list). These live in a separate namespace from auto-generated IDs to avoid conflicts. Collision handling for user-chosen names is a synchronous DB check; uniqueness is enforced at write.

**Why we abstract**: Custom aliases introduce a separate namespace + collision protocol the simulator can't easily express (we don't model name-equality constraints between nodes).

**What a student should know**: In a real interview, custom aliases live in a separate DB table from KGS-generated keys. The application layer checks the custom-alias DB first on read; falls back to the auto-generated DB on miss. Reserved names (e.g., `myapp.co/admin`) live in a third namespace.

---

## 6. Malicious URL filtering (Lesson 13 — TinyURL)

**Where it shows up**: Lesson 13 doesn't model phishing/malware/spam URL detection. Any long URL the Posters submit is accepted.

**What we say**: All URLs are equally legitimate.

**What's actually going on in production**: URL shorteners are a popular vector for phishing — short URLs hide the destination. Mitigations: blacklist of known-malicious domains; reputation services (Google Safe Browsing API, VirusTotal API); content inspection of the destination page; user-reported abuse flagging. Some shorteners check at write time; others check on every redirect.

**Why we abstract**: Content inspection requires modeling the URL payload itself, which our flow-rate sim has no notion of.

**What a student should know**: Real answers to "Q3: How do we prevent malicious links?" cover: API-key gating, domain blacklist at write, reputation API integration, abuse-flag pipeline (user reports → ML scoring → manual review → takedown), and rate limiting on the create endpoint as a coarse-grained abuse signal.

---

## How to add an entry

When you simplify a real-world concept for pedagogical clarity:

1. Add a numbered entry above with these sections:
   - **Where it shows up** (which lesson(s), which components)
   - **What we say** (the simplification we present)
   - **What's actually going on** (the real-world picture)
   - **Why we abstract** (pedagogical reason)
   - **What a student should know** (the "in a real interview / job" framing)
2. Cross-reference from the lesson blurb if the simplification is load-bearing for that lesson.
