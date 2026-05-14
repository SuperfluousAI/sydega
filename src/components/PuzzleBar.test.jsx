import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import PuzzleBar from './PuzzleBar.jsx';

const PUZZLE_WITH_BLURB = {
  order: 2,
  title: 'On the Home Network',
  blurb: 'A short slug shown under the title. More detail after the first sentence.',
  kind: 'composition',
  requirements: [],
};

const PUZZLE_WITH_SLUG = {
  order: 14,
  title: 'Stream Processing at Scale',
  slug: 'Explicit one-liner from the puzzle definition.',
  blurb: 'Long blurb that should not appear under the title when slug is set.',
  kind: 'flow',
  requirements: [],
};

function setup(puzzle, props = {}) {
  return render(
    <PuzzleBar
      puzzle={puzzle}
      simResult={null}
      evaluation={{ passed: false, results: [] }}
      onRun={() => {}}
      onReset={() => {}}
      {...props}
    />
  );
}

describe('PuzzleBar top-pane reading area', () => {
  const PUZZLE_WITH_READING = {
    order: 19,
    title: 'E-commerce',
    slug: 'short slug',
    background: ['First paragraph of background.', 'Second paragraph.'],
    sources: [
      { title: 'Source A', url: 'https://example.com/a', note: 'note' },
      { title: 'Source B', url: 'https://example.com/b' },
    ],
    kind: 'flow',
    requirements: [],
  };

  it('renders the reading area inside .puzzle-info on the LEFT side of the top pane', () => {
    const { container } = setup(PUZZLE_WITH_READING);
    const wrap = container.querySelector('.puzzle-reading-wrap');
    expect(wrap).not.toBeNull();
    // Must live inside the puzzle-info column (left), NOT inside puzzle-results-wrap (right).
    expect(wrap.closest('.puzzle-info')).not.toBeNull();
    expect(wrap.closest('.puzzle-results-wrap')).toBeNull();
  });

  it('renders every background paragraph + every source link', () => {
    const { container } = setup(PUZZLE_WITH_READING);
    const paras = container.querySelectorAll('.puzzle-reading-para');
    expect(paras.length).toBe(2);
    expect(paras[0].textContent).toBe('First paragraph of background.');
    const links = container.querySelectorAll('.puzzle-reading-sources a');
    expect(links.length).toBe(2);
    expect(links[0].textContent).toBe('Source A');
    expect(links[0].getAttribute('href')).toBe('https://example.com/a');
  });

  it('does NOT render the reading wrap when the puzzle has no background, sources, or blurb', () => {
    const PUZZLE_EMPTY = { order: 1, title: 'Empty', kind: 'composition', requirements: [] };
    const { container } = setup(PUZZLE_EMPTY);
    expect(container.querySelector('.puzzle-reading-wrap')).toBeNull();
  });

  // Since LessonPanel was removed, the top-pane reading area must surface
  // the full blurb whenever a lesson has no `background[]`. Previously
  // only the first sentence (as the slug) would show, losing multi-
  // sentence intros.
  it('falls back to rendering the full blurb in the reading area when there is no background', () => {
    const { container } = setup(PUZZLE_WITH_BLURB);
    const paras = container.querySelectorAll('.puzzle-reading-para');
    expect(paras.length).toBe(1);
    expect(paras[0].textContent).toBe(PUZZLE_WITH_BLURB.blurb);
  });

  // And in that fallback the slug under the title is suppressed so the
  // first sentence doesn't render twice.
  it('suppresses the slug under the title when falling back to the full blurb', () => {
    const { container } = setup(PUZZLE_WITH_BLURB);
    expect(container.querySelector('.puzzle-slug')).toBeNull();
  });
});

describe('PuzzleBar changelog bell', () => {
  // VISUAL CONTRACT: the bell must live INSIDE the puzzle-bar (so it
  // anchors to the top-right corner via the bar's position: relative).
  // Rendering elsewhere would put it in the wrong place visually.
  it('renders the changelog bell inside .puzzle-bar', () => {
    const { container } = setup(PUZZLE_WITH_BLURB);
    const bell = container.querySelector('.changelog-bell');
    expect(bell).not.toBeNull();
    expect(bell.closest('.puzzle-bar')).not.toBeNull();
  });
});

describe('PuzzleBar slug rendering', () => {
  const PUZZLE_WITH_BACKGROUND_AND_BLURB = {
    order: 2,
    title: 'Has Background',
    blurb: 'A short slug shown under the title. More detail after the first sentence.',
    background: ['Some background paragraph.'],
    kind: 'composition',
    requirements: [],
  };

  it('uses the first sentence of the blurb as a slug when the puzzle has background', () => {
    const { container } = setup(PUZZLE_WITH_BACKGROUND_AND_BLURB);
    const slug = container.querySelector('.puzzle-slug');
    expect(slug).not.toBeNull();
    expect(slug.textContent).toMatch(/A short slug shown under the title\./);
    expect(slug.textContent).not.toMatch(/More detail/);
  });

  it('prefers an explicit `slug` over the blurb when set', () => {
    const { container } = setup(PUZZLE_WITH_SLUG);
    const slug = container.querySelector('.puzzle-slug');
    expect(slug.textContent).toBe('Explicit one-liner from the puzzle definition.');
  });
});

describe('PuzzleBar hint button', () => {
  const PUZZLE_WITH_SOLUTION = {
    ...PUZZLE_WITH_BLURB,
    solution: () => ({ nodes: [], edges: [] }),
  };

  it('renders the Hint button when the puzzle has a solution and onHint is provided', () => {
    const { container } = setup(PUZZLE_WITH_SOLUTION, { onHint: () => {} });
    const btn = container.querySelector('.hint-button');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toMatch(/Hint/);
  });

  // VISUAL CONTRACT: the hint button must live inside .puzzle-actions, not
  // some other container — otherwise it could render but be invisible /
  // mispositioned in the chrome. Component tests that only check existence
  // miss this class of bug.
  it('places the Hint button INSIDE .puzzle-actions', () => {
    const { container } = setup(PUZZLE_WITH_SOLUTION, { onHint: () => {} });
    const btn = container.querySelector('.hint-button');
    expect(btn).not.toBeNull();
    expect(btn.closest('.puzzle-actions')).not.toBeNull();
  });

  // VISUAL CONTRACT: the Hint button sits between Undo and Show Solution
  // in DOM order, so the user sees the buttons in a stable, predictable
  // sequence. Reorder regression = button shifts where the user doesn't
  // expect it.
  it('orders the action buttons Run → Undo → Hint → Show solution → Reset', () => {
    const { container } = setup(PUZZLE_WITH_SOLUTION, {
      onHint: () => {},
      onShowSolution: () => {},
      onUndo: () => {},
      canUndo: true,
    });
    const buttons = Array.from(container.querySelectorAll('.puzzle-actions > button'));
    const labels = buttons.map((b) => b.textContent.trim());
    expect(labels).toEqual([
      expect.stringMatching(/Run/),
      expect.stringMatching(/Undo/),
      expect.stringMatching(/Hint/),
      expect.stringMatching(/Show solution/),
      expect.stringMatching(/Reset/),
    ]);
  });

  it('does not render the Hint button when the puzzle has no solution', () => {
    const { container } = setup(PUZZLE_WITH_BLURB, { onHint: () => {} });
    expect(container.querySelector('.hint-button')).toBeNull();
  });

  it('does not render the Hint button when onHint is missing', () => {
    const { container } = setup(PUZZLE_WITH_SOLUTION);
    expect(container.querySelector('.hint-button')).toBeNull();
  });

  // The sidebar hint duplicate was removed — the canvas banner (in
  // App.test.jsx) is now the single source of truth. PuzzleBar itself only
  // renders the Hint *button*; the message lives on the canvas.
  it('does not render any sidebar hint message inside .puzzle-actions', () => {
    const { container } = setup(PUZZLE_WITH_SOLUTION, { onHint: () => {} });
    expect(container.querySelector('.puzzle-hint-message')).toBeNull();
  });

  it('calls onHint when the button is clicked', () => {
    let called = 0;
    const { container } = setup(PUZZLE_WITH_SOLUTION, { onHint: () => { called += 1; } });
    container.querySelector('.hint-button').click();
    expect(called).toBe(1);
  });
});
