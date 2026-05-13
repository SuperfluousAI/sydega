# Research: Kafka / Stream Processing — interview-grade puzzle

**Source page:** https://systemdesign.io/question/design-a-stream-processing-system-like-kafka
**Date:** 2026-05-12
**Difficulty marked on source page:** "Very Hard"

## The questions the source page wants candidates to answer

1. How might Kafka be designed?
2. What distinguishes Kafka from RabbitMQ?
3. How does Kafka achieve fast writes to the stream? What makes it fast?
4. How to scale it for Facebook-level data volume?
5. Implementation approaches for: Fault Tolerance, Partitioning, Load Balancing across Nodes

Open-ended compared to TinyURL — fewer concrete sub-questions, more architectural reasoning. Marked "Very Hard."

## Sources consulted (multi-source synthesis)

The four links on the systemdesign.io page surfaced limited content (one usable Medium article; the Kafka paper is a binary PDF; two are YouTube videos). On operator request, expanded the research with seven additional sources:

| # | Source | Status | Coverage focus |
|---|---|---|---|
| 1 | [Systemdesign.io's linked Kafka paper](https://notes.stephenholiday.com/Kafka.pdf) | PDF binary — unparseable | (intended: foundational) |
| 2 | [Better Programming overview](https://medium.com/better-programming/system-design-series-apache-kafka-from-10-000-feet-9c95af56f18d) | Parsed | Components, throughput, "why fast" basics |
| 3 | [Meta Engineer YouTube](https://www.youtube.com/watch?v=DU8o-OTeoCc) | Video — unparseable | — |
| 4 | [Visualization YouTube](https://www.youtube.com/watch?v=HZklgPkboro) | Video — unparseable | — |
| 5 | [Apache Kafka official intro](https://kafka.apache.org/intro) | Parsed | Canonical components, official definitions, per-key ordering |
| 6 | [Confluent: Kafka Replication](https://docs.confluent.io/kafka/design/replication.html) | Parsed | ISR mechanics, acks=0/1/all, leader election |
| 7 | [Confluent Developer: Data Replication](https://developer.confluent.io/courses/architecture/data-replication/) | Parsed | Pull-based replication protocol, high-watermark |
| 8 | [Medium / Anil Goyal deep dive](https://medium.com/@anil.goyal0057/kafka-topics-partitions-replication-isr-leader-election-acks-deep-dive-a744def1d413) | Parsed | Partition lifecycle, immutability rule |
| 9 | [Confluent: Kafka Design](https://docs.confluent.io/platform/6.2/kafka/design.html) | Parsed | Design goals, motivation, statelessness |
| 10 | [Confluent: Efficient Design](https://docs.confluent.io/kafka/design/efficient-design.html) | Parsed | Batching, compression codecs, sendfile |
| 11 | [ByteByteGo: Why Kafka is Fast](https://bytebytego.com/guides/why-is-kafka-fast/) | Parsed | Sequential I/O, zero-copy explanation |
| 12 | [2-Minute Streaming: Zero Copy in Kafka](https://blog.2minutestreaming.com/p/apache-kafka-zero-copy-operating-system-optimization) | Parsed | Zero-copy details + the TLS-disables-it caveat |

Total: 8 parseable sources, including Apache's own docs and Confluent's authoritative documentation. The Kafka paper itself remained unparseable (PDF binary), but its concepts are well-represented in Confluent's design pages (Confluent is run by the original Kafka authors).

## Synthesis — what the sources converge on

### Core components (Apache + Confluent are authoritative)

```
Producers ─► Broker Cluster (N brokers, controller-coordinated)
              │  Each broker hosts a subset of partitions across many topics
              │
              ▼
            Topic = partitioned, replicated commit log
            ├─ Partition 0: leader on Broker-1, followers on Broker-2, Broker-3
            ├─ Partition 1: leader on Broker-2, followers on Broker-3, Broker-1
            └─ Partition 2: leader on Broker-3, followers on Broker-1, Broker-2

Consumer Group ─┬─ Consumer A reads Partition 0
                ├─ Consumer B reads Partition 1
                └─ Consumer C reads Partition 2
                  (exactly one consumer per partition per group;
                   multiple consumer groups can read the same topic independently)
```

Apache Kafka's official definitions (quoted):

> *"Topics are partitioned, meaning a topic is spread over a number of 'buckets' located on different Kafka brokers."*
> *"Events with the same event key are written to the same partition, and Kafka guarantees that any consumer of a given topic-partition will always read that partition's events in exactly the same order as they were written."*
> *"events are not deleted after consumption. Instead, you define for how long Kafka should retain your events through a per-topic configuration setting."*

The dual "publish-subscribe + commit log" nature is the headline architectural insight. Kafka is **not** a queue; it's a log that's read by name+offset.

### Replication mechanics (Confluent authoritative)

The replication protocol is **pull-based** — followers actively fetch from leaders, the leader does not push. From Confluent's developer course:

> *"Whenever the leader appends new data into its local log, the followers will issue a fetch request to the leader, passing in the offset at which they need to begin fetching."*

Key concepts:

- **Replication Factor (RF)**: total replicas per partition, including the leader. Default for production: 3.
- **ISR (In-Sync Replicas)**: the subset of followers caught up within `replica.lag.time.max.ms`. The leader maintains this set dynamically.
- **High Watermark (HW)**: *"Once all of the followers in the ISR have fetched up to a particular offset, the records up to that offset are considered committed and are available for consumers."*
- **Acks setting** (producer side):
  - `acks=0`: Producer doesn't wait. Fastest, lowest durability.
  - `acks=1`: Wait until leader's log is written. Medium durability — data loss if leader crashes before replication.
  - `acks=all`: Wait until all ISRs have the message. Highest durability; combined with `min.insync.replicas`.
- **min.insync.replicas**: minimum ISR count required for `acks=all` to succeed. If fewer ISRs are alive, writes fail. Common: 2.
- **unclean.leader.election.enable**: a CAP-style availability vs consistency lever:
  - `false` (default): wait for an ISR-eligible follower to take over → durability preserved
  - `true`: any follower can take over → availability preserved, possible data loss

### Why Kafka is fast (Q3) — five reasons cross-validated across sources

Every parseable source converged on these:

1. **Sequential disk I/O.** Append-only writes to a log file. Modern disks (HDD + SSD) get near-RAM throughput on sequential I/O — orders of magnitude faster than random access.
2. **OS page cache (no in-process cache).** Confluent: *"Data is copied into the pagecache exactly once and reused on each consumption."* No application-layer cache; OS handles it.
3. **Zero-copy via `sendfile()`.** Data goes directly from page cache to NIC, bypassing user-space. From 2-Minute Streaming: 4 mode switches + 4 data copies (traditional path) → 2 mode switches + 2 DMA copies + 1 pointer copy (zero-copy path) = ~50% overhead reduction.
4. **Batching.** Producers batch writes; consumers batch reads. *"A batch size of 50 messages improved the throughput by almost an order of magnitude"* (Medium). The protocol is built around a "message set" abstraction.
5. **End-to-end compression.** Confluent: *"the batch of messages is written to disk in compressed form and remains compressed in the log."* Four codecs supported: **GZIP, Snappy, LZ4, ZStandard**. Compression persists through storage AND network — not just compressed in flight.

**Important caveat from 2-Minute Streaming** (the sharpest reading):

> *"Zero-copy has minimal practical impact in most Kafka deployments because network saturation, not CPU, is the bottleneck. Additionally, encryption and SSL/TLS prevent Kafka from using this optimization entirely."*

The "5 reasons Kafka is fast" mantra is *partially* outdated in modern deployments where TLS is mandatory and bottlenecks are elsewhere. Sequential I/O + batching + compression still matter; zero-copy's relevance is more nuanced.

### Partitioning specifics

From Apache + Anil Goyal's deep dive:

- Partition count is a **one-way ratchet**: increasing is OK, decreasing is not supported. Mis-sizing at the start = lasting operational pain.
- Replication Factor ≤ Number of Brokers (you can't replicate 3-ways with 2 brokers).
- For a 3-broker cluster with 3 partitions and RF=3: each broker hosts 1 leader + 2 follower replicas (perfectly balanced).
- Hash-based assignment: `partition_index = hash(key) % partition_count`. Same key → same partition → ordered for that key.

### Consumer group mechanics

- Within a consumer group, each partition is consumed by exactly one consumer.
- Consumer count > partition count = idle consumers. **Partition count is the parallelism ceiling.**
- Multiple consumer groups can read the same topic independently (each tracks its own offset). This is Kafka's defining feature vs RabbitMQ — same data, multiple downstream pipelines.
- Rebalancing happens on consumer join/leave; protocols: eager (older) vs cooperative (newer, less disruptive).

### Throughput numbers (cross-source)

- LinkedIn 2015 paper: ~13M messages/sec across the cluster.
- Modern production clusters: 1-10M msg/sec/cluster is typical.
- Per-broker sustainable: 50k-500k msg/sec depending on message size, RF, acks, compression.
- End-to-end latency: 5-25ms typical (producer → broker → consumer).

### Kafka vs RabbitMQ (Q2 from source) — converged answer

| Aspect | Kafka | RabbitMQ |
|---|---|---|
| Architectural model | Distributed commit log (pull-based) | Message broker (push-based, exchanges/queues) |
| Message lifetime | Configurable retention (default 7 days or size cap) — consumers can re-read | Deleted on consumer ack |
| Ordering | Per-partition only | Per-queue, FIFO within consumer |
| Throughput | Millions/sec | Tens of thousands/sec |
| Multiple downstream consumers | Multiple consumer groups, independent offsets, parallel pipelines | Each message goes to one consumer per queue |
| Coupling | Decoupled | More tightly coupled (exchanges + bindings) |
| Use case | Event sourcing, stream processing, log aggregation, analytics | Task queues, RPC, business workflows |

The pedagogical framing: Kafka is for **streams** (continuous data, multiple consumer groups, retention); RabbitMQ is for **tasks** (one consumer does the work; message goes away).

## Mapping to our existing components — UPDATED with richer research

| Kafka concept | Our component | Maps cleanly? |
|---|---|---|
| Producer | Client (source) | ✅ direct |
| Topic | Multiple Queues (one per partition) — there's no single "topic" primitive | ⚠️ logical-only |
| Partition | Queue | ✅ each Queue ≈ one partition |
| Partition router | LoadBalancer (hash-partitions writes across Queues) | ✅ — same shape as Lesson 6 DB cluster routing |
| Broker | (not modeled — partitions live on brokers, but we don't expose the machine layer) | ❌ |
| Replication Factor | (could be a cosmetic prop, not modeled mechanically) | ⚠️ teaching-only |
| Consumer | Service (role: worker) | ✅ direct |
| Consumer Group | Multiple Workers, one per partition Queue | ✅ — the canonical "consumer group" pattern |
| Multiple consumer groups | (sim divides edge flow, doesn't duplicate) | ❌ — best taught in lesson copy |
| ISR / leader election | (not modeled) | ❌ — lesson copy |
| Acks (0/1/all) | (could be a cosmetic prop on Queue) | ⚠️ teaching-only |
| Sequential I/O / zero-copy / batching | (implementation details, not architectural) | ❌ — lesson copy |
| Offset tracking / retention | (no time axis) | ❌ — lesson copy |
| Partition count immutability | (operational lesson) | ❌ — lesson copy |
| Compression codecs | (irrelevant for sim) | ❌ — lesson copy |

**The architectural core (partitioning, parallelism, consumer-group pattern) maps cleanly with no new components.** The implementation details (RF, ISR, acks, sequential I/O, zero-copy, compression, retention) are best taught in lesson copy with confluent-grade accuracy.

## What changed from the single-source research

The original research file leaned heavily on the Medium overview. The multi-source synthesis added:

1. **Pull-based replication** (Confluent dev course): followers fetch, leader doesn't push. We don't model this but it's a "Kafka vs RabbitMQ" differentiator worth mentioning.
2. **Acks tradeoffs are explicit** (Confluent replication docs): three levels with concrete durability semantics. Worth a teaching panel.
3. **Partition count immutability** (Anil Goyal): operational gotcha that's interview-relevant.
4. **`unclean.leader.election.enable`** (Confluent): a CAP-style consistency-vs-availability lever. Important for the fault-tolerance question (Q5).
5. **Zero-copy's nuance** (2-Minute Streaming): the "minimal impact when network-bound, disabled by TLS" caveat. We should *not* repeat the 5-reasons mantra uncritically.
6. **Compression persists** (Confluent efficient design): compression is at the producer; the batch stays compressed through storage AND consumer delivery. Network bandwidth savings >> CPU cost.
7. **Apache's own definitions** (apache.org/intro): canonical phrasing for events, ordering guarantees, retention.
8. **min.insync.replicas** (Confluent): combined with acks=all, controls write availability.
9. **High Watermark** concept (Confluent dev course): explains when consumers can see messages, not just when they're written.

## Key insight from the multi-source research

The Kafka question has **two distinct interview layers** the candidate must answer:

1. **Architecture layer** (the whiteboard): how to design a partitioned, replicated, fault-tolerant log. Components, topology, scaling math. **This maps cleanly to our existing primitives.**
2. **Internals layer** (the deep dive): why is Kafka fast, what's ISR, what's acks=all, what happens on unclean leader election. **This maps to lesson copy.**

Our puzzle should let students draw layer 1 on the canvas, with layer 2 surfaced via property panel props (acks setting, RF, min.insync) and lesson copy. The lesson copy is where Confluent-grade accuracy beats the simplified "5 reasons" version.

---

## Revision 3 amendment — 2026-05-13: Kafka 4.0+ era research

**Why this amendment exists:** Operator asked for a fresh audit using new and reliable sources after the puzzle was already at 10/10 visual coverage. The Kafka landscape changed materially in March 2025 with the 4.0 release. The puzzle's modeling is still correct, but several elements of the lesson copy and simplifications.md were anchored to pre-4.0 Kafka and needed updating.

### Additional parseable sources consulted

| # | Source | Status | Coverage focus |
|---|---|---|---|
| 13 | [Apache Kafka 4.0.0 Release Announcement (March 18, 2025)](https://kafka.apache.org/blog/2025/03/18/apache-kafka-4.0.0-release-announcement/) | Parsed | KRaft-only, KIP-848, KIP-932, KIP-966 |
| 14 | [Confluent Kafka Scaling Best Practices](https://www.confluent.io/learn/kafka-scaling-best-practices/) | Parsed | 2026 production config baselines |
| 15 | [LinkedIn Engineering — Running Kafka at Scale](https://engineering.linkedin.com/kafka/running-kafka-scale) | Parsed | LinkedIn cluster metrics |
| 16 | [LinkedIn — 7 trillion messages per day](https://www.linkedin.com/blog/engineering/open-source/apache-kafka-trillion-messages) | Parsed | LinkedIn 2024 cluster scale |
| 17 | [InfoQ — Tales of Kafka at Cloudflare: 1 Trillion Messages](https://www.infoq.com/articles/kafka-clusters-cloudflare/) | Parsed | Cloudflare's 14-cluster deployment |
| 18 | [Confluent: Kafka 4.0 Release Blog](https://www.confluent.io/blog/latest-apache-kafka-release/) | Parsed | Default KRaft, queues, rebalances |
| 19 | [KIP-405 Tiered Storage GA Release Notes](https://cwiki.apache.org/confluence/x/9xDOEg) | Parsed | Tiered storage production state |
| 20 | [KIP-926: acks=min.insync.replicas config](https://cwiki.apache.org/confluence/display/KAFKA/KIP-926:+introducing+acks=min.insync.replicas+config) | Parsed | New acks option |

Total parseable sources now: 16 (was 8 in R2).

### Key 2025-2026 changes that affect the lesson

**1. Kafka 4.0 (March 2025) removed Zookeeper entirely.** KRaft is the only supported mode. Production-only since 3.x; in 4.0 there's no migration path: you must already be on KRaft before upgrading. The puzzle's `kafkaController` decorative marker labeled "KRaft Controllers" is now strictly correct (it was ambiguous "or Zookeeper in older deployments" before). componentInfo updated 2026-05-13.

**2. KIP-848 — New Consumer Rebalance Protocol (GA in 4.0).** Eliminates stop-the-world rebalances. Consumers opt in via `group.protocol=consumer`. The old protocol stopped all consumers in a group on every join/leave; the new protocol uses incremental cooperative rebalancing. *Why it matters for the lesson:* if a candidate is asked "what happens when a consumer joins or leaves a group?", the 2026 answer references KIP-848. We don't model rebalancing on canvas — this is internals deep-dive copy.

**3. KIP-932 — Share Groups (GA in 4.0).** Cooperative consumption that gives Kafka queue-like semantics. Multiple consumers in a share group can pull from the same partition concurrently. *This blurs the historical Kafka-vs-RabbitMQ framing.* Pre-4.0: "Kafka is for streams (partitioned, ordered, replayable); RabbitMQ is for tasks (queued, ack-on-consume)." Post-4.0: "Kafka can do both — share groups let you treat a topic as a work queue." Our puzzle still teaches the consumer-group pub/sub story; share groups are a deep-dive note.

**4. KIP-966 — Eligible Leader Replicas (ELR), preview in 4.0.** A subset of the ISR guaranteed to have data up to the high watermark. Safer leader election: even within the ISR, only ELR members are "safe to elect" because they have all committed data. Pre-ELR: any ISR member could be elected and you might lose data committed during the leader's last batch. *Why it matters:* our Phase 3 leader promotion finds the "first healthy replica with matching replicaOf" — that's closer to "unclean leader election" semantics than ELR. We don't model the high watermark, so we can't model ELR precisely. caveats.md #9 mentions this.

**5. KIP-926 — `acks=min.insync.replicas` (new config option).** Producers can ask for "ack when min.insync.replicas have ack'd, not all of ISR." A middle-ground between `acks=1` and `acks=all`. Lower latency than acks=all without the data-loss risk of acks=1. Real production deployments are starting to use this for latency-sensitive write paths. We don't model this; the puzzle has acks=0/1/all only.

**6. Tiered Storage (KIP-405) GA in Kafka 3.9.** Topics can offload old log segments to remote storage (S3, HDFS). Brokers keep recent data on local disk; historical data lives in object storage. *Why it matters for the puzzle:* the "Workers → Storage LB → DB cluster" sink layer is one valid pattern, but in 2026 production, you might not need explicit Workers-to-DB pipeline because Kafka *itself* archives to S3. Our puzzle teaches the consumer-group-writes-to-sink pattern; tiered storage is an alternative architecture for retention/analytics.

### Real-world production numbers (concrete deltas from authoritative sources)

| Source | Number | Implication |
|---|---|---|
| LinkedIn 2024 | 7 trillion messages/day, 4000+ brokers, 7M partitions, 100+ clusters | Our 60k msgs/sec puzzle is ~5 orders of magnitude smaller — intentional for whiteboard scale |
| LinkedIn 2024 | 140 brokers max in their largest single cluster | Validates "cluster" being the unit of scale, not "broker count = solution" |
| LinkedIn 2024 | 4 cluster types (queuing, metrics, logs, tracking) | Real deployments tier by workload; we model one tier |
| Cloudflare 2022 | 1 trillion messages, 14 clusters, 330 nodes, 100 Gbps peak | Smaller than LinkedIn but still vastly larger than our model |
| Confluent recommends | 100-200 partitions per broker baseline; max 4000/broker | Our puzzle: 6 partitions / 3 brokers = 2 per broker. Way below baseline; teaching scale only |
| Confluent recommends | RF=3, min.insync.replicas=2, acks=all | Matches our canonical exactly ✓ |
| Confluent recommends | linger.ms = 5-20ms, lz4 or snappy compression | Producer-side tuning; not modeled |

### What didn't change (still authoritative)

- **Topology**: producers → partitioned topic → consumer groups → sinks. Unchanged since 2018.
- **RF=3 + acks=all + min.insync.replicas=2 as production default.** Still consensus from Confluent + 2-Minute Streaming + LinkedIn.
- **Partitioning as parallelism ceiling.** Still the foundational insight.
- **Multi-consumer-group as Kafka-vs-RabbitMQ differentiator.** Share groups (KIP-932) add an alternative but don't replace this.
- **Per-key ordering preserved within partition.** Apache's official definition.
- **Pull-based replication** (followers fetch from leader). Unchanged.

### Net effect on the puzzle

- **Code/sim changes needed: none.** The modeling is still architecturally accurate.
- **Lesson copy / docs to update:**
  - `componentInfo.kafkaController` — explicit Kafka 4.0/KRaft framing ✓ (done 2026-05-13)
  - `simplifications.md #7` — drop "or Zookeeper" mention, add ELR note
  - `simplifications.md #9` — add KIP-932 share groups + KIP-848 rebalancer mentions
  - **New** `simplifications.md` entry — Tiered Storage (KIP-405)
  - **New** `simplifications.md` entry — Partition density (puzzle 2/broker vs prod 100-200/broker)
  - `caveats.md #9` — add ELR + share groups + tiered storage to future-bite scenarios
  - Optional: lesson blurb could mention "Kafka 4.0+ context: KRaft, no Zookeeper" but this risks date-stamping the puzzle

