import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import LessonPanel from './LessonPanel.jsx';

const PUZZLE = {
  order: 14,
  title: 'Stream Processing at Scale',
  blurb: 'The lesson\'s opening paragraph. Lives at the top of the panel.',
  background: [
    'First background paragraph.',
    'Second background paragraph — more depth.',
  ],
  sources: [
    { title: 'Apache Kafka Intro', url: 'https://kafka.apache.org/intro', note: 'official source' },
    { title: 'Confluent Replication', url: 'https://docs.confluent.io/kafka/design/replication.html' },
  ],
};

describe('LessonPanel — static lesson reading', () => {
  it('renders the title and blurb', () => {
    const { container } = render(<LessonPanel puzzle={PUZZLE} />);
    expect(container.textContent).toContain('Lesson 14 — Stream Processing at Scale');
    expect(container.textContent).toContain(PUZZLE.blurb);
  });

  it('renders all background paragraphs (static — no toggle)', () => {
    const { container } = render(<LessonPanel puzzle={PUZZLE} />);
    for (const p of PUZZLE.background) {
      expect(container.textContent).toContain(p);
    }
  });

  it('renders sources as clickable links opening in a new tab', () => {
    const { container } = render(<LessonPanel puzzle={PUZZLE} />);
    const links = container.querySelectorAll('.reading-sources a');
    expect(links.length).toBe(PUZZLE.sources.length);
    expect(links[0].getAttribute('href')).toBe(PUZZLE.sources[0].url);
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(links[0].getAttribute('rel')).toMatch(/noreferrer/);
  });

  it('renders the optional note next to a source link', () => {
    const { container } = render(<LessonPanel puzzle={PUZZLE} />);
    expect(container.textContent).toContain('official source');
  });

  it('renders nothing when puzzle is missing', () => {
    const { container } = render(<LessonPanel puzzle={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('omits the sources section when sources is empty', () => {
    const { container } = render(
      <LessonPanel puzzle={{ ...PUZZLE, sources: [] }} />
    );
    expect(container.querySelector('.reading-sources')).toBeNull();
  });

  it('hides the body and shows ▸ when collapsed=true', () => {
    const { container } = render(
      <LessonPanel puzzle={PUZZLE} collapsed onToggleCollapse={() => {}} />
    );
    expect(container.querySelector('.lesson-panel-body')).toBeNull();
    expect(container.querySelector('.lesson-panel-toggle').textContent).toBe('▸');
    expect(container.querySelector('.lesson-panel').className).toMatch(/lesson-panel-collapsed/);
  });

  it('shows the body and ▾ when collapsed=false', () => {
    const { container } = render(
      <LessonPanel puzzle={PUZZLE} collapsed={false} onToggleCollapse={() => {}} />
    );
    expect(container.querySelector('.lesson-panel-body')).not.toBeNull();
    expect(container.querySelector('.lesson-panel-toggle').textContent).toBe('▾');
  });

  it('clicking the toggle invokes onToggleCollapse', () => {
    const onToggleCollapse = vi.fn();
    const { container } = render(
      <LessonPanel puzzle={PUZZLE} collapsed={false} onToggleCollapse={onToggleCollapse} />
    );
    fireEvent.click(container.querySelector('.lesson-panel-toggle'));
    expect(onToggleCollapse).toHaveBeenCalledOnce();
  });

  it('omits the toggle button when onToggleCollapse is not provided', () => {
    const { container } = render(<LessonPanel puzzle={PUZZLE} />);
    expect(container.querySelector('.lesson-panel-toggle')).toBeNull();
  });
});
