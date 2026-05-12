# Framework — making the game user-extensible via JSON puzzles

The motivating question, from the operator:

> "can we talk about how we can make this a framework? for instance, lesson 4,
> the client can connect to 3 VPSes directly and it will pass, lol."

> "what i see is a system that can easily be entirely represented by json
> where people may be able to import or export puzzles. i also see something
> where the restraints and exclusions for what things are limited to connect
> to can be allowed but still be wrong, maybe with a guardrails/hints off or
> something."

Today, puzzles live in `src/lib/puzzles.js` and component metadata lives in
`src/lib/componentTypes.js` — both are JS modules bundled into the app. The
goal of this doc is to lay out what it would take to flip those into
data-driven JSON that third parties could author, import, and share.

## The Lesson 4 bug that motivates this

In Lesson 4 ("Add a Load Balancer"), the intended solution is:

```
Client (3000 rps) → Load Balancer → 3× VPS (1000 rps each)
```

But because the only constraints are the pass requirements (success ≥ 99% AND
served ≥ 2970 rps), this also passes:

```
Client (3000 rps) → 3× VPS (direct fan-out, no LB)
```

The simulator fan-outs 1000 rps to each VPS, every VPS handles its 1000 cap,
total served = 3000, success rate = 100%. Passes, but defeats the entire
*point* of the lesson — which is "you need an LB to route across multiple
VPSes."

The fix shape: puzzles need a way to say *the solution must use component X*
or *component A is not allowed to connect to component B in this lesson.*
Today the puzzle has no vocabulary for either.

## What "framework" buys us

1. **Author once, run anywhere.** A puzzle becomes a single JSON file that
   can be loaded from a URL, posted as a gist, embedded in a tutorial.
2. **Sharing.** Players can export their solution graph + the puzzle JSON
   they solved, and someone else can load it and inspect.
3. **Pedagogical correctness.** Constraints like "must use a Load Balancer"
   or "Client cannot connect directly to VPS" become first-class and
   testable — not just hoped-for emergent behavior.
4. **Guardrails toggle.** A learner who's curious can turn off the
   constraints and discover *why* the constraints exist, by seeing the
   wrong-but-passing solution.

## Schema sketch

### Component types

A component type today is a JS object with `label`, `color`, `role`,
`hasInput`, `hasOutput`, `defaults`, and `props`. Translating that to JSON
is almost free; the only thing that *can't* go in JSON is custom rendering,
which we don't have anyway.

```jsonc
{
  "id": "loadBalancer",
  "label": "Load Balancer",
  "color": "#0ea5e9",
  "role": "passthrough",
  "container": false,
  "hasInput": true,
  "hasOutput": true,
  "defaults": { "capacity": 50000, "latency": 1 },
  "props": [
    { "key": "capacity", "label": "Capacity (req/s)", "type": "number", "min": 1, "step": 1000 },
    { "key": "latency",  "label": "Added latency (ms)", "type": "number", "min": 0, "step": 1 }
  ],

  // NEW: connection rules. Authoritative at the component level.
  // A puzzle can override these per-puzzle (see below).
  "connections": {
    "outgoing": {
      // Allow-list of component types this can connect to. Omitted = any.
      "allow": ["appServer", "vps", "loadBalancer"],
      // Per-target limits.
      "limits": { "appServer": { "max": 16 } }
    },
    "incoming": {
      "allow": ["client", "loadBalancer"]
    }
  }
}
```

### Puzzles

A puzzle JSON would carry: the lesson's metadata, the components it makes
available, the starting graph, the *constraints* (what counts as a valid
graph at all), and the *requirements* (what counts as a passing solution).

```jsonc
{
  "id": "addLoadBalancer",
  "order": 4,
  "title": "Add a Load Balancer",
  "blurb": "One VPS is being crushed...",
  "kind": "flow",                      // selects simulator
  "allowedComponents": ["client", "loadBalancer", "vps"],
  "background": ["..."],                // optional reading-panel paragraphs

  "initialNodes": [
    { "id": "client-1", "type": "client", "position": { "x": 80, "y": 220 },
      "config": { "rps": 3000, "readRatio": 1 } }
  ],

  // NEW: per-puzzle constraint overrides.
  // These RESTRICT what the player can build. Validated at edge-creation
  // time and at run-time.
  "constraints": {
    "connections": {
      "client": {
        "outgoing": {
          // For THIS puzzle, Clients cannot connect directly to VPS.
          // The lesson is "you need an LB."
          "exclude": ["vps"]
        }
      }
    },
    "limits": {
      "vps":          { "min": 2 },     // must have ≥ 2 VPS in the graph
      "loadBalancer": { "min": 1 }      // must have ≥ 1 LB
    }
  },

  // requirements are evaluated by the simulator against its result.
  // See "the requirements-as-data problem" below.
  "requirements": [
    { "key": "successRate", "label": "Success rate ≥ 99%",
      "test": { "metric": "successRate", "op": ">=", "value": 0.99 } },
    { "key": "served", "label": "Served ≥ 2970 req/s",
      "test": { "metric": "totalServed", "op": ">=", "value": 2970 } }
  ]
}
```

## Constraint vocabulary

Three orthogonal axes:

1. **Connection rules** — which types can connect to which.
   - `allow: [...]` — allow-list at the component level.
   - `exclude: [...]` — per-puzzle subtraction from the base allow-list.
   - `include: [...]` — per-puzzle addition (rare, but useful for "advanced"
     lessons that unlock connections).
2. **Limits** — count constraints on the *graph as a whole*.
   - `min` / `max` per component type.
   - `min` / `max` per *edge type* (e.g. "at most one direct Client→DB
     edge in the entire graph").
3. **Topology requirements** — shapes that must (or must not) be present.
   - "There must be a path from Client to a sink."
   - "Every VPS must be reachable from a Load Balancer."
   - Likely deferred until needed; the limits axis covers most cases.

When the player draws an edge that violates a connection rule, the canvas
should either (a) refuse the edge with a tooltip explaining why, or (b)
allow it but mark it red — depending on the guardrails setting.

## The guardrails toggle

Three modes:

| Mode      | Connection rules         | Limits             | Requirements |
|-----------|--------------------------|--------------------|--------------|
| **on**    | enforced at edge draw    | shown as checklist | enforced     |
| **soft**  | warned but allowed       | shown as checklist | enforced     |
| **off**   | ignored                  | ignored            | enforced     |

In `off` mode, the player can build Lesson 4 with no LB, watch it pass,
and feel the disconnect that motivates the constraint in the first place.
That's a feature, not a bug — it's the same pedagogical moment as
discovering why caches matter by first failing without them.

Default per puzzle: `on`. Per-player override available in the UI.

## The requirements-as-data problem

The hard part. Today, a puzzle's `requirements` array is JS:

```js
{ test: (r) => r.successRate >= 0.99 }
```

That can't go in JSON — functions don't serialize. The escape hatches:

1. **Named test types with parameters.** Define a small set of named tests
   the simulator knows about, each with a parameter schema. Authors compose
   from those.

   ```jsonc
   { "metric": "successRate", "op": ">=", "value": 0.99 }
   { "metric": "totalServed", "op": ">=", "value": 2970 }
   { "metric": "avgLatency",  "op": "<=", "value": 80 }
   { "presence": "loadBalancer", "min": 1 }
   { "noDirectEdge": { "from": "client", "to": "vps" } }
   ```

   Pro: safe, declarative, easy to validate. Con: every new test shape
   needs code in the simulator. Reality: there are ~10 useful shapes
   total; this is fine.

2. **A tiny expression language** (eg. JSONLogic). Pro: arbitrary boolean
   logic without code changes. Con: another DSL to learn, harder to error
   on, and tempts authors to write incomprehensible nested expressions.

3. **Sandboxed JS** (eg. a Function constructor with a whitelisted globals
   set). Pro: max expressiveness. Con: security footgun, bundles a parser,
   makes serialization fragile.

Recommendation: **(1)** — named tests + parameters. It covers every current
puzzle and stays auditable. Add new test types as new puzzles need them.

## Import / export shape

```jsonc
// puzzle bundle = puzzle + (optional) custom component types
{
  "version": "1",
  "puzzle": { /* puzzle JSON */ },
  "components": [ /* optional component type JSONs */ ]
}
```

A player can also export their *solved graph* alongside the puzzle for
share-a-solution flows:

```jsonc
{
  "version": "1",
  "puzzle": { /* ... */ },
  "solution": { "nodes": [...], "edges": [...] }
}
```

## Migration path

The migration is incremental and doesn't need to be one big change:

1. **Add per-puzzle connection exclusions** as a JS field first. This fixes
   the Lesson 4 bug today without waiting on the full JSON pivot.
   Concretely: `puzzles.addLoadBalancer.constraints = { connections: { client: { outgoing: { exclude: ['vps'] } } } }` and a check in `Canvas.jsx`'s `onConnect`.
2. **Add component-level connection rules** to `componentTypes.js`. Same
   shape as the JSON schema above, just expressed as JS objects.
3. **Validate edges** against (1) + (2) at draw time. Show inline reason
   when an edge is refused.
4. **Add the guardrails toggle** in the UI. Off mode skips the validation.
5. **Add an import/export button.** Internally serializes the current
   puzzle + graph to JSON; loads from pasted JSON / drag-drop file.
6. **Move puzzle data to JSON files.** `src/lib/puzzles.js` becomes a
   loader; each puzzle is `src/puzzles/addLoadBalancer.json`. The
   `test:` JS field gets replaced with the named-test schema. Same for
   component types.
7. **Custom puzzle URL.** `?puzzle=https://...json` loads a remote puzzle.

Steps 1–3 are worth doing soon — they fix a real bug and don't require
much new surface area. Steps 4–7 unlock the framework story but can wait
until the core lessons feel stable.

## Open questions

- **Versioning.** Once puzzles are out in the wild, a schema bump needs
  a migration story. Embed `version: "1"` in every JSON from day one.
- **Trust.** A user loading a third-party puzzle is trusting it not to lie
  about its requirements. Mitigations: sandbox the test evaluator (named
  tests, no code execution), surface the test definitions in the UI so
  the player can see what they're being graded on.
- **Component type clashes.** Two puzzles with custom components named the
  same thing. Namespace by puzzle author? Use content-addressed IDs?
  Probably worry about this when it happens.
- **Simulator extensibility.** Today there are three sim kinds (flow,
  composition, connectivity). A user-defined puzzle that wants a NEW
  simulator kind can't be expressed in JSON. Acceptable: custom sims need
  code; what JSON unlocks is *new puzzles on existing sims*.

## In one sentence

Move the puzzle definitions to JSON, give them a constraint vocabulary
(connection rules + limits), keep test logic auditable via named-test
types, and ship a guardrails toggle so the constraints can be learned
*by violating them* when the player chooses to.
