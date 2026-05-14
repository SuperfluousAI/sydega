import { describe, it, expect } from 'vitest';
import { findHintRationale, findHintEdgeRationale } from './hintRationale.js';

function node(type, role) {
  const config = role ? { role } : {};
  return { id: `${type}-1`, data: { type, config } };
}

describe('findHintRationale', () => {
  it('returns the matching presence-predicate requirement lesson', () => {
    const puzzle = {
      requirements: [
        {
          key: 'hasRouter',
          predicate: { kind: 'presence', type: 'router', min: 1 },
          lesson: 'The Router is what creates the home network — without it, no LAN.',
        },
      ],
    };
    const rationale = findHintRationale(puzzle, node('router'));
    expect(rationale).toMatch(/Router is what creates the home network/);
  });

  it('honors role on presence predicates (matching role wins, others ignored)', () => {
    const puzzle = {
      requirements: [
        {
          predicate: { kind: 'presence', type: 'database', role: 'metadata', min: 1 },
          lesson: 'Metadata DB stores filenames and ownership.',
        },
        {
          predicate: { kind: 'presence', type: 'database', role: 'blob', min: 1 },
          lesson: 'Blob storage holds the actual file bytes.',
        },
      ],
    };
    expect(findHintRationale(puzzle, node('database', 'metadata'))).toMatch(/Metadata DB/);
    expect(findHintRationale(puzzle, node('database', 'blob'))).toMatch(/Blob storage/);
  });

  it('falls back to label-mention match when no presence predicate exists', () => {
    const puzzle = {
      requirements: [
        {
          key: 'hasCache',
          test: () => true,
          label: 'A Cache fronts the Database',
          lesson: 'A Cache absorbs read traffic before it hits the DB.',
        },
      ],
    };
    // Works whether the node carries a role (typical for placed solution
    // nodes) or not (the helper falls back to scanning all role labels for
    // role-aware types).
    expect(findHintRationale(puzzle, node('cache', 'internal'))).toMatch(/Cache absorbs read traffic/);
    expect(findHintRationale(puzzle, node('cache'))).toMatch(/Cache absorbs read traffic/);
  });

  it('falls back to componentInfo.description when no requirement matches', () => {
    const puzzle = { requirements: [] };
    const rationale = findHintRationale(puzzle, node('disk'));
    expect(rationale).toMatch(/Long-term storage/);
  });

  it('returns null when node has no type', () => {
    expect(findHintRationale({ requirements: [] }, { data: {} })).toBeNull();
  });

  it('returns null for a totally unknown type with no matching requirement', () => {
    const puzzle = { requirements: [] };
    expect(findHintRationale(puzzle, { data: { type: 'made-up-thing', config: {} } })).toBeNull();
  });

  it('does not match a label substring (whole-word only)', () => {
    // The Cache label should not match a requirement that only mentions
    // "CacheControl" — `\b` regex boundaries enforce whole-word matching.
    // Note: the lesson string mentions "Cache" as a whole word too, so the
    // distinguishing requirement must talk only about CacheControl.
    const puzzle = {
      requirements: [
        {
          test: () => true,
          label: 'Tune CacheControl headers',
          lesson: 'HTTP header tuning only.',
        },
      ],
    };
    const rationale = findHintRationale(puzzle, node('cache', 'internal'));
    // The label/lesson contains "CacheControl" but not "Cache" as a whole
    // word — so the helper falls through to componentInfo.
    expect(rationale).not.toBe('HTTP header tuning only.');
    expect(typeof rationale).toBe('string');
  });
});

describe('findHintEdgeRationale', () => {
  it('returns the target node\'s rationale by default', () => {
    const puzzle = {
      requirements: [
        {
          predicate: { kind: 'presence', type: 'cache', min: 1 },
          lesson: 'Cache reduces DB load.',
        },
      ],
    };
    const rationale = findHintEdgeRationale(puzzle, node('appServer'), node('cache'));
    expect(rationale).toMatch(/Cache reduces DB load/);
  });

  it('falls back to source rationale when target has none', () => {
    const puzzle = {
      requirements: [
        {
          predicate: { kind: 'presence', type: 'router', min: 1 },
          lesson: 'Router creates the LAN.',
        },
      ],
    };
    // appServer has componentInfo so target won't be null. Try with a
    // synthetic "no-info" target.
    const synthetic = { data: { type: 'nothing-known', config: {} } };
    const rationale = findHintEdgeRationale(puzzle, node('router'), synthetic);
    expect(rationale).toMatch(/Router creates the LAN/);
  });
});
