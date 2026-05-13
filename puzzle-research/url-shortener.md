# Research: URL Shortener (TinyURL) — interview-grade puzzle

**Source page:** https://systemdesign.io/question/design-url-shortening-service-like-tinyurl
**Date:** 2026-05-12

## The questions the source page wants candidates to answer

1. How do you generate a unique short ID?
2. How do you avoid collisions?
3. How do we prevent malicious links, phishing, or spam?
4. Do we rate-limit requests from abusive clients?
5. Do we support link expiration or deletion?
6. How do we store logs for analytics?
7. Should we cache frequently accessed short URLs? Where? (Redis, CDN)
8. How do we handle hot keys (very popular links)?

## Linked "good solutions" — synthesized

Three sources read end-to-end (one fourth, a YouTube video, skipped):

- [Medium / Sandeep Verma — "Good overview"](https://medium.com/@sandeep4.verma/system-design-scalable-url-shortener-service-like-tinyurl-106f30f23a82)
- [DesignGurus blog — "Good solution"](http://designgurus.io/blog/url-shortening)
- [Algomaster blog — "Another solution"](https://blog.algomaster.io/p/design-a-url-shortener)

### Scale numbers (consensus + variance across sources)

| Metric | Medium | DesignGurus | Algomaster |
|---|---|---|---|
| Writes/sec | 40 | 200 | 120 |
| Reads/sec | 8,000 | 20,000 | 12,000 |
| Read:Write ratio | 200:1 | 100:1 | 100:1 |
| Storage (5-10y) | 60 TB | 15 TB | 46 GB |
| Cache size | 70 GB | 170 GB | 25 MB |
| Cache hit rate | ~80% | 80% | 90% |
| Latency target | "fast, no degradation" | "minimal" | "millisecond-level" |

**Convergent design parameters** (what to teach):
- **Read-dominated** workload (~100× reads vs writes)
- **High cache hit rate** (~80-90%)
- **The cache is what makes scale tractable** — without it, DB drowns in reads

### Architectural consensus (the canonical shape)

Every source converges on roughly this:

```
Client (write/create) ─► LB ─► App ─► KGS ─► DB (URL mappings)
Client (read/redirect) ─► LB ─► App ─► Cache ─► (miss) ─► DB
                                          │
                                          └─► (async) Analytics Queue ─► Worker ─► Analytics DB
```

Key non-obvious components:

1. **KGS (Key Generation Service)** — separate service pre-generating short IDs offline, serving them out to App Servers on demand. The whole reason: avoid runtime collision checks (which would be DB roundtrips on every write).
2. **Async analytics path** — every redirect logs (clicker IP, referrer, timestamp, etc) but synchronously logging would block the redirect. Queue + Worker decouples.
3. **Cache as the dominant read-path absorber** — hot URLs live in memory; DB only sees cache misses.

### ID generation — the four approaches

The interviewer's most-loved deep-dive. Sources cover four:

| Approach | How | Tradeoff |
|---|---|---|
| Random base62 | Generate random 7-char string, check DB for collision | Simple but each write costs a DB lookup; collision risk grows with capacity |
| Counter → base62 | Single counter, increment, convert to base62 | Zero collisions, but needs distributed coordination (Zookeeper assigning counter ranges to shards) |
| Hash (MD5/SHA) | Hash long URL, take first 7 chars of base62 | Deterministic (same URL → same short), but URL-encoding variants produce different hashes |
| **KGS (preferred)** | Pre-generate all 7-char keys offline, App Servers pull from KGS | Eliminates collision checks at write time. KGS becomes a potential bottleneck — mitigated by per-server key caching + standby replica |

### Deep-dive sections covered across sources

**Cache strategy**: 80/20 rule. Top 20% of URLs serve 80% of traffic. LRU eviction. Misses fetch from DB and populate all cache replicas. Some sources put cache *behind* App Server; others discuss putting it *in front* (CDN-like) for very hot URLs.

**Hot key handling**: Cache replicas distribute load. CDN for extreme hot URLs (the "viral tweet" case). Otherwise read replicas of the cache itself.

**Database sharding**: Hash-based (`hash(short_url) % N`) or range-based. NoSQL preferred (DynamoDB/Cassandra/MongoDB) for horizontal scale.

**Security**:
- API keys + rate limiting (per-key quotas on creates and reads)
- Blacklists of known-malicious domains
- Reject obvious phishing patterns

**Expiration**:
- Default TTL ~2 years
- Lazy expiration on read (return HTTP 410 Gone)
- Background cleanup sweep during low-traffic hours
- Expired keys can be recycled back to KGS

**Analytics**:
- Async via Kafka (or similar) so redirect latency isn't affected
- Tracked: redirect frequency, country, timestamp, referrer, browser/platform
- Lives in a separate analytics DB or data warehouse

## Mapping to our existing components (what we CAN model)

| Concept | Our component | Lesson where introduced |
|---|---|---|
| Sync request from client | Client | L4 |
| Front-of-house load balancer | LoadBalancer | L4 |
| API / request handlers | Service (role: appServer) | L5 (via service unification) |
| In-memory hot-URL store | Cache (role: internal) | L5 |
| Edge cache for very hot URLs | Cache (role: cdn) | L10 |
| Primary storage | Database | L4 |
| Sharded DB cluster | Database × N behind LB | L7 |
| Read replicas | ReadReplica behind LB | L8 |
| Async analytics path | Queue + Service (role: worker) | L9 |
| Read/write traffic split | Edge `kind: read` / `kind: write` | L8 |

**That's 8 of the 10 architectural primitives the canonical solution uses.** We can express almost the entire canonical shape with what we have.

## What we *cannot* easily model (today)

| Concept | Why it's hard | Workaround |
|---|---|---|
| **KGS (Key Generation Service)** | New component type — passthrough with capacity, conceptually owns write-path ID minting | Add as new top-level type OR skip and acknowledge in copy |
| **Custom alias namespace** | Sim doesn't model name-equality constraints between nodes | Acknowledge in simplifications.md |
| **TTL / expiration** | Sim is steady-state; no time axis | Acknowledge in simplifications.md |
| **Rate limiting / API key abuse** | No notion of per-client quotas | Acknowledge in simplifications.md; could add a `rateLimiter` component as future work |
| **Malicious URL filtering** | No content inspection | Acknowledge in simplifications.md |
| **DB sharding "consistent hashing"** | We model the cluster shape, not the routing algorithm | Already abstracted in Lesson 7 |

None of these are blockers. Real interview answers to the systemdesign.io questions only need the *architectural shape* — the time-based, content-based, and quota-based mechanics are typically described in words during the interview, not drawn on the whiteboard.

## Key insight from the research

The systemdesign.io questions decompose into two layers:

1. **Architectural questions** (cache placement, hot keys, analytics, ID generation as a *system component*) — **we can answer all of these with our existing primitives**. Adding KGS makes the architectural answer match the canonical even more closely.

2. **Out-of-band concerns** (rate limiting, malicious filtering, TTL, custom aliases) — **these are best answered in lesson copy** (simplifications.md cross-references), not modeled in the sim.

This is a perfect match for what our tool actually teaches. The questions interviewers care about most — the ones that the candidate has to draw — are exactly the ones our primitives support.
