import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import Palette from './Palette.jsx';
import { puzzles } from '../lib/puzzles.js';

beforeEach(() => {
  // Reset persisted sort/filter so each test starts clean.
  localStorage.clear();
});

function setup(props = {}) {
  return render(
    <Palette
      puzzle={puzzles.buildComputer}
      onSwitchPuzzle={() => {}}
      {...props}
    />
  );
}

describe('Palette track toggle', () => {
  // VISUAL CONTRACT: the track toggle must render two pill buttons. Without
  // them, the mentee path (JS Sandbox track) is unreachable from the UI.
  it('renders Systems and JavaScript pills when onSwitchTrack is provided', () => {
    const { container } = setup({ onSwitchTrack: () => {} });
    const pills = container.querySelectorAll('.track-pill');
    expect(pills.length).toBe(2);
    expect(pills[0].textContent).toMatch(/Systems/);
    expect(pills[1].textContent).toMatch(/JavaScript/);
  });

  it('marks only the active track\'s pill as active', () => {
    const { container } = setup({
      onSwitchTrack: () => {},
      activeTrack: 'javascript',
    });
    const pills = container.querySelectorAll('.track-pill');
    expect(pills[0].className).not.toMatch(/\bactive\b/);
    expect(pills[1].className).toMatch(/\bactive\b/);
  });

  it('calls onSwitchTrack when a pill is clicked', () => {
    let clicked = null;
    const { container } = setup({
      onSwitchTrack: (t) => { clicked = t; },
      activeTrack: 'systems',
    });
    const jsPill = container.querySelectorAll('.track-pill')[1];
    act(() => { fireEvent.click(jsPill); });
    expect(clicked).toBe('javascript');
  });

  // VISUAL CONTRACT: each lesson row carries a colored dot indicating its
  // difficulty. Without it, the difficulty filter would be invisible
  // affordance.
  it('renders a difficulty dot on every lesson row', () => {
    const { container } = setup();
    const items = container.querySelectorAll('.lesson-item');
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const dot = item.querySelector('.difficulty-dot');
      expect(dot).not.toBeNull();
      // Class includes one of the three difficulty levels.
      expect(dot.className).toMatch(/difficulty-dot-(easy|medium|hard)/);
    }
  });
});

describe('Palette sort + filter', () => {
  it('renders a sort/filter trigger button', () => {
    const { container } = setup();
    const trigger = container.querySelector('.lesson-sort-filter-trigger');
    expect(trigger).not.toBeNull();
  });

  it('opens a popover with sort + filter chips when the trigger is clicked', () => {
    const { container } = setup();
    expect(container.querySelector('.lesson-sort-filter-popover')).toBeNull();
    act(() => {
      fireEvent.click(container.querySelector('.lesson-sort-filter-trigger'));
    });
    const popover = container.querySelector('.lesson-sort-filter-popover');
    expect(popover).not.toBeNull();
    // 2 sort chips (Number / Difficulty) + 3 difficulty chips.
    expect(popover.querySelectorAll('.sf-chip').length).toBe(5);
  });

  it('sorts by difficulty when the Difficulty sort chip is selected', () => {
    const { container } = setup();
    act(() => { fireEvent.click(container.querySelector('.lesson-sort-filter-trigger')); });
    // Click the second sort chip (Difficulty).
    const sortChips = container.querySelectorAll(
      '.lesson-sort-filter-section:first-child .sf-chip'
    );
    act(() => { fireEvent.click(sortChips[1]); });
    // Top row should now be an "easy" lesson (since Systems track has at
    // least one easy lesson — Build a Computer).
    const firstRow = container.querySelector('.lesson-item');
    const firstDot = firstRow.querySelector('.difficulty-dot');
    expect(firstDot.className).toMatch(/difficulty-dot-easy/);
  });

  it('hides lessons of a difficulty when its chip is toggled off', () => {
    const { container } = setup();
    act(() => { fireEvent.click(container.querySelector('.lesson-sort-filter-trigger')); });
    // Find the "easy" chip (first difficulty chip).
    const easyChip = container.querySelector('.sf-chip-easy');
    expect(easyChip).not.toBeNull();
    // Before: at least one easy row should be visible (Build a Computer).
    const titlesBefore = Array.from(container.querySelectorAll('.lesson-title')).map((t) => t.textContent);
    expect(titlesBefore).toContain('Build a Computer');
    act(() => { fireEvent.click(easyChip); });
    const titlesAfter = Array.from(container.querySelectorAll('.lesson-title')).map((t) => t.textContent);
    expect(titlesAfter).not.toContain('Build a Computer');
  });

  // The Systems track should NOT show JS Sandbox lessons (J1-J12), and the
  // JavaScript track should NOT show systems lessons.
  it('filters the lessons list to only the active track', () => {
    const { container, rerender } = setup({
      onSwitchTrack: () => {},
      activeTrack: 'systems',
    });
    const systemsTitles = Array.from(
      container.querySelectorAll('.lesson-title')
    ).map((el) => el.textContent);
    expect(systemsTitles).toContain('Build a Computer');
    expect(systemsTitles).not.toContain('Hello, transform()');

    rerender(
      <Palette
        puzzle={puzzles.j1Hello}
        onSwitchPuzzle={() => {}}
        onSwitchTrack={() => {}}
        activeTrack="javascript"
      />
    );
    const jsTitles = Array.from(
      container.querySelectorAll('.lesson-title')
    ).map((el) => el.textContent);
    expect(jsTitles).toContain('Hello, transform()');
    expect(jsTitles).not.toContain('Build a Computer');
  });
});
