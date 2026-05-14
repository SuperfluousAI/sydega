// Tiny single-purpose JavaScript syntax highlighter for the Custom Program
// code editor. Covers the 90% case (comments, strings, keywords, numbers,
// function names, identifiers) — edge cases like regex literals and nested
// template-literal expressions fall back to "identifier" classification,
// which is fine: they render as plain text instead of a syntax error.
//
// Returns HTML with `<span class="tok-...">` wrappers. The HTML is safe to
// inject via dangerouslySetInnerHTML because every value passed through
// `escapeHtml()` first.

const KEYWORDS = new Set([
  'function', 'return', 'const', 'let', 'var', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'default', 'break', 'continue', 'new', 'typeof',
  'instanceof', 'in', 'of', 'this', 'class', 'extends', 'super', 'throw',
  'try', 'catch', 'finally', 'async', 'await', 'yield', 'delete', 'void',
  'import', 'export', 'from', 'as',
]);

const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);

const BUILTINS = new Set([
  'Math', 'Number', 'String', 'Array', 'Object', 'JSON', 'console', 'Date',
  'RegExp', 'Boolean', 'Symbol', 'Map', 'Set', 'Promise', 'Error',
]);

// Each pattern is tried in order at the current cursor position. Sticky (`y`)
// regex means it only matches if it can start exactly at lastIndex — no
// "look ahead and find this anywhere later." That gives us a clean linear
// scan from start to end.
const PATTERNS = [
  // Block comment must come before single-line so `/* // */` is one token.
  ['comment', /\/\*[\s\S]*?\*\//y],
  ['comment', /\/\/[^\n]*/y],
  // Strings: handle escape sequences inside so `'\\''` is one string, not two.
  ['string',  /"(?:[^"\\]|\\.)*"/y],
  ['string',  /'(?:[^'\\]|\\.)*'/y],
  ['string',  /`(?:[^`\\]|\\.)*`/y],
  ['number',  /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y],
  // Identifier — classified post-match (keyword/literal/builtin/function/ident).
  ['ident',   /[a-zA-Z_$][a-zA-Z0-9_$]*/y],
  ['punct',   /[{}()[\];,.+\-*/%<>=!&|?:~^]/y],
];

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Classify a bare identifier into the right token class. Function calls are
// detected by looking ahead for an open paren — that's good enough for the
// teaching use case (it'll also "highlight" `if (` as a function, but `if`
// is already caught as a keyword first).
function classifyIdent(word, rest) {
  if (KEYWORDS.has(word)) return 'keyword';
  if (LITERALS.has(word)) return 'literal';
  if (BUILTINS.has(word)) return 'builtin';
  if (/^\s*\(/.test(rest)) return 'function';
  return 'ident';
}

export function highlightJs(code) {
  if (typeof code !== 'string' || code === '') return '';
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    let matched = false;
    for (const [klass, re] of PATTERNS) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m && m.index === i) {
        let actualClass = klass;
        if (klass === 'ident') {
          actualClass = classifyIdent(m[0], code.slice(i + m[0].length));
        }
        out += `<span class="tok-${actualClass}">${escapeHtml(m[0])}</span>`;
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Whitespace and anything else not covered — pass through unstyled.
      // Trailing newline matters for the overlay to size correctly behind
      // the textarea, so we preserve it verbatim.
      out += escapeHtml(code[i]);
      i += 1;
    }
  }
  return out;
}
