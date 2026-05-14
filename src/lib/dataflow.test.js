// Tests for the dataflow simulator (kind: 'dataflow') used by the JS
// Sandbox track. Mirrors the structure of simulator.test.js but the
// semantics are different: strings flow on wires, one pass per Run.

import { describe, it, expect } from 'vitest';
import { simulate } from './simulator.js';
import { defaultsFor } from './componentTypes.js';

function node(id, type, configOverrides = {}, extra = {}) {
  return {
    id,
    type: 'system',
    position: { x: 0, y: 0 },
    data: { type, config: { ...defaultsFor(type), ...configOverrides } },
    ...extra,
  };
}

function edge(from, to) {
  return { id: `${from}->${to}`, source: from, target: to };
}

// Minimal puzzle stub — only `kind` and `testCases` matter for sim.
function makePuzzle(testCases = []) {
  return { kind: 'dataflow', testCases };
}

describe('dataflow simulator — basic shape', () => {
  it('runs in playground mode when no test cases — pipes textInput → textOutput', () => {
    const r = simulate(
      makePuzzle(),
      [
        node('in', 'textInput', { value: 'hello' }),
        node('out', 'textOutput'),
      ],
      [edge('in', 'out')],
    );
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('dataflow');
    expect(r.playgroundOutput).toBe('hello');
    expect(r.totalCount).toBe(0);
    expect(r.passedCount).toBe(0);
  });

  it('runs the customProgram on the wired-in string and emits its return', () => {
    const code = `function transform(input) { return input.toUpperCase(); }`;
    const r = simulate(
      makePuzzle(),
      [
        node('in', 'textInput', { value: 'hi' }),
        node('prog', 'customProgram', { code }),
        node('out', 'textOutput'),
      ],
      [edge('in', 'prog'), edge('prog', 'out')],
    );
    expect(r.ok).toBe(true);
    expect(r.playgroundOutput).toBe('HI');
  });

  it('rejects cycles — dataflow is a single pass top-to-bottom', () => {
    const r = simulate(
      makePuzzle(),
      [
        node('a', 'customProgram', { code: 'function transform(x){return x}' }),
        node('b', 'customProgram', { code: 'function transform(x){return x}' }),
      ],
      [edge('a', 'b'), edge('b', 'a')],
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/cycle/i);
  });
});

describe('dataflow simulator — test case grading', () => {
  it('overrides the textInput value with each test case input', () => {
    const code = `function transform(input) { return "Hello, " + input; }`;
    const r = simulate(
      makePuzzle([
        { input: 'world', expected: 'Hello, world' },
        { input: 'Claude', expected: 'Hello, Claude' },
      ]),
      [
        // The textInput's config.value is what the player typed; test
        // cases must override it so grading is reproducible.
        node('in', 'textInput', { value: 'placeholder' }),
        node('prog', 'customProgram', { code }),
        node('out', 'textOutput'),
      ],
      [edge('in', 'prog'), edge('prog', 'out')],
    );
    expect(r.ok).toBe(true);
    expect(r.totalCount).toBe(2);
    expect(r.passedCount).toBe(2);
    expect(r.caseResults[0].actual).toBe('Hello, world');
    expect(r.caseResults[1].actual).toBe('Hello, Claude');
  });

  it('marks a case as failed when actual ≠ expected', () => {
    const code = `function transform(input) { return input; }`; // identity, wrong answer
    const r = simulate(
      makePuzzle([
        { input: 'world', expected: 'Hello, world' },
      ]),
      [
        node('in', 'textInput'),
        node('prog', 'customProgram', { code }),
        node('out', 'textOutput'),
      ],
      [edge('in', 'prog'), edge('prog', 'out')],
    );
    expect(r.passedCount).toBe(0);
    expect(r.caseResults[0].passed).toBe(false);
    expect(r.caseResults[0].actual).toBe('world');
  });

  // CHAIN CONTRACT: two customPrograms back-to-back compose normally —
  // the second receives whatever string the first emits. This is the
  // foundation of the J11 "Compose two programs" lesson.
  it('two customPrograms in series — output of A becomes input of B', () => {
    const upper = `function transform(input) { return input.toUpperCase(); }`;
    const reverse = `function transform(input) { return input.split("").reverse().join(""); }`;
    const r = simulate(
      makePuzzle([{ input: 'hello', expected: 'OLLEH' }]),
      [
        node('in', 'textInput'),
        node('a', 'customProgram', { code: upper }),
        node('b', 'customProgram', { code: reverse }),
        node('out', 'textOutput'),
      ],
      [edge('in', 'a'), edge('a', 'b'), edge('b', 'out')],
    );
    expect(r.passedCount).toBe(1);
    expect(r.caseResults[0].actual).toBe('OLLEH');
  });
});

describe('dataflow simulator — error handling', () => {
  it('a program that throws becomes pass-through identity and surfaces an error', () => {
    const code = `function transform(input) { throw new Error('boom'); }`;
    const r = simulate(
      makePuzzle([{ input: 'hi', expected: 'hi' }]),
      [
        node('in', 'textInput'),
        node('prog', 'customProgram', { code, displayLabel: 'Bad' }),
        node('out', 'textOutput'),
      ],
      [edge('in', 'prog'), edge('prog', 'out')],
    );
    // Identity passthrough means the input reaches the output unchanged.
    expect(r.caseResults[0].actual).toBe('hi');
    // The case ACCIDENTALLY passes here (expected matches passthrough);
    // the error is still reported so the player sees what happened.
    expect(r.caseResults[0].programErrors.length).toBeGreaterThan(0);
    expect(r.caseResults[0].programErrors[0].error).toMatch(/boom/);
  });

  it('a program without a transform() function surfaces a clear error', () => {
    const r = simulate(
      makePuzzle([{ input: 'hi', expected: 'hi' }]),
      [
        node('in', 'textInput'),
        node('prog', 'customProgram', { code: 'const x = 1;' }),
        node('out', 'textOutput'),
      ],
      [edge('in', 'prog'), edge('prog', 'out')],
    );
    expect(r.caseResults[0].programErrors[0].error).toMatch(/No `function transform/);
  });

  it('coerces a non-string return to a string', () => {
    const code = `function transform(input) { return input.length; }`; // number
    const r = simulate(
      makePuzzle([{ input: 'hello', expected: '5' }]),
      [
        node('in', 'textInput'),
        node('prog', 'customProgram', { code }),
        node('out', 'textOutput'),
      ],
      [edge('in', 'prog'), edge('prog', 'out')],
    );
    expect(r.passedCount).toBe(1);
    expect(r.caseResults[0].actual).toBe('5');
  });
});

describe('dataflow simulator — graph validation', () => {
  it('warns when a customProgram has no upstream input wired', () => {
    const code = `function transform(input) { return input; }`;
    const r = simulate(
      makePuzzle(),
      [
        node('prog', 'customProgram', { code }),
        node('out', 'textOutput'),
      ],
      [edge('prog', 'out')],
    );
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => /no input/i.test(w))).toBe(true);
  });

  it('warns when a textOutput has no upstream input wired', () => {
    const r = simulate(
      makePuzzle(),
      [node('out', 'textOutput')],
      [],
    );
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => /nothing to display/i.test(w))).toBe(true);
  });
});
