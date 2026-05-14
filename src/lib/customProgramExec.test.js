import { describe, it, expect } from 'vitest';
import { runCustomProgram } from './customProgramExec.js';

const baseInput = {
  readIn: 100,
  writeIn: 20,
  totalIn: 120,
  latencyIn: 5,
  p99LatencyIn: 15,
};

describe('runCustomProgram — happy path', () => {
  it('returns the transform output for valid code', () => {
    const code = `
      function transform(input) {
        return {
          readOut: input.readIn / 2,
          writeOut: 0,
          latencyAdd: 7,
          p99LatencyAdd: 21,
        };
      }
    `;
    const { output, error } = runCustomProgram(code, baseInput);
    expect(error).toBeNull();
    expect(output.readOut).toBe(50);
    expect(output.writeOut).toBe(0);
    expect(output.latencyAdd).toBe(7);
    expect(output.p99LatencyAdd).toBe(21);
  });

  it('treats empty / whitespace code as identity (no error)', () => {
    const { output, error } = runCustomProgram('   \n  ', baseInput);
    expect(error).toBeNull();
    expect(output.readOut).toBe(100);
    expect(output.writeOut).toBe(20);
    expect(output.latencyAdd).toBe(0);
    expect(output.p99LatencyAdd).toBe(0);
  });
});

describe('runCustomProgram — error handling', () => {
  it('surfaces compile errors and degrades to identity', () => {
    const code = 'function transform(input { return {} }'; // syntax error
    const { output, error } = runCustomProgram(code, baseInput);
    expect(error).toMatch(/Compile/);
    expect(output.readOut).toBe(100);
    expect(output.writeOut).toBe(20);
  });

  it('surfaces runtime errors and degrades to identity', () => {
    const code = `
      function transform(input) {
        throw new Error('boom');
      }
    `;
    const { output, error } = runCustomProgram(code, baseInput);
    expect(error).toMatch(/Run: boom/);
    expect(output.readOut).toBe(100);
  });

  it('reports a missing transform function', () => {
    const code = 'const x = 1;'; // no `function transform`
    const { output, error } = runCustomProgram(code, baseInput);
    expect(error).toMatch(/No `function transform/);
    expect(output.readOut).toBe(100);
  });

  it('rejects non-object returns', () => {
    const code = `
      function transform(input) { return 42; }
    `;
    const { output, error } = runCustomProgram(code, baseInput);
    expect(error).toMatch(/non-object/);
    expect(output.readOut).toBe(100);
  });
});

describe('runCustomProgram — coercion', () => {
  it('coerces missing numeric fields to safe defaults', () => {
    const code = `
      function transform(input) {
        return { readOut: input.readIn };
        // writeOut / latencyAdd / p99LatencyAdd omitted
      }
    `;
    const { output, error } = runCustomProgram(code, baseInput);
    expect(error).toBeNull();
    expect(output.readOut).toBe(100);
    expect(output.writeOut).toBe(20); // fall back to input.writeIn
    expect(output.latencyAdd).toBe(0);
    expect(output.p99LatencyAdd).toBe(0);
  });

  it('rejects negative numbers and falls back', () => {
    const code = `
      function transform(input) {
        return { readOut: -50, writeOut: -1, latencyAdd: -5, p99LatencyAdd: -1 };
      }
    `;
    const { output, error } = runCustomProgram(code, baseInput);
    expect(error).toBeNull();
    // Negative numbers fall back to defaults (input.readIn / writeIn / 0).
    expect(output.readOut).toBe(100);
    expect(output.writeOut).toBe(20);
    expect(output.latencyAdd).toBe(0);
    expect(output.p99LatencyAdd).toBe(0);
  });

  it('rejects NaN / Infinity and falls back', () => {
    const code = `
      function transform(input) {
        return { readOut: NaN, writeOut: Infinity, latencyAdd: 'oops', p99LatencyAdd: undefined };
      }
    `;
    const { output, error } = runCustomProgram(code, baseInput);
    expect(error).toBeNull();
    expect(output.readOut).toBe(100);
    expect(output.writeOut).toBe(20);
    expect(output.latencyAdd).toBe(0);
    expect(output.p99LatencyAdd).toBe(0);
  });
});
