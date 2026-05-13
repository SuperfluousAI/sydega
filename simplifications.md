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

## 7. Replication factor / ISR / leader election (Lesson 14 — Kafka)

**Where it shows up**: Lesson 14 models the *static* parts of the durability story: kafkaReplica decorative markers carry `replicaOf` pointing to their leader Queue; each leader Queue has 2 dashed light-blue edges fanning out to its 2 follower replicas (visual signal, no flow); the Queue's `minInsyncReplicas` (default 2 in the canonical) gates write acceptance when `acks='all'`. Mark replica markers as failed and the corresponding Queue's writes drop. Mark a leader Queue as failed and the sim *promotes* a healthy replica to take over — its edges get rebound and traffic continues.

**What we say**: RF=3, acks=all, min.insync.replicas=2. ISR membership is the count of healthy replicas backing each leader; leader promotion is automatic when a leader fails.

**What's actually going on in production**: Each partition has one leader + RF-1 followers, and the **In-Sync Replica set (ISR)** is dynamically maintained — followers fall out of ISR if they lag past `replica.lag.time.max.ms`, then rejoin once caught up via pull-based replication. The leader maintains a **high watermark**: the offset all ISR members have replicated, and the boundary up to which consumers can read. `unclean.leader.election.enable=false` (default) refuses to elect a non-ISR replica even at availability cost.

**What we model vs. don't model**:
- ✓ ISR membership count + `min.insync.replicas` threshold (Phase 1)
- ✓ Failure-driven leader promotion to a healthy replica (Phase 3)
- ✗ Dynamic ISR shrinkage (followers falling behind, rejoining) — requires time-axis sim
- ✗ Pull-based replication protocol mechanics + high watermark — implementation detail
- ✗ `unclean.leader.election.enable` toggle — would be straightforward to add as a flag if needed
- ✗ Eligible Leader Replicas (ELR, KIP-966 preview in Kafka 4.0) — a subset of ISR guaranteed to have data up to the high watermark; we promote "first healthy replica" which is closer to unclean-leader-election semantics. Modeling ELR would require tracking the high watermark per partition.

**What a student should know**: In an interview, the canonical answer is `RF=3, acks=all, min.insync.replicas=2` — and now in our sim, killing 2 of a partition's replicas demonstrates the consequence (writes block). Know the durability-availability tradeoff: `unclean.leader.election=false` favors durability; `=true` favors availability. Real ISR membership is dynamic (replica.lag.time.max.ms); we simplify to "healthy or not." In Kafka 4.0+, mention ELR (KIP-966) as the next refinement on top of ISR — safer leader election because every elected member is guaranteed to have all committed data.

---

## 8. Acks setting (0 / 1 / all) (Lesson 14 — Kafka)

**Where it shows up**: Lesson 14's Queue property panel surfaces `acks`. `acks='all'` engages two sim behaviors: (1) **latency cost** — the Queue's effective p99 adds `(RF-1) × 5ms` of follower-fetch hops (grounded in network physics — extra hops = extra wait); (2) **min.insync.replicas enforcement** — writes block when healthy replicas fall below threshold. `acks=0` and `acks=1` skip both.

**What we say**: Producers can ack on 0, 1, or all replicas. The canonical (RF=3, acks=all, min.insync.replicas=2) is what you'd argue for in an interview — durable + most-of-the-time available.

**What's actually going on in production**: `acks=0` means fire-and-forget — lowest latency, no failure notification. `acks=1` means leader ack'd — durable through one broker, lost if leader crashes pre-replication. `acks=all` means every ISR member ack'd — strongest single-cluster durability, paired with `min.insync.replicas`. Throughput cost: `all` is 2-3× slower than `1` in many benchmarks. Most production systems run `acks=all` with `min.insync.replicas=2` (of RF=3) so writes survive single-replica outage.

**What we model vs. don't model**:
- ✓ Latency penalty for acks=all (RF-1 follower fetch hops, ~5ms each)
- ✓ min.insync.replicas threshold enforcement under acks=all
- ✗ Throughput penalty per se (we model latency, not throughput cap reduction)
- ✗ Idempotent producer mode (PID + sequence numbers) — separate config layer

**What a student should know**: `acks=all` + `min.insync.replicas=2` + `RF=3` is the canonical "durable Kafka" config. Know that `acks=1` is what dropped messages in famous outages (LinkedIn 2014; multiple Uber post-mortems). `acks=0` exists for logs/metrics where loss tolerance is high. Flip the acks setting in the property panel and watch p99 latency move — that's the same tradeoff you'd argue about at the whiteboard.

---

## 9. Multi-consumer-group modeling — sim is simplified pub/sub (Lesson 14 — Kafka)

**Where it shows up**: Lesson 14's canvas models two consumer groups (real-time + analytics) reading the same partitioned topic. Each partition Queue is flagged `pubsub: true`, switching the simulator from RabbitMQ-style work-queue semantics (Lesson 8 default — output divided across downstream edges) to Kafka-style pub/sub semantics (every downstream out-edge sees the full event stream).

**What we say**: Two consumer groups read the same 6 partitions independently; each sees 60k events/sec aggregate; offsets are tracked per group.

**What's actually going on in production**: Real Kafka deployments routinely have 5-15 consumer groups per topic, each at its own consumption rate, each with its own offset state in the internal `__consumer_offsets` topic. The defining Kafka-vs-RabbitMQ property: same data, many independent downstream pipelines (real-time alerts + batch ETL + fraud detection + audit logging) without coordinating between them. Lag is measured per (group, partition). Rebalancing (consumer join/leave) happens within a group; it doesn't touch other groups.

**Why we abstract**: Our sim supports the pub/sub pattern via the `pubsub: true` flag on Queue, but it's binary — every out-edge is treated as a separate consumer group. The simulator doesn't model offset state, lag, or rebalancing protocols (cooperative vs eager). It also assumes 1 worker per partition per group (the canonical mapping); real deployments allow N workers in a group where N ≤ partition count, with partition assignment handled by the group coordinator.

**Kafka 4.0+ context — what's new**:
- **KIP-848 (GA in Kafka 4.0)** — next-generation consumer rebalance protocol. Eliminates stop-the-world rebalances; uses incremental cooperative reassignment. Pre-848: every consumer join/leave paused the entire group. Post-848: only the affected partition's consumer pauses. Mention this if asked "what happens on consumer churn?"
- **KIP-932 (GA in Kafka 4.0) — Share Groups.** Cooperative consumption gives Kafka *queue-like* semantics: multiple consumers in a share group can pull from the same partition concurrently with at-least-once delivery. This blurs the historical Kafka-vs-RabbitMQ distinction. The senior 2026 answer is: "Kafka can do both consumer groups (pub/sub) AND share groups (queue/work) — pick based on whether ordering matters and whether you want one-message-one-consumer."

**What a student should know**: When asked "how would you add a new downstream system?" the answer is *add a new consumer group with its own offset state* — not modify the producer, not duplicate the topic. Each group's lag is monitored independently. The lesson canvas shows the topology; in a real interview, mention `group.id`, `__consumer_offsets`, and the rebalancing protocol (KIP-848 in 2026) as the next layer of detail. If the interviewer asks about Kafka-vs-RabbitMQ, the modern answer is "with share groups, Kafka covers both patterns."

---

## 10. Zero-copy and "5 reasons Kafka is fast" (Lesson 14 — Kafka)

**Where it shows up**: Lesson 14's lesson copy may invoke the famous "5 reasons Kafka is fast" mantra (sequential I/O, batching, compression, zero-copy, page cache).

**What we say**: Kafka is fast because of sequential disk writes, message batching, codec compression, zero-copy `sendfile`, and OS page cache.

**What's actually going on in production**: Sequential I/O, batching, compression, and page cache are real and load-bearing — measured wins. **Zero-copy is more nuanced**: the classic `sendfile(2)` path skips userspace by piping the file directly to the socket, but this is **disabled when TLS encryption is on** (the kernel can't encrypt without copying the bytes through userspace). Since most production Kafka clusters run with TLS, the zero-copy claim is *aspirational rather than load-bearing for those deployments*. Also: in cloud deployments with `network` as the bottleneck rather than `disk`, the zero-copy savings show up as CPU savings on the broker, not throughput gains.

**Why we abstract**: The "5 reasons" mantra is interview shorthand. Nuance lives in the deep dive.

**What a student should know**: Repeat the 5 reasons, but qualify zero-copy: *"it matters when TLS is off and disk is the bottleneck — which it usually isn't anymore."* This is the kind of nuance that distinguishes a senior answer from a memorized one.

---

## 11. Partition count is a one-way ratchet (Lesson 14 — Kafka)

**Where it shows up**: Lesson 14's canonical solution uses 6 partitions. The lesson treats partition count as a design-time decision.

**What we say**: Pick your partition count up front based on expected throughput.

**What's actually going on in production**: Kafka lets you *increase* partition count on a live topic, but this **breaks per-key ordering** (existing keys that hashed to partition 0 may now hash to partition 7) and rebalances all consumer groups. Operationally painful. You can never *decrease* partition count without recreating the topic. The rule of thumb: over-partition at the start (rough heuristic: target throughput per partition is ~10MB/s write or ~20MB/s read), since adding consumers is easy but adding partitions is not. Common production heuristic: 6 to 12 partitions per topic by default, scaling to hundreds for high-throughput topics.

**Why we abstract**: Our sim is steady-state; topic reconfiguration is an operational concern, not a throughput one.

**What a student should know**: When asked "how would you handle 10× growth?" the senior answer is *"we over-partitioned at the start"* (because adding partitions live is hazardous), or *"we'd add a new topic with more partitions and dual-write during migration."* Saying "just add partitions" reveals naive ops experience.

---

## 12. Tiered Storage (Lesson 14 — Kafka)

**Where it shows up**: Lesson 14's "Workers → Storage LB → DB cluster" is one valid sink architecture: pull events out of Kafka via a consumer group and write them to a downstream database/warehouse. Modern Kafka has a second option built in.

**What we say**: Stream processors consume from Kafka and write to durable storage downstream.

**What's actually going on in production (Kafka 3.9+ / 4.0+)**: **KIP-405 Tiered Storage** (GA in Kafka 3.9) lets a topic transparently offload old log segments to remote object storage (S3, HDFS, Azure Blob, GCS) while keeping recent data on broker-local disk. Configured per-topic via `remote.storage.enable=true`. The broker handles archival; consumers reading old offsets are transparently served from remote storage. This means: for analytics/audit workloads that read historical data, you may not need a separate "Workers → DB" pipeline at all — Kafka itself becomes the long-term store. Local disk holds hot data (recent N days); S3 holds cold data (months/years of retention).

**Why we abstract**: Tiered Storage is an *alternative* sink architecture, not an addition to ours. Modeling it would either (a) duplicate the existing sink-cluster pattern with different labels or (b) require a new "remote storage" primitive on the Queue. The Workers-to-DB pattern still represents a common real-world shape (Kafka → ETL workers → analytics warehouse), so the lesson teaches a valid architecture even if not the newest one.

**What a student should know**: In a 2026 interview, mention tiered storage when discussing retention. The senior answer to "how do you handle 30-day retention of trillions of events?" is *tiered storage with S3 backing*, not *write everything to a separate warehouse via consumer pipeline*. Real production deployments (AWS MSK, Aiven, Confluent Cloud) all support tiered storage now. The Workers-to-DB pattern still applies when you need *transformed* output (joins, aggregations, schema changes); tiered storage applies when you need *the raw log* retained cheaply.

---

## 13. Partition density (Lesson 14 — Kafka)

**Where it shows up**: Lesson 14's canonical has 6 partitions across 3 brokers — 2 partitions per broker. This is *vastly* lower than production density and was chosen for visual legibility on the whiteboard-scale canvas.

**What we say**: 6 partitions split across 3 brokers; each leader Queue + its 2 replicas live on different brokers in a balanced RF=3 layout.

**What's actually going on in production**:
- **Confluent's 2026 baseline recommendation**: 100-200 partitions per broker as the target, max 4000 per broker before controller overload becomes a risk.
- **LinkedIn 2024**: ~7 million partitions across ~4000 brokers = average ~1750 partitions per broker. Their largest single cluster has 140 brokers + 1 million replicas.
- **Cloudflare 2022**: 14 distinct Kafka clusters, ~330 nodes total, processing 1 trillion+ messages.
- Our 2-per-broker density is ~50-100× below production baseline.

**Why we abstract**: Drawing 100 partitions on a whiteboard is impossible; drawing 6 partitions on the canvas teaches the *pattern* (partition count = parallelism ceiling, distribute across brokers, RF=3 layout). Once a candidate understands the pattern, scaling the number is config.

**What a student should know**: When asked "how do you size partition count for X throughput?", the answer is workload-shaped: target per-partition throughput is ~10MB/s write or ~20MB/s read (rough Confluent rule). For 1GB/s write, you'd need ~100 partitions just to keep partition leaders unsaturated. Cluster-wide max is bounded by broker count (Confluent: 4000 partitions/broker). KRaft (Kafka 4.0) supports significantly higher per-broker partition counts than Zookeeper-based clusters did. *Always over-partition at topic creation* — adding partitions live breaks per-key ordering (see entry #11).

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
