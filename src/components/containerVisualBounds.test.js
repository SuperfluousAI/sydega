// CSS-contract tests. These read App.css as text and assert the rules that
// keep a node's VISIBLE perimeter inside its React-Flow bounds. Without
// these, a 1px or 2px border on a non-border-box element pushes the visible
// edge outside the bounds, and floating-edge endpoints (computed from the
// React-Flow bounds in edgeGeometry) end up VISUALLY inside the node body.
//
// The test is intentionally coarse (regex over the file) — we don't have
// real layout in jsdom, so this is the cheapest defense against the class
// of bug the operator caught in Lesson 2.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = join(__dirname, '..', 'App.css');
const css = readFileSync(cssPath, 'utf-8');

// Pull a CSS rule's body by selector (the chunk between `{` and matching `}`).
// Naive: assumes selectors don't contain `{`. Adequate for our small App.css.
function ruleBody(selector) {
  const idx = css.indexOf(selector + ' {');
  if (idx === -1) return null;
  const start = css.indexOf('{', idx);
  let depth = 1;
  let i = start + 1;
  while (i < css.length && depth > 0) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    i++;
  }
  return css.slice(start + 1, i - 1);
}

describe('container visual bounds match React-Flow node bounds', () => {
  it('.computer-frame uses box-sizing: border-box', () => {
    const body = ruleBody('.computer-frame');
    expect(body).not.toBeNull();
    expect(body).toMatch(/box-sizing:\s*border-box/);
  });

  it('.system-node uses box-sizing: border-box', () => {
    const body = ruleBody('.system-node');
    expect(body).not.toBeNull();
    expect(body).toMatch(/box-sizing:\s*border-box/);
  });

  it('.floating-handle:hover does NOT override transform', () => {
    // Overriding `transform` clobbers React Flow's per-side handle positioning
    // (Position.Right uses translate(50%, -50%), Bottom uses translate(-50%, 50%),
    // etc). A hover state that sets `transform: translate(-50%, -50%) scale(1.5)`
    // yanks the right/bottom handles inward, hiding them inside the node body.
    // The fix is to bump width/height for the hover-grow, not transform.
    const body = ruleBody('.react-flow__handle.floating-handle:hover');
    expect(body).not.toBeNull();
    expect(body).not.toMatch(/transform\s*:/);
  });
});
