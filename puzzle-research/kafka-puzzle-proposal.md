# Proposal: Stream Processing at Scale (Design Kafka) puzzle

**Companion to `kafka.md`** — that's the research; this is the build proposal.

**Revision 2** — updated after multi-source research deepened the picture beyond the original single-source draft.

**Goal:** A puzzle that — when a student passes it — demonstrably answers the 5 questions on systemdesign.io's Kafka design page, with the headline pedagogical mechanic being **partitioning for linear scale**. Layer-1 (architecture) on the canvas; layer-2 (internals) in lesson copy + property panel props.

## Where it slots

New **Lesson 14** (after `tinyurlAtScale` at 13).

## Two-layer pedagogy (NEW framing from R2)

The multi-source research surfaced that Kafka interviews are really *two* layers stacked:

1. **Architecture layer** (whiteboard): partitions, brokers, consumer groups, topology. Students *draw* this.
2. **Internals layer** (deep dive): ISR, acks, sequential I/O, zero-copy, retention. Students *explain* this.

The puzzle should serve both. The canvas is layer 1; property panel props + lesson copy + simplifications.md are layer 2.

## Headline pedagogy (unchanged from R1)

The puzzle is centered on **partitioning** as *the* mechanic that makes high-throughput stream processing work:

1. Partition count = parallelism cap.
2. Key-based partitioning preserves per-key ordering.
3. A single Queue can't keep up with stream scale — split into N partitioned Queues.

## The dilemma it forces (unchanged from R1)

Numerically: **60,000 events/sec** is the producer rate. A single Queue + Worker pool from Lesson 8 can't keep up (Worker default cap = 50). The student has to recognize: scale via *partitioning*, not just adding workers downstream of one Queue.

## Canonical solution (unchanged from R1)

```
Producers (60k events/s)
        │
        ▼
   Partition Router (LoadBalancer)
        ├──► Partition 0 (Queue) ──► Consumer A (Worker, cap 10k) ──► Storage
        ├──► Partition 1 (Queue) ──► Consumer B (Worker, cap 10k) ──► Storage
        ├──► Partition 2 (Queue) ──► Consumer C (Worker, cap 10k) ──► Storage
        ├──► Partition 3 (Queue) ──► Consumer D (Worker, cap 10k) ──► Storage
        ├──► Partition 4 (Queue) ──► Consumer E (Worker, cap 10k) ──► Storage
        └──► Partition 5 (Queue) ──► Consumer F (Worker, cap 10k) ──► Storage
```

~18 nodes total. Storage = DB cluster (6 DBs at default cap 1000) — reuses Lesson 6 pattern on the analytics side.

## Foundational changes — REVISED in R2

Original (R1) proposal: just `replicationFactor` + rename `name` → `topic`.

Revised (R2) recommendation: **three** cosmetic/teaching props on Queue:

### 1. `topic` prop (renames existing `name`)

Default: `"events"`. Lets the student label each Queue (partition) with the topic it represents. Better than the generic "jobs" label.

### 2. `replicationFactor` prop

Default: `3` (industry standard per Confluent + Apache official docs). Doesn't affect sim. Lesson copy explains: each partition is replicated to RF brokers.

### 3. `acks` prop (NEW in R2 — from multi-source)

Enum: `'0'`, `'1'`, `'all'`. Default `'all'`. Doesn't affect sim. Lesson copy explains the durability-latency tradeoff. **This is in R2 because the multi-source research surfaced acks as one of the most important explicit knobs in real Kafka deployments and a top deep-dive question.**

The three props together let the property panel teach the **internals layer** without modeling it mechanically:

```
[Queue: events-topic-0]
  topic:             events
  replicationFactor: 3
  acks:              all
  capacity:          ∞
```

This is honest about what's a teaching aid vs what's modeled. A student reading the property panel learns the vocabulary; lesson copy explains the semantics.

### NOT added (and why)

- ❌ `minInsyncReplicas` — too implementation-detail; in lesson copy.
- ❌ `compressionCodec` — pure internals, no impact on canvas-level reasoning.
- ❌ "Broker" as a new component type — would be a foundational change without pedagogical payoff. Our existing primitives express the architecture cleanly.

## simplifications.md additions — REVISED

The multi-source research surfaced more entries that belong. **Six** new entries (up from R1's three):

1. **Replication Factor + ISR + Leader-Follower** — RF=3 shown on panel; we don't model leader election or ISR. *What a student should know:* the answer mentions ISR mechanics and leader election.
2. **Consumer offset tracking + retention** — sim is steady-state; consumers in real Kafka track their own offset and can re-read.
3. **Multiple consumer groups** — sim divides edge flow, doesn't duplicate it. We model the per-group case; multi-group is documented. *This is the defining Kafka-vs-RabbitMQ feature.*
4. **Acks setting (0/1/all)** — surfaced in the property panel as a label, not modeled. *What a student should know:* the durability-latency tradeoff and `min.insync.replicas` partner.
5. **The "5 reasons Kafka is fast" mantra needs nuance** — sequential I/O + batching + compression are real wins; zero-copy is *less impactful in modern deployments because TLS disables it and network is usually the bottleneck*. Per 2-Minute Streaming.
6. **Partition count immutability** — one-way ratchet; over-partition at the start. Operational gotcha worth knowing.

## Requirements (unchanged structure from R1, 5 total)

1. Sync success rate ≥ 99% (producer acks)
2. **Background success rate ≥ 99%** (consumers drain queue — this is the main metric for stream processing)
3. `hasPartitionedTopic` — at least 4 Queues
4. `hasConsumerGroup` — at least 4 Workers downstream of those Queues
5. `hasStorage` — at least one Database (or cluster) downstream of Workers

The original R1 proposal had 6 requirements (including a separate `hasPartitionRouter`). R2 simplifies: math forces an LB to fan writes — no explicit predicate needed.

## What hasn't changed since R1

- Workload (60k events/sec)
- Solution shape (~18 nodes, 6 partitions × 6 consumers × 6 storage DBs)
- The fundamental claim: no new component types needed
- The test surface (4-5 targeted failure tests + framework auto-tests)

## What HAS changed since R1

| Change | Source for change |
|---|---|
| Added `acks` prop to Queue | Confluent replication docs (acks is a top deep-dive question) |
| Added 3 more simplifications.md entries (multi-consumer-group, acks, zero-copy nuance, partition immutability) | Multi-source synthesis |
| Reframed pedagogy as "two layers": architecture on canvas, internals in props + lesson copy | New synthesis from richer research |
| Dropped explicit `hasPartitionRouter` predicate (math suffices) | Simplification — minor |

## Decisions for re-confirmation

Operator already approved R1's 5 decisions:
1. ✅ `replicationFactor` prop on Queue
2. ✅ Rename Queue's `name` → `topic`
3. ✅ Workload at 60k events/sec
4. ✅ Required Storage downstream
5. ✅ 4-predicate requirement set (now simplifies to 3-predicate + 2 metric in R2)

**R2 changes to confirm:**

- **Add `acks` prop** (enum 0/1/all) to Queue as a cosmetic teaching aid? Rec: yes — Confluent and Apache both treat this as a load-bearing producer config.
- **Drop the explicit `hasPartitionRouter` predicate** since the math forces it? Rec: yes — keeps the predicate count manageable.
- **6 simplifications.md entries instead of 3**? Rec: yes — multi-source research surfaced real items worth flagging.
- **Two-layer pedagogical framing in lesson blurb + copy**? Rec: yes — this is what makes the lesson feel "interview-grade" vs just "use the queue+worker pattern."

## What approval looks like (R2)

If you re-approve with the R2 deltas:
- Build is still ~one session (the new `acks` prop adds ~5 lines).
- Tests pass, journal Part 17 written, new git tag.
- Six simplifications.md entries added (versus three in R1).

If you want to revise further (e.g. drop the `acks` prop, model multi-consumer-group somehow), say so before we code.

## Provenance

R1 written from 1 parseable source (Better Programming Medium overview). R2 written after multi-source research:
- Apache Kafka's own intro
- Confluent's design + replication + efficient-design docs
- Confluent developer course on replication
- Two Medium deep dives
- ByteByteGo
- 2-Minute Streaming
- One YouTube transcript attempted (failed; videos remain unparseable)

The R2 proposal reflects 8 parseable sources instead of 1. The architecture didn't change — but the lesson copy depth, the property panel props, and the simplifications.md entries got much sharper.

## R3 amendment — 2026-05-13: Kafka 4.0 era audit

After the puzzle was already implemented at "10/10 visual coverage" (Parts 17-19), operator asked for a fresh audit using new and reliable sources. The Kafka landscape had changed materially with Kafka 4.0 (released March 18, 2025).

Eight additional parseable sources added (see `kafka.md` R3 amendment for the full list):
- Apache Kafka 4.0.0 Release Announcement (March 2025)
- Confluent Kafka Scaling Best Practices (2026)
- Confluent Kafka 4.0 release blog
- LinkedIn Engineering: Running Kafka at Scale + 7 trillion messages/day post
- InfoQ: Tales of Kafka at Cloudflare (1 trillion messages)
- KIP-405 Tiered Storage GA notes
- KIP-926 acks=min.insync.replicas config proposal

**16 parseable sources total** now backing the puzzle (was 8 in R2, 1 in R1).

### What R3 audited and what changed

**Code changes**: none. The puzzle's modeling is still architecturally accurate against the 2026 canonical answer.

**Doc changes** (all amendments, no rewrites):
- `componentInfo.kafkaController` — drops "or Zookeeper" ambiguity; explicitly Kafka 4.0/KRaft-only with KIP-966 ELR mentioned in realWorld copy.
- `simplifications.md #7` — adds ELR (KIP-966) note to the not-modeled list.
- `simplifications.md #9` — adds Kafka 4.0+ context block covering KIP-848 (new rebalance protocol GA) + KIP-932 (share groups GA, blurs Kafka-vs-RabbitMQ framing).
- `simplifications.md #12` — NEW: Tiered Storage (KIP-405 GA in Kafka 3.9).
- `simplifications.md #13` — NEW: Partition density (puzzle 2/broker vs production 100-200/broker; with concrete LinkedIn + Cloudflare + Confluent numbers).
- `caveats.md #9` — adds 3 new future-bite scenarios (ELR, share groups, tiered storage) with cost-to-fix estimates.

### What R3 confirmed about the puzzle (no change needed)

- **Topology**: producers → router → partitioned topic → consumer groups → sinks. Still the canonical 2026 shape.
- **RF=3, acks=all, min.insync.replicas=2**: still consensus across Confluent 2026 best practices + 2-Minute Streaming + LinkedIn.
- **Multi-consumer-group as Kafka differentiator**: still true, even though share groups (KIP-932) add an alternative consumption pattern.
- **Per-key ordering preserved per partition**: still Apache's official guarantee.
- **KRaft as the controller**: now strictly correct in Kafka 4.0 (was "KRaft or Zookeeper" pre-4.0).
- **The "5 reasons Kafka is fast" framing** with TLS-disables-zero-copy nuance: still authoritative per 2-Minute Streaming.

### What R3 decided NOT to add

- **New components on canvas** (e.g., a TieredStorage marker, an ELR marker): scope creep. The architecture works; these are 2026 refinements that belong in deep-dive copy, not whiteboard primitives.
- **A "Lesson 14b" with tiered storage**: deferred. Could be a future puzzle if there's pedagogical demand; not needed to make Lesson 14 accurate.
- **Stamping the lesson with "Kafka 4.0+" in the blurb**: would date-stamp the puzzle. The lesson teaches the canonical pattern, which is RF/acks/ISR-stable; we surface the 4.0 specifics in simplifications.md where they age gracefully.

### Provenance status

Sources by tier:
- **Apache + Confluent official**: 8 (Kafka 4.0 release, Confluent design + replication + efficient-design + scaling-best-practices + developer course, KIP-405, KIP-926, KIP-848 referenced)
- **Authoritative third-party**: 4 (LinkedIn Engineering ×2, InfoQ Cloudflare, ByteByteGo)
- **Independent deep dive**: 2 (2-Minute Streaming, Anil Goyal Medium)
- **Overview**: 2 (Better Programming Medium, Apache intro)

16 of 16 are now parseable. The R3 amendment closes the open-question gap from R2 (where the original Kafka paper was still locked behind a PDF binary). Modern sources cite the paper inline.
