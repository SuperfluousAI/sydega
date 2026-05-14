// Hand-maintained changelog. Newest entry first. The `version` is used as
// the localStorage seen-marker — when changelog[0].version differs from the
// last-seen value, the bell shows a red dot.
//
// Adding an entry: prepend a new {version, date, entries} object. Bump the
// version string (use the date — it's monotonic and self-documenting).

export const changelog = [
  {
    version: '2026-05-14g',
    date: '2026-05-14',
    entries: [
      'Lesson 1 fix: clicking Hint repeatedly used to make the Computer\'s frame visually grow outward to wrap each newly-placed child — the children landed at canonical positions sized for a 420×240 Computer but the user\'s Computer was only 340×220, so each child overhung and the frame stretched to cover it. The initial Computer is now 420×240, matching the canonical layout, so children fit cleanly and the frame stays anchored.',
    ],
  },
  {
    version: '2026-05-14f',
    date: '2026-05-14',
    entries: [
      'Step-aware Hint button — the Hint now matches your existing canvas to the canonical solution by TYPE (not by node id), so it advances PAST what you\'ve already placed instead of duplicating it. If you placed a CPU on Lesson 1 and click Hint, it now suggests RAM next (the actual next missing piece). When you have the right type of component but in the wrong place (e.g. a CPU on the canvas instead of inside a Computer), the Hint will tell you to move it rather than placing a second one.',
      'Per-puzzle hint() override hook: any lesson can define its own hint(state) → action function and the matcher uses that first. Falls back to the default matcher if the override returns null or throws.',
      'When the canonical solution is fully placed but the puzzle isn\'t passing, the Hint now reads out the first failing requirement\'s explanation instead of saying "all canonical pieces are placed."',
    ],
  },
  {
    version: '2026-05-14e',
    date: '2026-05-14',
    entries: [
      'Difficulty tags on every lesson — easy / medium / hard. Each row carries a small colored dot next to the lesson number.',
      'Sort & filter — new button under the track toggle in the lessons list. Sort by number or by difficulty; filter to show only the difficulties you want.',
      'Lesson 1 layout: Program is now visually centered below the Computer rather than tucked into the upper-left corner.',
    ],
  },
  {
    version: '2026-05-14d',
    date: '2026-05-14',
    entries: [
      'Lesson 1 disorientation fix — the Computer frame no longer scales up when you drag a component onto it. The outline + pulse still highlight the drop target; the perceived "parent is moving" was a 1.5% scale transform on hover that has been removed.',
    ],
  },
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
