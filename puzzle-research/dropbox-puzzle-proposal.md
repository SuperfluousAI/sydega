# Proposal: File Storage at Scale (Design Dropbox) puzzle

**Companion to `dropbox.md`** — that's the research; this is the build proposal.

**Goal:** A puzzle that — when a student passes it — demonstrably answers HelloInterview's 4 deep-dive questions on Dropbox/Google Drive, with the headline pedagogical mechanic being **3-tier workload separation (metadata reads dominate; uploads/downloads bypass backend via presigned URLs; sync fans out via WebSocket-or-poll)**. Layer-1 (architecture) on the canvas; layer-2 (internals) in lesson copy + property panel + simplifications.md.

## Where it slots

New **Lesson 18** (after `streamProcessingAtScale` at 17). This is the third FAANG-grade capstone (Twitter at L15, TinyURL at L16, Kafka at L17, Dropbox at L18). Difficulty progression: Twitter (Hello Interview "medium-high") → TinyURL ("medium") → Kafka ("very hard") → Dropbox ("very hard / storage-focused").

## The three workloads that frame the puzzle

This is what distinguishes Dropbox pedagogically. Three distinct request streams flow through the same backend:

1. **Metadata operations** (10,000 ops/sec at whiteboard scale) — browse, search, list, share, permission checks. *This dominates load* — HelloInterview is explicit about it. Routes: Client → Gateway → Metadata Service → Metadata DB cluster (with internal cache).
2. **Uploads** (100 chunks/sec) — small relative to metadata, but each chunk is 4MB so bandwidth is significant. Routes: Client → Gateway (auth + presigned URL request) → returns S3 URL → **Client uploads directly to Blob Storage, bypassing backend**. Backend learns about it via S3 event → Worker → updates Metadata DB.
3. **Downloads** (5,000 chunks/sec) — clients pulling files. Routes through CDN: Client → CDN → cache hits served at edge; misses fall through to Blob Storage. Presigned CDN URLs for access control.
4. **Sync notifications** (1,000 events/sec; bonus stream) — chunk-landed events fan out to all of a user's other connected devices via WebSocket. Routes: Blob Storage event → Notification Queue (pubsub) → connected Clients (one consumer-group per device).

The first three are sync flows the simulator can model directly; the fourth uses the **`pubsub: true` Queue mechanic from Lesson 17 (Kafka)** to represent fan-out to connected devices.

## Canonical solution shape

```
                   Metadata Clients (10k ops/sec, readRatio 0.95)
                              │
                              ▼
                   ┌────────────────────────┐
                   │ Rate Limiter           │
                   │ + Load Balancer        │
                   └────────────┬───────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
       ┌──────────────┐   ┌──────────────┐ ┌──────────────┐
       │ Metadata Svc │   │ Upload Svc   │ │ Sync Svc     │
       │ (AppServer)  │   │ (AppServer)  │ │ (AppServer)  │
       │ cap 10k      │   │ cap 200      │ │ cap 2k       │
       └──────┬───────┘   └──────┬───────┘ └──────┬───────┘
              │                  │                │
              ▼ R                ▼ W              ▼
      ┌─────────────┐     ┌──────────────┐  ┌────────────────┐
      │ Metadata    │     │ Blob Storage │  │ Sync Queue     │
      │ Cache       │     │ LB           │  │ (pubsub: true) │
      │ (internal)  │     └──────┬───────┘  └────────┬───────┘
      │ hit 0.85    │            │                   │
      └──────┬──────┘            ▼                   ▼ × N devices
             │ R           ┌──────────┐        ┌─────────────┐
             ▼             │ Blob DBs │        │ Device Workers│
      ┌────────────┐       │ (×3)     │        │ (×3 groups)  │
      │ Metadata   │       └──────────┘        └─────────────┘
      │ DB LB      │             ▲
      └─────┬──────┘             │
            │                    │ presigned URL bypass
            ▼                    │ (Client uploads here directly)
     ┌──────────────┐            │
     │ Metadata DBs │     Upload Clients (100 chunks/sec)
     │ (×3 sharded) │
     └──────────────┘
                                      Download Clients (5000 chunks/sec)
                                                │
                                                ▼
                                          ┌────────┐
                                          │  CDN   │ hit 0.9
                                          └───┬────┘
                                              │ misses (500/s)
                                              ▼
                                       (same Blob LB → Blob DBs)
```

Approximate node count: **~25-30 nodes + several regions**.

## Pedagogical mechanics (the load-bearing teaching moves)

### 1. Three separate request streams, three separate clients

Three Client sources represent three distinct workloads:
- `metadata-clients` (10k req/s, mostly reads — browse + search)
- `upload-clients` (100 chunks/sec — write-heavy, low rate, high bandwidth)
- `download-clients` (5k chunks/sec — read-only, served from CDN)

Pedagogy: "Different workloads have different bottlenecks. Metadata layer needs to scale for read rate; blob storage needs bandwidth, not ops; sync needs broadcast fan-out."

### 2. Presigned-URL bypass (Upload Clients → Blob Storage direct)

The Upload Client wires DIRECTLY to the Blob Storage LB, bypassing the backend. The Upload Service still gets a parallel low-rate edge (for metadata coordination — "the upload finished, here's the manifest"). Pedagogy: "Backend bandwidth would melt if every byte went through it; presigned URLs make backend size-of-ops, not size-of-data."

To model this, we need an edge from Client to Blob Storage. This works because both have the right hasInput/hasOutput shape. *No new primitive needed.*

### 3. CDN fronting downloads

Download Clients hit CDN (cache:cdn). 90% hit rate (CDNs are excellent for blob workloads). 500/sec falls through to Blob Storage. Same Blob LB as uploads — single sink layer.

### 4. Sync fan-out via pubsub Queue

A Sync Queue with `pubsub: true` (Lesson 17 mechanic). Blob Storage's "upload landed" events feed in; multiple device-Worker groups (representing connected devices) consume each event independently. Same Kafka-style multi-consumer-group pattern, repurposed.

### 5. Sharded metadata layer

Metadata Service → Metadata Cache (internal) → Metadata DB LB → 3 sharded Metadata DBs. Reuses Lesson 9/10 patterns (DB cluster + read cache).

## Foundational changes — three new optional ideas

R1 considers adding new primitives. Recommendations:

### A. NEW component type: `blobStorage` (NOT recommended)

We *could* add a dedicated `blobStorage` type for visual distinction from `database`. It would have identical sim semantics (sink, accepts reads + writes, capacity-bound). Differs only in color + label + componentInfo content.

**Recommendation: skip.** Per [[feedback-prefer-unified-taxonomy]], unify when structurally similar. blobStorage has identical sim semantics to database. Use `database` with config label `kind: 'blob'` or just configure capacity + latency appropriately. Saves a new component type.

### B. Property panel teaching props on Database: `chunkSize`, `dedupEnabled`

Could surface `chunkSize: 4` (MB) and `dedupEnabled: true` on Database components configured as blob stores. Teaching aids only — sim ignores them. Same pattern as Lesson 17's `replicationFactor` + `acks` on Queue.

**Recommendation: skip for v1.** Adds noise without changing the sim. The teaching can happen entirely in lesson copy and property panel description.

### C. NEW edge kind: `presigned` (NOT recommended)

A new edge variant for "this is a presigned-URL upload, bypassing the backend." Visually distinct from R/W edges.

**Recommendation: skip.** The architectural truth is just "Client → Blob Storage" — a direct edge. The presigned-URL mechanism is implementation detail that lives in lesson copy. The student wiring Upload-Client → Blob-LB makes the visual right.

## Requirements (proposed)

7-8 requirements:

1. **`syncSuccess` ≥ 99%** — across all three workloads aggregate, all reach their sinks.
2. **`hasGateway`** — at least 1 LoadBalancer (gateway) AND optionally 1 RateLimiter.
3. **`hasMetadataDB`** — at least 1 Database (probably explicitly: min 3 to enforce the cluster pattern; OR min 1 with the canonical using 3).
4. **`hasBlobStorage`** — at least 1 Database downstream of uploads (the blob layer). Hard to distinguish from metadata DB via predicates — *open question, see Decisions below*.
5. **`hasCdn`** — at least 1 Cache with `role: 'cdn'`.
6. **`hasSyncQueue`** — at least 1 Queue with `pubsub: true` for the sync fan-out path. (Reuses Lesson 17's `pubsub` flag.)
7. **`hasMetadataCache`** — at least 1 Cache with `role: 'internal'` (for metadata reads). Real Dropbox: heavy Redis use for metadata cache.
8. **`backgroundSuccess` ≥ 99%** — sync queue drains to connected device workers.

The **distinguishing-metadata-from-blob-DB problem** is the main open design question:
- Option A: Two `kind`-tagged Database configs (`kind: 'metadata'` vs `kind: 'blob'`) + a presence predicate that counts distinct kinds. New `kind` config field; new predicate.
- Option B: Just two presence predicates, both check `database min ≥ N`. Player can satisfy with any topology; pedagogy weaker.
- Option C: Position-based predicates (e.g. "X is downstream of cache" / "X is downstream of upload service"). Complex.
- Option D: Use `consumerGroup`-style tagging — add a `dbRole: 'metadata' | 'blob'` config on Database.

**Recommendation: Option D.** Cheapest extension; consistent with Worker's `consumerGroup` pattern from Lesson 14.

## simplifications.md additions

Five new entries proposed:

1. **Chunking + content-defined chunking** — sim doesn't model byte-level chunks. Lesson copy explains 4MB chunks + CDC.
2. **Deduplication** — hash-based content addressing. Saves significant storage at scale; not modeled (per-event abstraction).
3. **Presigned URLs** — modeled implicitly by direct Client→Blob edges. Lesson copy explains the bandwidth-bypass mechanism + 5-minute TTL.
4. **WebSocket + polling hybrid for sync** — sim models broadcast via pubsub Queue + multiple consumer groups; doesn't model the WebSocket protocol or the polling fallback.
5. **Conflict resolution** — last-write-wins or "conflicted copy" file creation. Not modeled (per-event state machine).

Could also add a 6th: **Magic Pocket** — Dropbox's custom blob storage (exabyte scale, SMR drives, immutable, 12-9s durability). Production reality, not interview architecture.

## simplifications.md replication-with-Lesson-14 considerations

Lesson 14 (Kafka) and Lesson 18 (Dropbox) both use:
- `pubsub: true` on Queue (fan-out)
- A "consumer-group-per-device" pattern (devices for Dropbox sync = consumer groups for Kafka)
- Internal cache absorbing reads at high hit rate
- DB cluster pattern (LB → N sharded DBs)

This is a *good* outcome: the puzzle reinforces patterns the student already learned in earlier lessons. The Kafka pubsub mechanic was a foundational primitive; Dropbox is its reuse.

## Workload numbers (proposed)

Inspired by GeeksforGeeks' scale but downsized for whiteboard clarity (same approach as Lesson 14: 60k events vs LinkedIn's 13M/s):

| Workload | Rate | Notes |
|---|---|---|
| Metadata operations | 10,000 req/s | 95% read (browse + search dominate) |
| Uploads | 100 chunks/sec | Each chunk 4MB; backend size-of-ops not size-of-bytes |
| Downloads | 5,000 chunks/sec | 90% absorbed by CDN |
| Sync events | 1,000 events/sec | Fan out to ~3 device consumer groups |

## What approval looks like

If you approve this proposal:

1. **Build time: ~1-2 sessions** (similar to Lesson 14). Implementation involves ~30 nodes + 5-6 regions + 7-8 requirements.
2. **Components needed:**
   - Reuse: client, loadBalancer, rateLimiter, service (appServer), service (worker), cache (internal + cdn), database, queue, kafkaController-style decorative for the "Magic Pocket" label
   - **One new optional decorative type**: maybe `apiGateway` or `webSocketBroker` if the visual story needs it. *Open question; can skip.*
3. **New config field on Database**: `dbRole` ('metadata' / 'blob') — like Worker's `consumerGroup`.
4. **Tests:** canonical-passing + 5-6 failure-mode tests (no CDN melts downloads; no metadata cache melts metadata DB; backend gets the upload bytes instead of presigned-URL bypass; sync queue without pubsub fails fan-out; missing metadata cluster overloads single DB; missing sync fan-out fails async).
5. **simplifications.md**: 5-6 new entries.
6. **journal entry**: Part 21.
7. **Tag pt21** after build.

## Decisions to confirm before build

1. **Order slot: L18** (after Kafka L17). Confirm?
2. **Workload set as listed above** (10k metadata + 100 uploads + 5k downloads + 1k sync). Confirm or adjust?
3. **`dbRole` on Database** (option D for distinguishing metadata vs blob). Confirm?
4. **`pubsub: true` Queue reused** from Lesson 14 for sync fan-out. Confirm?
5. **Skip the new `blobStorage` component type** (use `database` with `dbRole: 'blob'` label). Confirm?
6. **Skip the new `presigned` edge kind** (model as direct Client→Blob edge). Confirm?
7. **5-6 simplifications.md entries** for chunking, dedup, presigned URLs, sync hybrid, conflict resolution, optional Magic Pocket name-drop. Confirm count or adjust?

## Provenance

8 parseable sources backing this proposal:
- Hello Interview Dropbox deep dive (canonical interview answer)
- GeeksforGeeks Design Dropbox (scale numbers, component breakdown)
- Dropbox engineering blog × 4 (production reality, Magic Pocket, storage efficiency)
- Western Digital case study (SMR hardware)
- Built In retrospective (off-AWS arc)

Same source-tier mix as Lesson 14's R3: authoritative-first-party (Dropbox themselves) + canonical-interview-prep (HelloInterview) + independent third-party context. Good triangulation across architecture intent, production reality, and interview expectation.
