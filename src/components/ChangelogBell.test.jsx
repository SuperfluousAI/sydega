import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import ChangelogBell from './ChangelogBell.jsx';
import { currentVersion } from '../lib/changelog.js';

beforeEach(() => {
  localStorage.clear();
});

describe('ChangelogBell', () => {
  it('renders a bell button', () => {
    const { container } = render(<ChangelogBell />);
    expect(container.querySelector('.changelog-bell')).not.toBeNull();
  });

  // VISUAL CONTRACT: when there's no seen-marker yet, the red dot is
  // present so a new visitor knows there are updates to read.
  it('shows the red dot when there is no last-seen value in localStorage', () => {
    const { container } = render(<ChangelogBell />);
    expect(container.querySelector('.changelog-bell-dot')).not.toBeNull();
    expect(container.querySelector('.changelog-bell--has-new')).not.toBeNull();
  });

  it('hides the red dot when last-seen matches the current version', () => {
    localStorage.setItem('sdg-changelog-last-seen', currentVersion);
    const { container } = render(<ChangelogBell />);
    expect(container.querySelector('.changelog-bell-dot')).toBeNull();
    expect(container.querySelector('.changelog-bell--has-new')).toBeNull();
  });

  it('clicking the bell opens the panel and clears the red dot', () => {
    const { container } = render(<ChangelogBell />);
    expect(container.querySelector('.changelog-panel')).toBeNull();
    act(() => {
      fireEvent.click(container.querySelector('.changelog-bell'));
    });
    expect(container.querySelector('.changelog-panel')).not.toBeNull();
    expect(container.querySelector('.changelog-bell-dot')).toBeNull();
    expect(localStorage.getItem('sdg-changelog-last-seen')).toBe(currentVersion);
  });

  it('the panel lists at least one release with its date and entries', () => {
    const { container } = render(<ChangelogBell />);
    act(() => {
      fireEvent.click(container.querySelector('.changelog-bell'));
    });
    const releases = container.querySelectorAll('.changelog-release');
    expect(releases.length).toBeGreaterThan(0);
    expect(releases[0].querySelector('.changelog-release-date')).not.toBeNull();
    expect(releases[0].querySelectorAll('li').length).toBeGreaterThan(0);
  });

  it('clicking the close button hides the panel', () => {
    const { container } = render(<ChangelogBell />);
    act(() => {
      fireEvent.click(container.querySelector('.changelog-bell'));
    });
    expect(container.querySelector('.changelog-panel')).not.toBeNull();
    act(() => {
      fireEvent.click(container.querySelector('.changelog-panel-close'));
    });
    expect(container.querySelector('.changelog-panel')).toBeNull();
  });

  it('pressing Escape closes the panel', () => {
    const { container } = render(<ChangelogBell />);
    act(() => {
      fireEvent.click(container.querySelector('.changelog-bell'));
    });
    expect(container.querySelector('.changelog-panel')).not.toBeNull();
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(container.querySelector('.changelog-panel')).toBeNull();
  });
});
