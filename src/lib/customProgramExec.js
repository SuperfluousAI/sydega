// Executes a Custom Program node's user-supplied JS in a sandbox.
//
// Safety model: this is a single-user educational tool. Canvases live in
// the user's own localStorage and are not shared. The user's JS runs in
// the page scope via `new Function(...)` — they can already type anything
// into the address bar, so eval-as-feature is acceptable here. If we ever
// add shared/persisted canvases (multiplayer, gallery, etc.), move this
// into a Worker so authored code can't reach the host page.
//
// The function is called every Run for every customProgram node, so it
// runs O(nodes) times per evaluation — fine for the puzzle sizes we ship.
// We do NOT cache compiled functions across renders because the user may
// be editing the code between runs.

// Default output if the function throws or returns an invalid shape.
function identity(input) {
  return {
    readOut: input.readIn,
    writeOut: input.writeIn,
    latencyAdd: 0,
    p99LatencyAdd: 0,
  };
}

function coerceNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Pulls the user's transform function out of their source. The source is
// expected to declare `function transform(input) {...}`. We append a
// `return transform;` so `new Function(...)` resolves to that closure.
// Anything else (top-level expressions, comments, helpers) goes through
// untouched — they're just other statements in the same function body.
function compile(code) {
  // The harness wraps the user's code with `return transform;` at the end.
  // ReferenceError on `transform` returns null; the caller falls back to
  // identity and surfaces the error.
  const body = `${code}\n;return typeof transform === 'function' ? transform : null;`;
  // eslint-disable-next-line no-new-func
  return new Function(body);
}

// Public API. Returns `{ output, error }`. `output` is always a valid
// shape (identity on failure). `error` is null on success, otherwise the
// message string — surfaced in the UI so the user sees why their code
// didn't run.
export function runCustomProgram(code, input) {
  if (typeof code !== 'string' || code.trim() === '') {
    return { output: identity(input), error: null };
  }
  let transform;
  try {
    const harness = compile(code);
    transform = harness();
  } catch (e) {
    return { output: identity(input), error: `Compile: ${e.message || String(e)}` };
  }
  if (typeof transform !== 'function') {
    return {
      output: identity(input),
      error: 'No `function transform(input)` found — define one to control the flow.',
    };
  }
  let result;
  try {
    result = transform(input);
  } catch (e) {
    return { output: identity(input), error: `Run: ${e.message || String(e)}` };
  }
  if (result == null || typeof result !== 'object') {
    return {
      output: identity(input),
      error: 'transform() returned non-object — return { readOut, writeOut, latencyAdd, p99LatencyAdd }',
    };
  }
  return {
    output: {
      readOut: coerceNumber(result.readOut, input.readIn),
      writeOut: coerceNumber(result.writeOut, input.writeIn),
      latencyAdd: coerceNumber(result.latencyAdd, 0),
      p99LatencyAdd: coerceNumber(result.p99LatencyAdd, 0),
    },
    error: null,
  };
}
