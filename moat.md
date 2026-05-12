# Moat — IP protection for a frontend-only interactive tool

A capture of the "can this be stolen" conversation. Tied to the question of
how to commercialize an interactive learning tool that ships its source to
the browser.

## TL;DR

A frontend SPA cannot be technically prevented from being copied. Anyone
with DevTools (or a paying account) can save the bundle, deobfuscate, and
host their own clone. The real moats are non-technical.

## What is not protectable

- The visual UX and animations (CSS + JSX is right there)
- The puzzle definitions (currently in `src/lib/puzzles.js`, served to the
  browser)
- The simulator math (`src/lib/simulator.js`, browser-side)
- The component types (`src/lib/componentTypes.js`)

## Real moats (non-technical, ranked by leverage)

1. **Content velocity.** Ship a new lesson every week. The cloner is always
   stale; players follow the source of new content. This is the strongest
   moat for educational tools.
2. **Server-side state.** Accounts, progress tracking, leaderboards,
   social features. The clone has the UI but no users. Network effects
   compound from here.
3. **Brand + community.** People go to *the* site, not its fork. Same
   reason there's one Wordle and a thousand Wordle clones nobody plays.
4. **Legal.** Copyright on source code attaches automatically (registering
   adds statutory damages). ToS that prohibits redistribution. DMCA
   takedowns are effective against most hosted clones. Trademark the name.

## Technical mitigations, ranked by ROI

1. **Minify + strip source maps in prod builds.** Vite does this for free
   with `npm run build`. Stops casual lifting; doesn't stop motivated
   copiers. Default to this.
2. **Move the valuable bits server-side.** Puzzle definitions, simulator,
   grading, and lesson content live on a backend. Client is a renderer +
   network layer. Cloner gets the UI but not the content database. Worth
   doing whenever a backend is introduced for accounts anyway.
3. **Watermark builds + telemetry.** Each deployment pings home with its
   referrer; you can detect clones serving your assets. Worth doing right
   before launch.
4. **WASM for the simulator.** Reversible but expensive to reverse. Friction
   only — not protection. Skip unless the simulator itself is the core IP.

## What's not worth bothering with

- Aggressive code obfuscation beyond standard minification. Determined
  copiers laugh; legitimate users get crappy debuggability.
- Anti-DevTools tricks (disabling F12, console.log nukes, etc). Trivially
  bypassed and annoy honest users.
- Client-side license keys without server validation. Trivially patched.

## When to start worrying

- **Not now.** The codebase is a single-machine prototype. There's
  literally nothing of unique value to copy — the puzzle content is small
  enough to recreate from scratch in less time than copying it.
- **When monetization starts.** Adding a backend for accounts is the
  natural moment to also move puzzles + simulator + grading server-side.
  Same migration, two reasons.
- **When the puzzle library grows past ~20 lessons.** That's the breakpoint
  where content velocity becomes a real moat — both for marketing and for
  making cloning a moving target.

## Next-step actions (when ready)

- Register the source with the US Copyright Office (~$65 for a single work).
- Reserve the domain + trademark the name once they're settled.
- When the backend lands: move puzzle JSON to a database; serve only by
  authenticated request.
- Add a `referrer-check` middleware to flag asset requests coming from
  domains other than yours.

Until then: keep building.
