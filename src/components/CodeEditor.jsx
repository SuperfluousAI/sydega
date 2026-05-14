import { useLayoutEffect, useMemo, useRef } from 'react';
import { highlightJs } from '../lib/highlightJs.js';

// Textarea-on-top-of-<pre> editor. The textarea has transparent text +
// visible caret; a syntax-highlighted <pre> sits directly behind it,
// pixel-aligned by sharing font, padding, and line-height. On every
// keystroke the highlighter regenerates the overlay; on scroll we mirror
// the textarea's scroll offsets onto the <pre>.
//
// Trailing newline trick: the overlay needs a trailing space character
// after the user's final newline so the <pre>'s last line has height —
// otherwise the highlighted last line appears empty even though the
// textarea has content there. See `displayCode` below.

export default function CodeEditor({
  value,
  onChange,
  rows = 14,
  ariaLabel = 'JavaScript code',
}) {
  const taRef = useRef(null);
  const preRef = useRef(null);

  const gutterRef = useRef(null);

  // Add a trailing space so the <pre> renders the last line at full height
  // even when the user's value ends with \n. Without this, the highlighted
  // overlay shrinks below the textarea by one line.
  const displayCode = useMemo(() => {
    const v = typeof value === 'string' ? value : '';
    return v.endsWith('\n') ? v + ' ' : v;
  }, [value]);

  const highlighted = useMemo(() => highlightJs(displayCode), [displayCode]);

  // Line numbers: one per newline (+1 for the first line). The gutter
  // scrolls vertically in sync with the textarea — we don't sync
  // horizontally because the gutter is a fixed-width column.
  const lineCount = useMemo(() => {
    const v = typeof value === 'string' ? value : '';
    if (v === '') return 1;
    // Count newlines that aren't the trailing one — the textarea shows
    // the line after a trailing \n as an empty line, and so should we.
    let count = 1;
    for (let i = 0; i < v.length; i += 1) if (v.charCodeAt(i) === 10) count += 1;
    return count;
  }, [value]);

  // Pad the gutter width to the digit count of the highest line. Done in
  // ch units so it stays correct across font sizes.
  const gutterChars = String(lineCount).length;

  // Re-sync scroll on every value change — if a programmatic edit pushes
  // the textarea's scroll, the overlay + gutter should follow.
  useLayoutEffect(() => {
    const ta = taRef.current;
    const pre = preRef.current;
    const gutter = gutterRef.current;
    if (!ta) return;
    if (pre) {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    }
    if (gutter) gutter.scrollTop = ta.scrollTop;
  }, [highlighted]);

  const handleScroll = (e) => {
    const pre = preRef.current;
    const gutter = gutterRef.current;
    if (pre) {
      pre.scrollTop = e.target.scrollTop;
      pre.scrollLeft = e.target.scrollLeft;
    }
    // Gutter scrolls vertically only — its content is a single fixed-width
    // column of numbers, so horizontal sync isn't meaningful.
    if (gutter) gutter.scrollTop = e.target.scrollTop;
  };

  // Tab inserts 2 spaces instead of moving focus — typical code-editor
  // behavior. Shift+Tab is a no-op here (no proper dedent logic yet).
  const handleKeyDown = (e) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const ta = e.target;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = value.slice(0, start) + '  ' + value.slice(end);
      onChange(next);
      // Restore caret AFTER the inserted spaces. The React-controlled value
      // updates on the next render, so defer the selection mutation.
      requestAnimationFrame(() => {
        ta.selectionStart = start + 2;
        ta.selectionEnd = start + 2;
      });
    }
  };

  return (
    <div className="code-editor" style={{ '--gutter-ch': `${gutterChars}` }}>
      <div ref={gutterRef} className="code-editor-gutter" aria-hidden="true">
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} className="code-editor-line-number">{i + 1}</div>
        ))}
      </div>
      <pre
        ref={preRef}
        className="code-editor-overlay"
        aria-hidden="true"
        // Highlighter output is HTML-escaped per-token (see highlightJs.js),
        // so injection is safe.
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
      <textarea
        ref={taRef}
        className="code-editor-input"
        value={value ?? ''}
        rows={rows}
        spellCheck={false}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        // Browsers add autocompletion suggestions on textareas; suppress them
        // so the editor doesn't render an OS-level dropdown of past values.
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />
    </div>
  );
}
