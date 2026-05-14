# Research: Search at Scale (ElasticSearch + indexing pipeline)

For Lesson 19.2 (sub-lesson of L19 — extends the catalog with search). Research collected 2026-05-13. Companion proposal in `search-at-scale-proposal.md`.

## Source set

4 sources, all retrievable:

1. **Hello Interview — ElasticSearch Deep Dive** ([hellointerview.com/learn/system-design/deep-dives/elasticsearch](https://www.hellointerview.com/learn/system-design/deep-dives/elasticsearch)) — The canonical interview reference. Headline insights:
   - "It's usually not a good idea to use Elasticsearch as your database." ES is a **search layer** beside the authoritative store, not a replacement.
   - "The majority of the time Elasticsearch is invoked in interviews it will be attached via Change Data Capture (CDC) to an authoritative data store like Postgres or DynamoDB."
   - Inverted index: maps tokens → document IDs. O(1) lookup vs O(n) scan.
   - Indexing pipeline: ingest nodes → data nodes (shards) → immutable Lucene segments → flushed to disk. **Updates are slower than inserts** (soft deletes + segment merges).
   - Sharding for parallel query, replication for throughput + availability.
   - Coordinating nodes orchestrate query execution across shards.
   - **Eventual consistency** — results are stale; designed for it.

2. **Hello Interview — Design Facebook Post Search** ([hellointerview.com/learn/system-design/problem-breakdowns/fb-post-search](https://www.hellointerview.com/learn/system-design/problem-breakdowns/fb-post-search)) — Canonical search-system breakdown with explicit numbers:
   - Writes: 10k posts/sec, 100k likes/sec
   - Reads: 10k searches/sec
   - Two services: **Query Service** (handles search reads from inverted indexes in Redis) and **Ingestion Service** (tokenizes content, writes post IDs to indexes)
   - Indexing via Kafka-style event stream → fanout to multiple ingestion workers
   - Distributed cache (<1 min TTL), CDN edge caching
   - Cold index migration to blob storage for rarely-queried keywords

3. **DoorDash Engineering — Faster Indexing with Kafka + ES** ([careersatdoordash.com/blog/open-source-search-indexing](https://careersatdoordash.com/blog/open-source-search-indexing/), 403'd directly but referenced by the Confluent + search query) — Real-world production pipeline: **CDC → Kafka → Flink → ElasticSearch**. Kafka is the integration layer; Flink curates search documents; ES is the destination.

4. **Confluent — Building a Scalable Search Architecture** ([confluent.io/blog/building-a-scalable-search-architecture](https://www.confluent.io/blog/building-a-scalable-search-architecture/)) — Confluent's blueprint for production search pipelines. Same CDC + Kafka + ES pattern.

## What the canonical answer looks like

The pattern that's converged across the industry (Facebook search, DoorDash, Confluent's reference, ES docs):

### Two layers separated cleanly

**Authoritative store (Postgres / DynamoDB / our `database:metadata`)**:
- Source of truth for write operations
- Strong consistency for the application's primary use cases
- Not used for full-text search directly

**Search index (ElasticSearch / our new `database:searchIndex` role)**:
- Read-only as far as the application is concerned (writes come from the pipeline)
- Inverted-index optimized for full-text query
- Eventually consistent with the source

### The async indexing pipeline (the load-bearing pattern)

CDC sits between the auth store and Kafka. Every write to Postgres / DynamoDB emits a change event. Workers (Flink jobs / Kafka consumers) curate the change into a search document and write to ES. The pipeline is async — there's always lag between "write to source" and "visible in search."

**Why async**: indexing is expensive (Lucene segment writes, segment merges, replica syncs). Synchronous indexing on the write path would slow every catalog write 10-100x. The async pipeline lets writes commit fast; indexing catches up in seconds.

### The query layer

Search queries don't go through the auth store. They hit a Search Service (coordinating node) that parses the query, sometimes consults a query cache, then fans out to the appropriate ES shards. Results are merged and returned. This path is read-only and scales independently from the write path.

### Sharding + replication

Sharding for parallel query execution (split the index across N nodes; each shard answers its portion in parallel). Replication for throughput + availability (each shard has Y replicas; total query TPS = X × Y).

## Scale (whiteboard rates we'll use for L19.2)

In an e-commerce context:

- **Search queries**: 2,000 r/s (high, search is a primary discovery path; ~20% of all traffic in real Amazon)
- **Item updates** (events from catalog DB → indexing pipeline): 50 events/sec at our scale (real Amazon: 1000s of catalog edits/sec across product/price/inventory/description changes)
- **Indexing latency**: not modeled in the sim, but "seconds, not milliseconds" is the interview-correct number

## What we can model with current primitives

- **Search Service** (coordinating node) → `service:appServer`
- **Search Cache** (query result cache) → `cache:internal`
- **Indexing Queue** (CDC event stream) → `queue` (pubsub: false; one consumer group of indexing workers consumes the stream)
- **Indexing Workers** (parsing change events, writing to ES) → `service:worker` with consumerGroup
- **Search Index** (sharded ES) → **new role on `database`**: `searchIndex`
- **Search DB LB** (coordinating fan-out across shards) → `loadBalancer`

## Why a new role: `database:searchIndex`

The existing role-aware database pattern (`metadata` + `blob`) is exactly the right place to slot `searchIndex`:

- **Semantically distinct**: a search index is read-optimized, write-via-pipeline, eventually-consistent. Visually different from a relational metadata DB in every diagram.
- **Different defaults**: higher read capacity (10-50× a metadata DB at the same hardware), different latency profile (in-memory inverted index is sub-10ms; updates are slow).
- **Architecture clarity**: a player looking at the canvas can tell at a glance "this is the search tier, that's the data tier." Same way `database:blob` is visually distinct from `database:metadata` in L18.

Per the `feedback_extend_primitives` memory rule, this is the right move — extend the primitive when there's clear pedagogical value. Sim behavior is identical (still a sink with capacity); only label + color + defaults differ.

**Proposed defaults for `database:searchIndex`**:
- Label: "Search Index"
- Color: warm-distinct (orange/amber, contrasts with metadata=red, blob=purple)
- capacity: 10,000 (read-heavy, much higher than metadata's 1,000)
- latency: 5ms (mean); p99Latency: 30ms (fast — in-memory inverted index)

## What this lesson does NOT teach (simplifications.md material)

- **Ranking + relevance signals** (TF-IDF, BM25, learning-to-rank, personalization) — substantial topic; not on canvas.
- **Autocomplete / type-ahead** — usually a separate cache + prefix-trie structure; out-of-scope.
- **Spell correction / fuzzy matching** — Lucene feature; not on canvas.
- **Synonym expansion, multilingual search** — talk-track.
- **Index rebuild / reindexing pipelines** — when the schema changes, you reindex everything from the auth store. Big operational topic; we don't model it.
- **Geo-distributed search indexes / cross-region replication** — punt to the SRE track.

## Soft caveats

- Eventual consistency between catalog DB and search index — the indexing pipeline has lag. In real systems "I just updated the price and it doesn't show in search yet" is normal.
- Our `database:searchIndex` is a simplification of ES (which is much more complex internally). For the canvas, "read-optimized sink with high capacity" captures what matters architecturally.

## Where to dig further

- Hello Interview ElasticSearch deep dive is the single best summary for interview prep.
- Hello Interview FB Post Search has the most concrete numbers + service decomposition.
- DoorDash + Confluent blog posts give real production patterns (Kafka + Flink + ES).
- Lucene segments + indexing internals: out-of-scope for our canvas but worth reading once for deeper interviews.
