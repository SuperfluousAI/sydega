// Hand-maintained changelog. Newest entry first. The `version` is used as
// the localStorage seen-marker — when changelog[0].version differs from the
// last-seen value, the bell shows a red dot.
//
// Adding an entry: prepend a new {version, date, entries} object. Bump the
// version string (use the date — it's monotonic and self-documenting).

export const changelog = [
  {
    version: '2026-05-14c',
    date: '2026-05-14',
    entries: [
      'JavaScript Sandbox track — 12 new lessons (J1-J12) that teach JS using the dataflow graph. Click the "JavaScript" pill at the top of the lessons list to switch tracks. Each lesson is a Text Input → Custom Program → Text Output graph; you write JS in the Custom Program and watch the canvas grade it against test cases.',
      'Text Input + Text Output components — strings flow on wires. Edit the Text Input value directly on the node; the Text Output shows whatever string the simulator pipes into it.',
      'Custom Program editor: syntax highlighting, line numbers, tab-to-indent. Same component you can drop into systems-design lessons (L22) or JS Sandbox lessons.',
      'Per-lesson clear (✕ on the green check) + this changelog bell + collapsible Properties pane on the right.',
    ],
  },
  {
    version: '2026-05-13',
    date: '2026-05-13',
    entries: [
      'Lesson reading area now lives on the top-pane left side too (in addition to the right column).',
      'Lessons list scrolls when long — ▲▼ hints show when there\'s more above/below.',
      'Lesson 1: dropping a component near the Computer\'s edge no longer pushes the Computer down.',
    ],
  },
  {
    version: '2026-05-12',
    date: '2026-05-12',
    entries: [
      'Lesson 19.2: Search at scale — inverted indexes, sharding by term vs document.',
      'Hint button: progressive reveal places the next canonical piece, one step at a time.',
    ],
  },
];

export const currentVersion = changelog[0]?.version || null;
