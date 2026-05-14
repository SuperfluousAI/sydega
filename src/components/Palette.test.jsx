import { describe, it, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import Palette from './Palette.jsx';
import { puzzles } from '../lib/puzzles.js';

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
