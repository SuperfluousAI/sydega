# Proposal: URL Shortener (Real-World / Interview-Grade) puzzle

**Companion to `url-shortener.md`** — that's the research; this is the build proposal.

**Goal:** A puzzle that — when a student passes it — demonstrably answers the 8 questions on systemdesign.io's TinyURL page. Should be defensible as "the canonical FAANG TinyURL answer."

## Where it slots in the curriculum

Adds as new **Lesson 13** (after the current 12-lesson run, after twitterAtScale which is the abstract-FAANG capstone).

Why a new puzzle rather than upgrading old Lesson 5 (urlShortener)? Two reasons:

1. Lesson 5 is a *pedagogical* intro to caching — narrow, focused. Operating on it would dilute the lesson.
2. Real interview-grade is *systemic* — touches CDN, cache, KGS, queue+workers, sharding, replicas. It's an integration puzzle. That belongs late in the curriculum, not at slot 5.

The existing Lesson 5 (urlShortener) stays as the **simple introduction** to URL shorteners. The new Lesson 13 is **how interviewers ask about it.**

## Workload (synthesized from the three sources)

Picking the **algomaster middle-ground numbers** — neither the smallest (Medium) nor largest (DesignGurus). Round numbers for clarity:

- **Posters (creators):** 100 writes/sec (URL creation)
- **Visitors (clickers):** 10,000 reads/sec (URL redirects)
- **Read:Write ratio:** 100:1 — matches industry consensus
- **Cache hit rate target:** 80% (default `internal` cache)
- **Analytics path:** every redirect generates a log event (10k events/sec via Queue → Workers)

These numbers are FAANG-realistic and let the existing components express the answer.

## Canonical solution shape

```
Posters (100 w/s) ──────────────────────────────────────► LB-front ─┐
                                                                    │
Visitors (10k r/s) ─► CDN ─[5%, 500 r/s]─────────────────► LB-front ─┤
                                                                    │
                              ┌──────────► Apps (cap 1500 each) ────┘
                              │              ├─[R]─► Cache (int.) ─[20% miss, 100 r/s]─► DB
                              │              ├─[W]─► KGS ─► DB (URL mappings)
                              │              └─[R+W, async log event]─► Analytics Queue ──► Workers ──► Analytics DB
                              │
                          (~600 r/s + 100 w/s = 700 r/s sync load)
```

Components:
1. **Posters** — Client, 100 w/s, readRatio 0
2. **Visitors** — Client, 10,000 r/s, readRatio 1
3. **CDN** — Cache role=cdn (absorbs 95% of read traffic at edge)
4. **LB-front** — LoadBalancer (receives writes from Posters + read-misses from CDN)
5. **Apps** — 2× Service role=appServer, cap 1500 each (handles ~1100 rps mixed sync)
6. **Internal Cache** — Cache role=internal (absorbs 80% of remaining reads)
7. **KGS** — NEW component (see below) — pre-generates unique IDs, owns the write path
8. **URL DB** — Database (stores URL mappings; receives both KGS-routed writes and cache-miss reads)
9. **Analytics Queue** — Queue (terminates the sync path for the async log event)
10. **Analytics Workers** — 2× Service role=worker (drain queue → write to Analytics DB)
11. **Analytics DB** — Database (separate from URL DB — different access pattern)

Numerically:
- CDN absorbs 9500/10000 reads ✓
- LB-front sees 500 reads + 100 writes = 600 rps ✓
- Each App sees 250 reads + 50 writes = 300 rps under cap 1500 ✓
- Internal Cache absorbs 80% of 500 = 400 reads at cache; 100 miss to DB ✓
- KGS receives 100 w/s; default cap = ? (see "the KGS question" below)
- URL DB receives 100 reads sync + 100 writes sync = 200 rps under default 1000 ✓
- Analytics Queue receives 10k events/sec (every successful read = a log event)
- Analytics Workers drain 10k/sec — needs high capacity (5 workers @ 2000? or 10 @ 1000?)
- Analytics DB receives 10k writes/sec async — needs scaling (DB cluster!)

The Analytics scale is where the puzzle gets real — 10k events/sec is a lot. Either:
- Bump Analytics DB cap high (cheating)
- Use a DB cluster behind a DB-LB (Lesson 6 pattern, on the analytics side)

This dual-arc shape — Lesson 7 read-replicas on the read path AND Lesson 6 DB-cluster on the analytics path — is what makes this lesson feel like a real interview answer.

## Foundational changes needed

### 1. New component: KGS (Key Generation Service)

Pedagogically load-bearing — directly answers questions 1 ("How do you generate a unique short ID?") and 2 ("How do you avoid collisions?"). Without KGS in the architecture, the lesson can't claim to answer those.

**Type spec:**
- `kgs` (new top-level type)
- Color: distinct from existing (maybe slate `#64748b` for "infrastructure utility")
- Role: passthrough (flow-sim) — sits between App and DB on the write path
- Props: `keyPoolSize` (informational), `keysPerSec` (capacity = how many IDs it can mint per second)
- Default `keysPerSec`: 500 (well over 100 w/s in the canonical, but a player could under-provision and find KGS is the bottleneck)
- Both `acceptsReads: false` and `acceptsWrites: true` — KGS only sits on the write path. (Sym to ReadReplica's `acceptsWrites: false`.)

This is a small addition (~20 lines in componentTypes + componentInfo). Pattern matches existing role-aware types.

### 2. Add `rateLimiter` (optional, future)

Answers question 4 ("Do we rate-limit requests from abusive clients?"). Could be a new passthrough component placed before LB. Drops a percentage of incoming traffic above a threshold.

**Decision:** Defer. Acknowledged in lesson copy + simplifications.md as "real production has rate limiters; we don't model abuse traffic." If we ever want to teach abuse mitigation, add this then.

### 3. Acknowledged in simplifications.md (additions)

- **TTL / link expiration**: steady-state sim doesn't model time-decay.
- **Custom aliases**: namespace-conflict semantics not modeled.
- **Malicious URL filtering**: no content inspection.
- **Rate limiting / API quota abuse**: no per-client rate caps.
- **HTTP 301 vs 302 vs 410 status codes**: lesson copy can mention; sim doesn't differentiate response codes.

Each gets its own simplifications.md entry following the existing format ("Where it shows up / What we say / What's actually going on / Why we abstract / What a student should know").

## Requirements (7 total, all defensible)

1. **Read success ≥ 99%** — visitors load redirects ([Q7, Q8])
2. **Write success ≥ 99%** — posters get short URLs ([Q1])
3. **Background success ≥ 99%** — analytics log events drain ([Q6])
4. **p99 sync latency ≤ 100ms** — keeps redirects snappy ([scale/latency target])
5. **`hasCdn`** — must use CDN at edge for hot URL absorption ([Q7, Q8])
6. **`hasKgs`** — must use KGS for ID generation ([Q1, Q2])
7. **`hasQueue`** — must use Queue for async analytics ([Q6])

This requirements set means a passing solution **demonstrably answers 6 of 8 questions on the source page** (Q3, Q5 = security/expiration, which we don't model, and Q4 = rate limiting). The lesson blurb explicitly calls out the 2 we don't model.

## Test surface (per puzzle convention)

- Canonical solution test (auto from framework) — must pass.
- 3-4 targeted failure-mode tests:
  - No CDN → reads overwhelm internal architecture
  - No KGS → predicate fails
  - No Queue → analytics path doesn't exist OR sync analytics ruin latency
  - Under-sized Analytics Workers → background success collapses while sync stays green
  - Single Analytics DB (no cluster) → DB drops 90% of analytics writes

## What approval looks like

If you sign off on:
- **The KGS component addition** (the only real foundational change)
- **The simplifications.md additions**
- **The canonical solution shape**

then I can build the lesson in ~one session of work. Tests pass, journal Part 16 written, new git tag.

If you want a different scope (e.g., add rateLimiter too, or do this without KGS) we re-discuss before coding.

## Decisions to surface explicitly

1. **KGS as new top-level component, yes or no?** (My recommendation: yes. Without it, we can't claim to answer Q1/Q2.)
2. **Defer rateLimiter or include it?** (My recommendation: defer.)
3. **Slot as Lesson 13 (after Twitter at Scale) or somewhere else?** (Recommendation: 13. Real-world specificity comes after abstract-FAANG capstone.)
4. **Numerics**: should the workload be exactly 100 w/s + 10k r/s, or something different to push harder? (Recommendation: as proposed — matches the sources.)
5. **Do we also add `rateLimiter` to simplifications.md / lesson copy now**, signaling it's a known abstraction, or wait until we build it for real? (Recommendation: add to simplifications.md now.)
