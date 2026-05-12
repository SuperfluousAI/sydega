import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import PuzzleBar from './PuzzleBar.jsx';

const PUZZLE_WITH_BACKGROUND = {
  order: 2,
  title: 'On the Home Network',
  blurb: 'A short slug shown under the title.',
  kind: 'composition',
  background: [
    'First paragraph of the full reading.',
    'Second paragraph — provides more depth.',
  ],
  requirements: [],
};
const PUZZLE_WITHOUT_BACKGROUND = {
  order: 3,
  title: 'Point a Domain',
  blurb: 'No reading available.',
  kind: 'connectivity',
  requirements: [],
};

function setup(props = {}) {
  return render(
    <PuzzleBar
      puzzle={PUZZLE_WITH_BACKGROUND}
      simResult={null}
      evaluation={{ passed: false, results: [] }}
      onRun={() => {}}
      onReset={() => {}}
      readingExpanded={false}
      onToggleReading={() => {}}
      {...props}
    />
  );
}

describe('PuzzleBar inline reading expander', () => {
  it('renders the slug (blurb) under the title', () => {
    const { container } = setup();
    expect(container.textContent).toContain(PUZZLE_WITH_BACKGROUND.blurb);
  });

  it('shows a toggle button when the puzzle has background paragraphs', () => {
    const { container } = setup();
    const btn = container.querySelector('.reading-toggle');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toMatch(/Read full lesson/);
  });

  it('does NOT show the toggle when there is no background', () => {
    const { container } = render(
      <PuzzleBar
        puzzle={PUZZLE_WITHOUT_BACKGROUND}
        simResult={null}
        evaluation={{ passed: false, results: [] }}
        onRun={() => {}}
        onReset={() => {}}
        readingExpanded={false}
        onToggleReading={() => {}}
      />
    );
    expect(container.querySelector('.reading-toggle')).toBeNull();
  });

  it('does NOT render the inline reading when collapsed', () => {
    const { container } = setup({ readingExpanded: false });
    expect(container.querySelector('.reading-inline')).toBeNull();
    expect(container.textContent).not.toContain('First paragraph of the full reading.');
  });

  it('renders the full reading paragraphs when expanded', () => {
    const { container } = setup({ readingExpanded: true });
    const inline = container.querySelector('.reading-inline');
    expect(inline).not.toBeNull();
    for (const para of PUZZLE_WITH_BACKGROUND.background) {
      expect(inline.textContent).toContain(para);
    }
  });

  it('toggle button shows "Hide" copy when expanded', () => {
    const { container } = setup({ readingExpanded: true });
    expect(container.querySelector('.reading-toggle').textContent).toMatch(/Hide full lesson/);
  });

  it('clicking the toggle invokes onToggleReading', () => {
    const onToggleReading = vi.fn();
    const { container } = setup({ onToggleReading });
    fireEvent.click(container.querySelector('.reading-toggle'));
    expect(onToggleReading).toHaveBeenCalledOnce();
  });
});
