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
