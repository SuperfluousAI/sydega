# Proposal: Search at Scale (L19.2)

**Companion to `search-at-scale.md`** (research).

**Goal:** Extend the L19 e-commerce canvas with a search pipeline. The student starts with L19's full canonical solution pre-populated; their job is to add the **two-layer search architecture** — a query path (Search Service → cache → sharded search index) AND an async indexing pipeline (Catalog item-update events → CDC Queue → Indexing Workers → Search Index).

**Pedagogical headline:** Search is its own layer beside the auth store, not on top of it. Updates flow async via CDC + Kafka. Queries hit a separate read-optimized index. **The architecture has two independent paths — write path stays fast because indexing is async; query path scales independently because the search index is sharded and replicated.**

## Where it slots

`order: 19.2`. Same numbering pattern as L19.1 (flash-sale). Pre-populates L19's full canvas via `initialNodes()` + `initialEdges()`.

## What's new for this lesson

**New role: `database:searchIndex`.** Following the existing role pattern on `database` (metadata + blob from L18 → metadata + blob + searchIndex). Pedagogically distinct (different label, color, defaults). Sim behavior identical (sink with capacity).

Per the `feedback_extend_primitives` rule, this is the right extension — clear visual + pedagogical value, low code cost.

**Proposed defaults for `database:searchIndex`:**
- Label: "Search Index"
- Color: `#f59e0b` (amber — distinct from metadata's red `#ef4444` and blob's purple `#8b5cf6`)
- capacity: 10,000 (read-heavy, much higher than metadata)
- latency: 5ms / p99Latency: 30ms (fast — in-memory inverted index lookup)

## Canonical solution shape

Pre-populated: full L19 canvas (21 nodes + 19 edges).

NEW for L19.2 (unwired in initialNodes, wired in solution()):

```
                     Search Clients (2,000 r/s, R: 1.0 — pure reads)
                              │
                              ▼
                     ┌────────────────────┐
                     │ Search Service     │ appServer cap 3000
                     │ (coordinator)      │
                     └──────────┬─────────┘
                                ▼
                     ┌────────────────────┐
                     │ Search Cache       │ internal cap 5000, hit 0.7
                     └──────────┬─────────┘
                                ▼ 600 r/s miss
                     ┌────────────────────┐
                     │ Search Index LB    │ cap 5000
                     └──────┬───────┬─────┘
                            ▼       ▼       ▼
                    ┌──────────┬──────────┬──────────┐
                    │ Search   │ Search   │ Search   │  database:searchIndex
                    │ Idx 0    │ Idx 1    │ Idx 2    │  cap 5000 each (3 shards)
                    └──────────┴──────────┴──────────┘
                            ▲       ▲       ▲     ← writes from indexing pipeline
                            └───────┴───────┘
                                    │
                            ┌──────────────┐
                            │ Indexing     │ × 2 workers, cap 100 each
                            │ Workers      │ consumerGroup: 'search-indexer'
                            └──────┬───────┘
                                   ▲
                            ┌──────────────┐
                            │ Indexing     │ queue, pubsub: false (work queue)
                            │ Queue        │
                            └──────┬───────┘
                                   ▲
                            ┌──────────────┐
                            │ Item Updates │ client, 50 events/sec
                            │ (CDC stream) │ (represents Catalog DB changes)
                            └──────────────┘
```

## Workload math (verified)

### Sync (query path)

- 2,000 r/s → Search Service (cap 3000) → Search Cache hit 0.7 absorbs 1,400; 600 miss
- 600 → Search Index LB (cap 5000) → 200/shard (cap 5000 each ✓)
- All sync served at search index level

### Async (indexing pipeline)

- Item Updates: 50 events/sec → Indexing Queue (no cap; pubsub: false work queue, single consumer group)
- 2 Indexing Workers (each cap 100, group `search-indexer`) split the load → 25 events/worker
- Workers write to Search Index LB → 17/shard write rate (well under 5000 cap)
- 50 events/sec async served

### Combined (with L19's existing traffic)

- L19 sync: 11,100 r/s served (unchanged — pre-populated)
- L19.2 sync: 2,000 r/s search served
- Total sync: 13,100 / 13,100 = 100% (passes 99%)
- L19 async (saga): 300 jobs/sec served
- L19.2 async (indexing): 50 events/sec served
- Total async: 350 served / 350 attempted = 100%

## Requirements (5)

1. **`syncSuccess`** — `r.successRate >= 0.99`
   - lesson: Search (2k r/s) + L19's existing 11.1k r/s = 13.1k sync ops. Drop the Search Cache (search index melts under 2k r/s × per-shard caps), the Search Index LB (single shard hot), or skip the search path entirely (search clients drop to 0% served) — success rate falls.

2. **`asyncSuccess`** — `r.backgroundSuccessRate >= 0.99`
   - lesson: Indexing pipeline (50 events/sec) + L19's saga (300 events/sec) = 350 background ops. If the Indexing Workers can't drain (under-capacity, missing, or pointed at the wrong queue), search index falls behind and `backgroundSuccessRate` drops.

3. **`hasSearchIndex`** — presence: `database role:searchIndex min: 1`
   - lesson: A search index is architecturally distinct from a relational metadata DB. Real systems use ElasticSearch / OpenSearch / Solr; we model it as a database with role: 'searchIndex' so the canvas reads as a proper two-layer architecture. Make at least one.

4. **`hasSearchIndexCluster`** — presence: `database role:searchIndex min: 3`
   - lesson: A single search index is a SPOF. Real ES clusters shard across N nodes for parallel query + replication. 3 shards behind a load balancer mirrors the production pattern (and survives a single-shard failure).

5. **`hasIndexingPipeline`** — presence: `queue min: 2`
   - lesson: The indexing pipeline is async — items flow Catalog DB → Indexing Queue → Indexing Workers → Search Index. L19's Order Queue already covers one queue; L19.2 adds an Indexing Queue. With both present, you have the canonical two-pipeline e-commerce backend (orders + indexing).

(Optional 6th: `hasSearchCache` — presence cache:internal ≥ 2 — forces the query cache pattern. L19's catalog cache + the new search cache = 2. Could include for completeness.)

## Background paragraphs (lesson copy outline)

1. **The two-layer search architecture.** Search is not the same as catalog browsing — it has its own pipeline. The auth store (Catalog DB) is the source of truth; the Search Index is a read-optimized derivative. Updates flow async via CDC. Queries hit a separate read path that scales independently from the write path.

2. **Why async indexing.** Indexing is expensive (Lucene segments, segment merges, replica syncs). Synchronous indexing on the write path would slow every catalog write 10-100x. The async pipeline lets the source DB commit fast; indexing catches up in seconds. Real ES indexing lag is typically 1-5 seconds — designed for it.

3. **Why `database:searchIndex` as a distinct role.** Visually + conceptually distinct from `database:metadata` in every senior-level diagram. Different access patterns (full-text vs key-value), different scale profile (10-50× read capacity), different consistency model (eventually consistent with the source). Same sim semantics as other DB roles; pedagogy is the win.

4. **Sharding + replication.** A single search index is a SPOF and a throughput bottleneck. Real ES shards data across N nodes for parallel query (each shard answers its portion in parallel) AND replicates each shard Y ways for availability + throughput. 3 shards behind a load balancer is the minimum viable cluster.

5. **What this lesson does NOT model.** Ranking / relevance (TF-IDF, BM25, learning-to-rank, personalization), autocomplete, spell correction, synonym expansion, index rebuild pipelines, geo-distributed indexes. All in simplifications.md — senior talk-track only.

6. **Soft caveat — eventual consistency.** "I just updated the product price and it doesn't show in search yet" is normal for real systems. The lag is the cost of an async indexing pipeline. Mention in an interview as a known trade-off.

7. **Where to dig further.** Research in `puzzle-research/search-at-scale.md` (HelloInterview ES deep dive, FB Post Search problem breakdown, DoorDash + Confluent production patterns).

## Components used

```js
allowedComponents: [
  'client',
  'loadBalancer',
  { type: 'cache', role: 'cdn' },
  { type: 'cache', role: 'internal' },
  { type: 'service', role: 'appServer' },
  { type: 'service', role: 'worker' },
  'queue',
  { type: 'database', role: 'metadata' },
  { type: 'database', role: 'searchIndex' },  // NEW role
]
```

One new role registration. No new top-level component type.

## Files to add / touch

| File | Change |
|---|---|
| `src/lib/componentTypes.js` | Add `searchIndex` role under `database` (label, color, defaults). |
| `src/lib/componentInfo.js` | Add `database:searchIndex` info entry. |
| `src/lib/puzzles.js` | Add `searchAtScale` puzzle (order 19.2). Add to puzzleOrder. |
| `puzzle-research/search-at-scale.md` | Done. |
| `puzzle-research/search-at-scale-proposal.md` | This file. |
| (`simplifications.md`) | Optional — append entries for ranking, autocomplete, reindex pipelines. |
| (`caveats.md`) | Optional — note on eventually-consistent search semantics. |
| `journal.md` | Lesson 19.2 entry. |

## Risks / unknowns

1. **Search Index `database:searchIndex` role needs framework auto-tests.** When the database role is extended, the puzzles.test.js auto-coverage should pick it up automatically (same pattern as metadata/blob). Verify after building.
2. **`consumerGroupCount` interaction.** L19 has 3 consumer groups (inventory/payment/notification). L19.2 adds 'search-indexer' = 4. If we ever want a requirement on consumer-group count specific to L19.2, predicate would be `>= 4`. (Not strictly needed for the requirements above.)
3. **Layout y-coordinates.** L19 fills y=20 to y=840. L19.1's flash lane at y=1020. L19.2's search lane should sit further down (~y=1240+). Need to verify the canvas fitView handles this height OK.
4. **The "Item Updates" synthetic client.** Real architecture has CDC reading from Catalog DB. We model the change-event source as a synthetic client (same pattern as L18's `sync-trigger` representing Blob Storage events). Acknowledge in lesson copy.
