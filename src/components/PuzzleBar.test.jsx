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

describe('PuzzleBar slug rendering', () => {
  it('uses the first sentence of the blurb as a slug under the title', () => {
    const { container } = setup(PUZZLE_WITH_BLURB);
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

  it('does not render the blurb in the puzzle-info area when an explicit slug is set', () => {
    const { container } = setup(PUZZLE_WITH_SLUG);
    const info = container.querySelector('.puzzle-info');
    expect(info.textContent).not.toContain('Long blurb');
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
