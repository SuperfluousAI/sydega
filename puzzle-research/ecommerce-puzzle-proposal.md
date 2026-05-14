# Proposal: E-Commerce at Scale (Design Amazon) — Lesson 19

**Companion to `ecommerce.md`** (research).

**Goal:** A puzzle that — when passed — demonstrably answers HelloInterview / Werner-Vogels-era Amazon's central question: how do you serve a 100:10:1 browse-vs-cart-vs-checkout workload from one backend while keeping checkout's saga from poisoning the rest of the site?

**Pedagogical headline:** **Three sync flows with different consistency regimes (AP catalog + AP cart + CP order entry) + an async saga fan-out via pubsub queue to three consumer groups (inventory, payment, notification)**. Architecture on canvas. Idempotency keys, compensating transactions, and pre-deduction-then-reconciliation discussed in lesson copy + simplifications.md (not on canvas).

## Where it slots

New **Lesson 19** (after `fileStorageAtScale` at 18). Difficulty: medium-hard. Sits between Dropbox (very-hard, storage-focused) and the still-to-come SRE track. Capstone-class — reuses every prior primitive (CDN, internal cache, sharded DB, R/W edge split, pubsub queue, consumer groups).

## The three workloads that frame the puzzle

1. **Browse / Catalog** — 10,000 ops/sec, 98% reads. CDN at edge absorbs 90% (9,000); internal cache absorbs 85% of misses (850 left of 1,000); sharded catalog DB serves the rest.
2. **Cart** — 1,000 ops/sec, 50/50 read/write. Per-user state, AP-biased (Werner Vogels: "we always want to honor cart adds — revenue producing"). Cart cache + cart DB cluster.
3. **Checkout** — 100 ops/sec, all writes. Posts an order to the Order Service → fans out via the **pubsub Order Queue** to three consumer groups running the saga in parallel.

Plus the **async saga fan-out**:
4. Order Queue (pubsub:true) → 3 consumer groups → 3 worker pools writing to 3 sinks:
   - **Inventory Worker** (consumer group `inventory-saga`) → Inventory DB
   - **Payment Worker** (`payment-saga`) → Payment Gateway sink
   - **Notification Worker** (`notification-saga`) → Notification sink

Reuses the L17 / L18 mechanic: pubsub queue with multiple consumer groups, each worker pool drains the full event stream.

## Canonical solution shape

```
                Browse Clients (10k r/s, R: 1.0)
                          │
                          ▼
                ┌──────────────────┐
                │ CDN (hit 0.9)    │ ◄── absorbs 9000 r/s at edge
                └────────┬─────────┘
                         │ 1000 r/s miss
                         ▼
                ┌──────────────────────┐
                │ Browse LB (cap 5000) │
                └─────────┬────────────┘
                  ┌───────┴────────┐
                  ▼                ▼
        ┌────────────────┐ ┌────────────────┐
        │ Catalog Svc 0  │ │ Catalog Svc 1  │  appServer, cap 2000 each
        └───────┬────────┘ └───────┬────────┘
                │ R                │ R
                └────────┬─────────┘
                         ▼
                ┌──────────────────────┐
                │ Catalog Cache        │ internal, cap 5000, hit 0.85
                └──────────┬───────────┘
                           │ 150 r/s miss
                           ▼
                ┌──────────────────────┐
                │ Catalog DB LB (3000) │
                └─────┬──────┬─────┬───┘
                      ▼      ▼     ▼
                   DB-0    DB-1  DB-2     metadata, cap 1000 each (sharded)


       Cart Clients (1000 r/s, R: 0.5)
                  │
                  ▼
            ┌─────────────┐
            │ Cart Svc    │ appServer, cap 1500
            └──────┬──────┘
                   ▼ R+W
            ┌─────────────┐
            │ Cart Cache  │ internal, cap 2000, hit 0.7
            └──────┬──────┘
                   ▼ R+W miss
            ┌─────────────┐
            │ Cart DB     │ metadata, cap 1500
            └─────────────┘


   Checkout Clients (100 r/s, R: 0 — pure writes)
                  │
                  ▼
            ┌──────────────┐
            │ Order Svc    │ appServer, cap 200
            └──────┬───────┘
                   ▼ W
            ┌──────────────────────────────┐
            │ Order Queue (pubsub: true)   │
            └────────┬─────┬───────┬───────┘
                     │     │       │              ← 3 consumer groups
                     ▼     ▼       ▼              each worker drains 100/s
              ┌─────────┬─────────┬──────────┐
              │ Invent. │ Payment │ Notif.   │   workers, cap 200 each
              │ Worker  │ Worker  │ Worker   │   each tagged with consumerGroup
              └────┬────┴────┬────┴────┬─────┘
                   ▼         ▼         ▼
              Inventory   Payment   Notif.
                 DB       Gateway    Sink         metadata, cap 200 each
              (cap 200)  (cap 200)  (cap 200)
```

## Workload math (verified)

### Sync flows (must reach success rate ≥ 99%)

Browse path:
- 10,000 r/s → CDN (hit 0.9) absorbs 9,000 → 1,000 to LB
- LB → 500 each to 2 Catalog Svcs (total cap 4,000 ✓)
- Cache hit 0.85 absorbs 850; 150 miss to DB LB
- 50 r/s per shard (cap 1,000 ✓)

Cart path:
- 1,000 r/s → Cart Svc (cap 1,500 ✓)
- Cache hit 0.7 absorbs 700; 300 miss to Cart DB (cap 1,500 ✓)
- Writes (500) skip cache, go straight to DB → cart DB sees 300 read + 500 write = 800 ops/s

Checkout path:
- 100 r/s → Order Svc (cap 200 ✓) → Order Queue accept (cap 200 ✓)

Total sync attempted: 10,000 (browse) + 1,000 (cart) + 100 (checkout) = **11,100 r/s**
Total sync served: ~11,100 (everything fits) → success rate ≈ 100% ✓

### Async saga (background success rate ≥ 99%)

- Order Queue (pubsub: true) gets 100 events/s
- Out-degree 3 (3 consumer groups) → totalBackgroundAttempted = 100 × 3 = **300 jobs/s**
- Each Worker (cap 200) drains its 100/s feed → totalBackgroundServed = 300 ✓

### Component dropping any of these breaks the puzzle

| Drop | Effect |
|---|---|
| CDN | Catalog Svc sees 10,000 r/s > cap 4,000 → drops |
| Catalog Cache | Catalog DB cluster sees 1,000 r/s > 3,000 cap aggregate works, but per-shard becomes 333 → still works actually. Hm, need to tighten DB capacity OR cache requirement. **Make DB cap 200/shard so cache is required.** |
| Order Queue (pubsub) | Saga doesn't fan out — only 1 worker pool would handle all 3 steps; not the architecture |
| Multiple consumer groups | Falls back to single-group; all 3 saga concerns serialize in one worker pool — not the saga pattern |

**Tightening:** to make Catalog Cache load-bearing, lower per-shard capacity to **300** so 1,000 r/s without cache = 333/shard > cap. With cache: 50/shard ≪ cap. Forces the cache predicate.

## Requirements (8 checks)

1. **syncSuccess** — `successRate >= 0.99` across all 3 sync flows
   - lesson: 10k browse + 1k cart + 100 checkout = 11.1k/sec. Drop any of: CDN (catalog melts), catalog cache (DB melts), cart cache (cart DB melts), and success rate drops.

2. **asyncSuccess** — `backgroundSuccessRate >= 0.99`
   - lesson: Order Queue with `pubsub: true` broadcasts each order event to all 3 consumer groups. totalBackgroundAttempted = 100 × 3 = 300. Each worker pool drains 100/s.

3. **hasCdn** — `presence: cache role:cdn min:1`
   - lesson: Browse at 10k/s would smash the catalog. CDN at edge with 0.9 hit rate absorbs 9000.

4. **hasCatalogCache** — `presence: cache role:internal min:1`
   - lesson: Even after CDN, 1000 r/s of catalog reads would exhaust the sharded DB cluster (300/shard cap). Internal cache at 0.85 hit rate reduces DB load to 150/s.

5. **hasCatalogShards** — `presence: database role:metadata min:3`
   - lesson: Multiple DB shards behind a DB LB spread catalog reads. Tag each with role: metadata.

6. **hasOrderQueue** — `presence: queue min:1`
   - lesson: Checkout writes hit a Queue so the saga runs async. Without a queue, checkout latency = sum of all downstream steps + retries.

7. **hasMultipleConsumerGroups** — `metric consumerGroupCount >= 3`
   - lesson: The saga has 3 concerns (inventory, payment, notification). Each worker pool gets its own consumer group; with the Order Queue's `pubsub: true`, every event reaches every group.

8. **noOrderLatencySpike** — `avgP99Latency <= 50`
   - lesson: Pubsub-queue accept is fast (<10ms). Without the queue (sync chain to inventory + payment + notification), p99 is 50-200ms. The queue is what keeps checkout snappy.

## Background paragraphs (lesson copy outline)

1. **The three workloads.** Browse / cart / checkout have very different bottleneck profiles. Browse dominates raw RPS but is read-heavy and absorbed by CDN+cache. Cart is small but constant and AP-biased (Amazon's own design choice). Checkout is rare but fans out into a multi-step saga.

2. **Cart = AP, Order = CP** (the Werner Vogels quote). The same shopping experience is **eventually consistent for cart edits** (we always honor an add-to-cart) but **strongly consistent at order submission** (multiple downstream services need to see the same authoritative state).

3. **The pubsub queue as a saga substrate.** When an order is placed, the Order Service writes ONE event to the Order Queue. With `pubsub: true`, three consumer groups (inventory, payment, notification) each see the full event stream. Each worker pool runs ONE concern of the saga. If payment fails, the Payment Worker publishes a compensation event that the others react to. (Compensation logic is talk-track — not on canvas.)

4. **The idempotency-key story for payment.** Payment Worker calls the external payment gateway with an `Idempotency-Key` header (Stripe-style). On retry, the gateway returns the cached result instead of double-charging. Exponential backoff + jitter on the retry. Talk-track, not on canvas.

5. **Why the numbers are what they are.** Real Amazon: 300M+ products, ~1.5M orders/day. Our 10k browse + 1k cart + 100 checkout is whiteboard scale. Proportions hold: browse ≫ cart ≫ checkout.

6. **Extra extra — patterns we DO draw vs do NOT.** Drawn: pubsub queue + consumer groups (L17), CDN + internal cache (L7+L14), sharded DB cluster (L10), R/W edge split (L8). NOT drawn: idempotency keys, saga compensation logic, product search (ElasticSearch), recommendations (pre-computed cache), flash-sale contention (purchase tokens). All in simplifications.md.

7. **Soft caveat — single-region modeling.** Real Amazon spans regions for DR + latency. We model one region. SRE track to come.

## Components used (all exist)

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
]
```

No new component types. No new sim primitives.

## Files to add / touch

| File | Change |
|---|---|
| `src/lib/puzzles.js` | Add `ecommerceAtScale` puzzle (order 19). Add to `puzzleOrder`. |
| `simplifications.md` | Append 5 new entries (idempotency, compensation, search, recommendations, flash-sale contention). |
| `puzzle-research/ecommerce.md` | Done (this proposal's companion). |
| `puzzle-research/ecommerce-puzzle-proposal.md` | This file. |
| `caveats.md` | Optional caveat entry for the AP/CP regime split. |
| `journal.md` | Lesson 19 build journal entry. |

## Risks / unknowns

1. **Capacity tuning may need iteration.** First run might pass too easily or fail unexpectedly. Plan: run the sim against the canonical solution; if `successRate` or `backgroundSuccessRate` is < 0.99, tighten down per-component caps.
2. **The Cart Cache predicate is soft** — cart DB at cap 1500 absorbs 1000 ops without cache. Consider tightening Cart DB to cap 800 to make the cart cache load-bearing too. **Decision: keep cart cache decorative-but-useful, only catalog cache is required.**
3. **`noOrderLatencySpike` predicate** depends on sim's p99 model. The pubsub queue adds 0 latency by default; without queue, sync chain accumulates per-hop latency. Should work but verify.
