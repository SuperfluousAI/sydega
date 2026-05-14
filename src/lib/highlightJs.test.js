import { describe, it, expect } from 'vitest';
import { highlightJs } from './highlightJs.js';

describe('highlightJs', () => {
  it('returns empty string for empty input', () => {
    expect(highlightJs('')).toBe('');
    expect(highlightJs(null)).toBe('');
    expect(highlightJs(undefined)).toBe('');
  });

  it('wraps keywords in tok-keyword', () => {
    const out = highlightJs('function transform() { return 1; }');
    expect(out).toMatch(/<span class="tok-keyword">function<\/span>/);
    expect(out).toMatch(/<span class="tok-keyword">return<\/span>/);
  });

  it('wraps single-line comments and stops at the newline', () => {
    const out = highlightJs('// this is a comment\nlet x = 1;');
    expect(out).toMatch(/<span class="tok-comment">\/\/ this is a comment<\/span>/);
    // Newline survives outside the span so the overlay aligns line-by-line
    // with the textarea below it.
    expect(out.indexOf('let')).toBeGreaterThan(out.indexOf('comment</span>'));
  });

  it('wraps block comments across multiple lines', () => {
    const code = '/* line one\n   line two */\nconst x = 1;';
    const out = highlightJs(code);
    expect(out).toMatch(/<span class="tok-comment">\/\* line one\n   line two \*\/<\/span>/);
  });

  it('wraps single-quoted, double-quoted, and template strings', () => {
    expect(highlightJs("'hello'")).toMatch(/<span class="tok-string">'hello'<\/span>/);
    expect(highlightJs('"hello"')).toMatch(/<span class="tok-string">"hello"<\/span>/);
    expect(highlightJs('`hello`')).toMatch(/<span class="tok-string">`hello`<\/span>/);
  });

  it('handles escaped quotes inside strings', () => {
    const out = highlightJs("'it\\'s'");
    expect(out).toMatch(/<span class="tok-string">'it\\'s'<\/span>/);
  });

  it('wraps numbers including decimals and exponents', () => {
    expect(highlightJs('42')).toMatch(/<span class="tok-number">42<\/span>/);
    expect(highlightJs('3.14')).toMatch(/<span class="tok-number">3\.14<\/span>/);
    expect(highlightJs('1e10')).toMatch(/<span class="tok-number">1e10<\/span>/);
  });

  it('wraps known literals (true, false, null, NaN, Infinity)', () => {
    const out = highlightJs('true false null NaN Infinity');
    expect(out).toMatch(/<span class="tok-literal">true<\/span>/);
    expect(out).toMatch(/<span class="tok-literal">false<\/span>/);
    expect(out).toMatch(/<span class="tok-literal">null<\/span>/);
    expect(out).toMatch(/<span class="tok-literal">NaN<\/span>/);
    expect(out).toMatch(/<span class="tok-literal">Infinity<\/span>/);
  });

  it('classifies built-in objects (Math, JSON, etc.) as tok-builtin', () => {
    const out = highlightJs('Math.min(1, 2)');
    expect(out).toMatch(/<span class="tok-builtin">Math<\/span>/);
  });

  it('classifies identifiers followed by ( as tok-function', () => {
    const out = highlightJs('foo()');
    expect(out).toMatch(/<span class="tok-function">foo<\/span>/);
  });

  it('classifies plain identifiers as tok-ident', () => {
    const out = highlightJs('let myVar = 1;');
    expect(out).toMatch(/<span class="tok-ident">myVar<\/span>/);
  });

  // SECURITY CONTRACT: the highlighter output is injected via dangerouslySet-
  // InnerHTML. If user code contains "<script>" we must escape it to keep
  // the page safe.
  it('escapes HTML special characters in user code', () => {
    const out = highlightJs('let x = "<script>alert(1)</script>";');
    expect(out).not.toMatch(/<script>/);
    expect(out).toMatch(/&lt;script&gt;/);
  });

  it('passes whitespace and newlines through unchanged', () => {
    const out = highlightJs('a\n\nb');
    // Two consecutive newlines preserved.
    expect(out).toMatch(/a<\/span>\n\n<span/);
  });

  it('a realistic transform() body highlights without losing characters', () => {
    const code = [
      '// Throttle to 1000',
      'function transform(input) {',
      '  return {',
      '    readOut: Math.min(input.readIn, 1000),',
      '    writeOut: input.writeIn,',
      '  };',
      '}',
    ].join('\n');
    const out = highlightJs(code);
    // Round-trip: stripping HTML tags should give us back the original code
    // (plus HTML-entity escapes, which we decode here for the comparison).
    const stripped = out
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    expect(stripped).toBe(code);
  });
});
