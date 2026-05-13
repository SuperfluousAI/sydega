# Research: Dropbox / Google Drive — distributed file storage system

**Source page:** https://systemdesign.io/question/design-a-distributed-file-storage-system-like-dropbox (404 at time of writing; substituted with the HelloInterview deep-dive as the canonical reference)
**Date:** 2026-05-13
**Difficulty marked on source page (HelloInterview):** "High difficulty — common at Meta, Google, and storage-focused interviews"

## Sources consulted

| # | Source | Status | Coverage focus |
|---|---|---|---|
| 1 | [Hello Interview — Design a File Storage Service Like Dropbox](https://www.hellointerview.com/learn/system-design/problem-breakdowns/dropbox) | Parsed | Canonical whiteboard answer + 4 deep dives |
| 2 | [GeeksforGeeks — Design Dropbox System Design](https://www.geeksforgeeks.org/system-design/design-dropbox-a-system-design-interview-question/) | Parsed | Component breakdown, scale numbers |
| 3 | [Dropbox — Scaling to exabytes and beyond (Magic Pocket)](https://dropbox.tech/infrastructure/magic-pocket-infrastructure) | Parsed | Production scale, blob store architecture |
| 4 | [Dropbox — Inside the Magic Pocket](https://dropbox.tech/infrastructure/inside-the-magic-pocket) | Parsed (search summary) | Custom infra, durability targets |
| 5 | [Dropbox — Improving storage efficiency in Magic Pocket](https://dropbox.tech/infrastructure/improving-storage-efficiency-in-magic-pocket-our-immutable-blob-store) | Parsed (search summary) | 2024-2025 optimizations, immutable blob store |
| 6 | [Western Digital — Magic Pocket SMR HDDs case study](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/collateral/case-study/case-study-dropbox-magic-pocket-achieves-exabyte-scale-with-smr-hdds.pdf) | Cited via search | SMR hardware deployment |
| 7 | [Dropbox — First petabyte-scale SMR drive deployment](https://dropbox.tech/infrastructure/extending-magic-pocket-innovation-with-the-first-petabyte-scale-smr-drive-deployment) | Cited via search | Drive density progression |
| 8 | [Built In — How Dropbox Optimized Storage After Ditching AWS](https://builtin.com/hardware/dropbox-magic-pocket-distributed-storage-system) | Cited via search | The exodus-from-AWS arc |

8 parseable sources, including Dropbox's own engineering blog for production realities and HelloInterview for the canonical interview answer.

## The questions a candidate must answer

From HelloInterview's 4 primary deep dives:

1. **Large file handling.** How do you upload a 50GB file when the API gateway limits POST body to 10MB? (Answer: chunked multipart upload; client splits into 4-10MB chunks; resumable; retry per-chunk on failure.)
2. **Performance optimization.** How do you make uploads and downloads fast? (Answer: parallel chunk uploads, content-defined chunking [CDC] so small edits don't cascade, presigned URLs let clients upload directly to S3 bypassing backend bandwidth, compression chosen client-side based on file type.)
3. **File security.** How do you secure files end-to-end? (Answer: TLS in flight, S3 encryption at rest, presigned URLs with short expiry, ACLs in metadata DB.)
4. **Sync architecture.** How does a change on one device propagate to all the user's other devices? (Answer: WebSocket push for connected clients + periodic polling fallback for offline-then-online; conflict resolution typically last-write-wins or vector-clock per-chunk.)

Implicit additional questions across other sources:
- How do you dedupe storage so two users with the same file pay once? (Hash chunks, reference-count.)
- How does sharing work? (Separate SharedFiles table mapping userId → fileId.)
- What's the read/write ratio? (Metadata reads >> uploads/downloads — browse and search dominate.)

## Synthesis — what the sources converge on

### Canonical architecture (whiteboard)

```
                  ┌───────────────┐
                  │  Client / UI  │ ─── WebSocket ──┐
                  └──────┬────────┘                 │ (sync push)
                         │                          │
              chunk via local Watcher/Chunker/Indexer
                         │                          │
                         ▼                          │
                  ┌───────────────┐                 │
                  │ API Gateway / │                 │
                  │ Load Balancer │                 │
                  └──────┬────────┘                 │
                         │                          │
            ┌────────────┼─────────────┐            │
            ▼            ▼             ▼            │
       ┌────────┐   ┌─────────┐   ┌──────────┐      │
       │ Upload │   │Metadata │   │   Sync   │ ─────┘
       │Service │   │ Service │   │ Service  │
       └───┬────┘   └────┬────┘   └────┬─────┘
           │             │             │
   presigned-URL         │           ┌─┴──────────┐
           │             ▼           │ WebSocket  │
           │     ┌───────────────┐   │ broker /   │
           │     │ Metadata DB   │   │ Notif. Svc │
           │     │ (sharded)     │   └─┬──────────┘
           │     └───────────────┘     │
           │                           │ (broadcast to other devices)
           ▼                           │
   ┌───────────────┐                   │
   │ Blob Storage  │                   │
   │ (S3 / Magic   │ ◄── presigned ── ─┘
   │   Pocket)     │     URL download
   └───────────────┘
           │
           ▼
       ┌───────┐
       │  CDN  │   (downloads served from edge)
       └───────┘
```

### Component roles (Apache- / Confluent-grade authoritative)

**Client-side modules** (HelloInterview + GeeksforGeeks converge):
- **Watcher**: monitors local sync folder for create/update/delete events.
- **Chunker**: splits files into 4MB chunks (industry default; some sources say 4-10MB). Each chunk gets a content hash as ID.
- **Indexer**: builds a manifest of chunks per file; tracks which versions exist locally.
- **Internal DB**: SQLite-ish local store of chunk → location mappings.

**Server-side data plane**:
- **API Gateway / Load Balancer**: SSL termination, rate limiting, request routing.
- **Upload / File Service**: coordinates uploads. Issues presigned URLs (clients upload directly to blob storage — backend never sees the bytes). Receives S3 event notifications when chunks land and updates metadata.
- **Metadata Service + DB**: file tree, file→chunk manifest, sharing ACLs, versions. Sharded by user or workspace. Reads dominate (browse + search).
- **Blob Storage** (S3 / Dropbox Magic Pocket): the actual chunk bytes. Immutable per chunk; new content = new chunk + new manifest.
- **CDN**: serves downloads from geographically-close edges. Presigned CDN URLs for security.

**Server-side control plane**:
- **Sync / Notification Service**: WebSocket fan-out + polling fallback. When a chunk lands, broadcast "new version available" to all other devices for this user.
- **Message Queue**: GeeksforGeeks describes a request queue (clients → service) + per-client response queue (service → clients). Provides at-least-once delivery for offline-then-online sync.
- **Workers**: post-upload tasks — thumbnail generation, virus scan, OCR, indexing for search.

### Key techniques (cross-source)

- **Chunking**: 4MB chunks. Only modified chunks re-upload. Bandwidth savings on edits.
- **Content-defined chunking (CDC)**: rolling-hash boundaries instead of fixed 4MB. Means inserting a byte in the middle of a file doesn't shift all chunks. Performance optimization #2 in HI's deep dive.
- **Deduplication**: chunks identified by SHA hash. If two users (or one user across files) have the same chunk → stored once, ref-counted. Saves significant storage at scale.
- **Presigned URLs**: bypass backend bandwidth. Client gets a short-lived (~5 min) S3 URL; uploads/downloads happen S3↔client. Backend learns about the upload via S3 event notifications.
- **WebSocket + polling hybrid**: WebSocket for connected clients (low latency push); periodic polling for the long tail of disconnected/intermittent clients.
- **Conflict resolution**: typically last-write-wins (Dropbox creates a "conflicted copy" file). Vector-clock variants for higher-end systems.

### Scale numbers (cross-source)

| Number | Source |
|---|---|
| 500M total users | GeeksforGeeks |
| 100M daily active users | GeeksforGeeks |
| 100B total files (200 avg files/user) | GeeksforGeeks |
| 100 KB avg file size | GeeksforGeeks |
| Exabytes total storage (1000+ PB) | Dropbox Magic Pocket blog |
| 90% of user data on custom infra (vs AWS) | Dropbox |
| 99.9999999999% (twelve-9s) durability | Dropbox |
| 99.99% availability | Dropbox |
| 1M active concurrent connections (sync) | GeeksforGeeks |
| Files up to 50GB | HelloInterview |
| 4MB chunk size (industry default) | HelloInterview + GeeksforGeeks |
| 10MB API Gateway body limit | HelloInterview |
| Presigned URL TTL: 5 minutes | HelloInterview |
| Metadata reads >> upload/download by orders of magnitude | HelloInterview |

### What a senior 2026 answer mentions

1. Chunk uploads with **CDC + parallel multipart**, resumable on chunk-level failures.
2. **Hash-based dedup** at the chunk level; storage cost is per-unique-chunk not per-user.
3. **Presigned URLs** so the backend never touches the bytes — only metadata coordination.
4. **WebSocket + polling sync** with **per-client response queue** for offline catch-up.
5. **Sharded metadata DB** by userId or workspace; metadata operations dominate, so this is the load-bearing scaling layer.
6. **CDN-fronted downloads** with signed URLs for access control.
7. **Magic Pocket** name-drop: Dropbox runs custom infrastructure (off AWS) at exabyte scale. Erasure-coded blob store; SMR drives for density.

## Mapping to our existing components

| Dropbox concept | Our component | Maps cleanly? |
|---|---|---|
| Client (Watcher/Chunker/Indexer) | Client (source) | ⚠️ partial — we can't model the chunker's internal state |
| API Gateway / LB | rateLimiter + loadBalancer | ✅ |
| Upload Service | service (role: 'appServer') | ✅ |
| Metadata Service | service (role: 'appServer') | ✅ |
| Metadata DB | database (or DB cluster via LB) | ✅ |
| Blob Storage | database (or new type: blobStore) | ⚠️ — semantically a sink, but DOES it accept reads + writes? Same shape as database |
| CDN | cache (role: 'cdn') | ✅ |
| Sync Service | service (role: 'appServer') | ✅ |
| Notification Service / WebSocket fan-out | queue (with pubsub: true) | ⚠️ — Kafka's pubsub semantics from Lesson 17 reused for "broadcast to connected devices" |
| Workers (thumbnails, OCR, indexing) | service (role: 'worker') | ✅ |
| Message queue (request + response) | queue | ✅ |
| Chunking (4MB pieces) | (not modeled — implementation detail) | ❌ — lesson copy |
| Deduplication (hash-based) | (not modeled — content-addressed) | ❌ — lesson copy |
| Presigned URLs (bypass backend) | (modeled implicitly: just point Client→Storage edge directly) | ⚠️ — could model as a direct edge from Client to Blob Storage |
| Content-defined chunking | (not modeled) | ❌ — lesson copy |
| Conflict resolution / last-write-wins | (not modeled) | ❌ — lesson copy |

**The architectural core (clients + gateway + upload service + metadata + blob + CDN + sync) maps cleanly with no new components.** A `blobStore` type could be added for visual distinction from `database`, but isn't strictly required — production blob storage and a relational DB have different internals but the simulator just sees them as terminating capacity sinks.

## Key insights from the multi-source research

1. **Metadata operations dominate.** Browse + search > upload + download by orders of magnitude. The metadata layer's scalability is what makes the system feel fast or slow.
2. **The "presigned URL" pattern is the load-bearing optimization.** Without it, every upload byte hits the backend; backend bandwidth becomes the bottleneck. With it, backend only does metadata coordination — sized for ops/sec, not GB/sec.
3. **Dedup is what makes the economics work.** At 100B files × 100KB = 10PB raw, but dedup ratios are typically 30-70% in real Dropbox/GDrive deployments, taking effective storage to 3-7PB. At scale this is millions of dollars.
4. **Magic Pocket is a separate story** from the architecture. The architecture answer is "S3-like blob storage"; the *production deep-dive* answer is "we built a custom exabyte-scale immutable blob store with SMR drives because S3 became too expensive."
5. **Sync is two-protocol**: WebSocket for connected clients + polling for everyone else. A single protocol breaks under either disconnected or always-connected assumptions.

## Two interview layers (same as Kafka — apply [[feedback-extend-primitives]] pattern)

1. **Architecture layer** (the whiteboard): components, topology, scaling math. Maps cleanly to our primitives.
2. **Internals layer** (the deep dive): chunking, CDC, dedup, presigned URLs, sync protocol, conflict resolution, dedup-and-encryption interaction. Belongs in lesson copy + simplifications.md + property panel labels.
