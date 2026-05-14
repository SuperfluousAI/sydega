# Research: Designing an E-Commerce Site (Amazon-class)

For Lesson 19. Research collected 2026-05-13 for the next FAANG-grade capstone after Dropbox (L18). Companion proposal in `ecommerce-puzzle-proposal.md`.

## Source set

8 sources surveyed; 6 retrievable via WebFetch, 2 found via search summary. Anything 404 or behind auth that I couldn't parse is excluded.

1. **Highscalability — Amazon Architecture** ([highscalability.com/amazon-architecture](https://highscalability.com/amazon-architecture/)) — Amazon's own CAP-theorem trade-offs. Headline quote: "[For the shopping cart] we always want to honor requests to add items… revenue producing. You choose high availability. Errors are hidden from the customer and sorted out later." vs "When a customer submits an order you favor consistency because several services — credit card processing, shipping and handling, reporting — are simultaneously accessing the data." This is the pedagogical centerpiece: **cart = AP, checkout/order = CP**.

2. **microservices.io — Saga Pattern** ([microservices.io/patterns/data/saga.html](https://microservices.io/patterns/data/saga.html)) — Canonical reference for the saga pattern. Choreography vs orchestration; compensating transactions. Used in every modern e-commerce backend for the order-placement flow.

3. **Stripe — Designing Robust APIs (Idempotency)** ([stripe.com/blog/idempotency](https://stripe.com/blog/idempotency)) — Idempotency keys for payment retries. Exponential backoff + jitter to prevent thundering-herd against a recovering gateway. Practical: every payment integration uses this pattern.

4. **CodeKarle — Amazon System Design** ([codekarle.com/system-design/Amazon-system-design.html](https://www.codekarle.com/system-design/Amazon-system-design.html)) — Full service decomposition: Item, Search, Cart, Wishlist, User, Order Taking, Inventory, Payment, Notification, Serviceability/TAT, Warehouse, Logistics, Recommendation. **Pre-inventory-deduction model**: order created in Redis with expiry → inventory decremented BEFORE payment → payment runs → on success commits, on failure/timeout reconciliation runs and releases inventory.

5. **Hello Interview — Multi-step Processes Pattern** ([hellointerview.com/learn/system-design/patterns/multi-step-processes](https://www.hellointerview.com/learn/system-design/patterns/multi-step-processes)) — How to handle multi-step flows like e-commerce order fulfillment: charge payment, reserve inventory, create shipping label, etc. Sagas + workflow systems (Temporal, Cadence).

6. **systemdesignhandbook.com — Design E-Commerce System** ([systemdesignhandbook.com/guides/design-e-commerce-system-design](https://www.systemdesignhandbook.com/guides/design-e-commerce-system-design/)) — Consistency boundaries explicit: strong consistency for money/orders/inventory/payment, eventual consistency acceptable for catalog/search/recommendations/cart. Inventory **reservations with short-window holds** convert to permanent decrements on success or release on failure. Flash sales need partitioning/queueing/purchase tokens.

7. **Medium / Siddhi Gaikwad — Saga + E-Commerce Checkout** ([medium.com saga in e-commerce checkout](https://medium.com/@siddhi.gaikwad.iitb/understanding-the-saga-design-pattern-through-an-e-commerce-checkout-flow-65eb015e8654)) — Three-step saga: Create Order → Reserve Inventory → Process Payment. Compensation map: Cancel Order ← Release Inventory ← Refund Payment. Orchestration preferred for critical flows (payments).

8. **Hello Interview — Ad Click Aggregator** (used for cross-reference; not e-commerce specific) — Establishes 10k events/sec is whiteboard scale for high-throughput aggregations. We borrow this convention: 10k browse ops/sec at our canvas scale.

## What the canonical answer looks like

Synthesizing across sources, every senior-level answer touches these:

### Three (or four) workloads with very different bottlenecks

| Workload | Rate (whiteboard) | R/W mix | Bottleneck | Solution |
|---|---|---|---|---|
| **Browse / Catalog** | 10,000 r/s | 98% read | DB read throughput | CDN at edge + internal cache + sharded DB |
| **Cart** | 1,000 r/s | 50/50 | Per-user state, low latency | Cart cache + cart DB, AP semantics |
| **Checkout / Order** | 100 r/s | all write | Sync chain breaks | Async via Queue → workers (saga) |
| **Recommendations** (opt) | 100 r/s | 100% read | ML latency | Pre-computed cache, async refresh |

Browse dominates raw RPS. Checkout is rare but expensive (triggers a saga across N downstream services). Cart is the "always available" path that Amazon explicitly biases toward AP.

### The three CAP regimes a senior candidate names

- **AP (eventually consistent)**: catalog, cart, recommendations, search. Customer-facing speed > correctness.
- **CP (strongly consistent)**: order, payment, inventory. Money and contracts > availability.
- **Mixed**: shopping cart "during browsing" is AP, "at checkout" reconciles to CP.

### The saga that runs on order placement

Three flavors of the same idea:
1. **Sequential orchestrator**: a central service runs (a) reserve inventory → (b) charge payment → (c) write order. On any failure, run compensations in reverse.
2. **Choreography via events**: each step listens to events. Order Service publishes "OrderCreated"; Inventory listens, reserves, publishes "InventoryReserved"; Payment listens, charges, publishes "PaymentCharged". On failure, publishes failure events that trigger compensations.
3. **Pre-deduction + reconciliation** (CodeKarle's Amazon model): inventory decrements eagerly during order creation in Redis with a TTL; payment runs; reconciliation sweeps expired-without-payment orders and releases inventory.

### Idempotency keys for payment retries (Stripe)

Every payment write carries an `Idempotency-Key` header. Stripe correlates retries with stored state — first attempt processes, retry returns cached result. Retries use exponential backoff + jitter to avoid thundering-herd.

### Other patterns mentioned across sources

- **Pre-computed cache for recommendations** (Spark/Hadoop batch + Redis or DynamoDB serving layer)
- **ElasticSearch / OpenSearch** for product search (separate from primary DB)
- **Cassandra** for archived/terminal-state orders (CodeKarle)
- **Kafka** for event streaming (search updates, cart events, order events, notifications)
- **CDN** at the edge for catalog reads (product images + JSON-rendered product pages)

## Scale (whiteboard rates we'll use)

Real Amazon scale is bonkers (300M+ products, 1.5M+ orders/day, billions of catalog reads/day). For the puzzle:

- Browse: **10,000 ops/sec**, 98% reads (mostly product views)
- Cart: **1,000 ops/sec**, 50/50 reads vs writes (load, add, remove)
- Checkout: **100 orders/sec** (all writes; triggers async saga)
- Saga fan-out: 100 orders/sec × 3 consumer groups = **300 jobs/sec async**

Proportions are what matter: browse >> cart >> checkout. The same proportions hold from whiteboard to Amazon.

## What we can model on the existing canvas

Every pattern needed by an Amazon-class e-commerce answer is already a primitive:

- **CDN at edge** → `cache:cdn` (from L7, L14, L18)
- **Internal cache for catalog reads** → `cache:internal`
- **Sharded DB cluster behind LB** → multiple `database:metadata` + `loadBalancer` (L10)
- **R/W edge split** → existing edge `kind` axis (L8)
- **Async fan-out via pubsub queue + multiple consumer groups** → `queue` with `pubsub:true` + multiple `service:worker` instances each with a `consumerGroup` (L17 Kafka + L18 Dropbox)
- **Saga as 3 parallel consumer groups (Inventory + Payment + Notification)** → pubsub queue → 3 worker pools

No new sim primitives required. The lesson reuses every prior building block.

## What this lesson does NOT teach (simplifications.md material)

To keep the puzzle whiteboardable:

1. **Idempotency keys** (Stripe pattern) — discussed in lesson copy and sources, not on canvas. The retry logic is per-request, not a flow-sim concept.
2. **Compensating transactions** — same. Sagas appear on canvas as a pubsub fan-out; the *compensation* logic is talk-track.
3. **Product search** (ElasticSearch / OpenSearch) — separate service that mirrors the catalog into a search index. Same architecture pattern as catalog reads; not a new teaching surface, so omit.
4. **Recommendations** — pre-computed cache pattern, same as catalog. Mentioned in lesson copy.
5. **Flash sale / hot-item contention** — purchase tokens, partitioned inventory locks. Out-of-scope per simplifications.
6. **Multi-region replication for orders** — pure SRE concern; see `regional-sre-NOTES.md`.

## Soft caveats (lesson copy honesty)

- Single-region modeling. Real Amazon spans regions; we draw one region.
- No payment-gateway specifics — we represent it as a sink DB. Real systems integrate Stripe/Adyen with idempotency keys, 3DS, etc.
- Inventory race conditions are sim-invisible (the sim models steady-state RPS, not per-item contention).

## Where to dig further

- For the saga pattern: Chris Richardson's microservices.io has the definitive reference + multiple worked examples.
- For Stripe-style idempotency: the Stripe blog post is the canonical pattern.
- For Amazon's actual architecture circa 2007 (still relevant for the philosophy): the highscalability.com piece with the Werner Vogels interview quotes.
