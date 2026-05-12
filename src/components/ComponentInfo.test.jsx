import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ComponentInfo from './ComponentInfo.jsx';
import { componentInfo } from '../lib/componentInfo.js';

function node(type) {
  return {
    id: 'n1',
    type: 'system',
    data: { type, config: {} },
  };
}

describe('ComponentInfo', () => {
  it('renders a placeholder when nothing is selected', () => {
    const { container } = render(<ComponentInfo node={null} />);
    const empty = container.querySelector('.component-info-empty');
    expect(empty).not.toBeNull();
    expect(empty.textContent).toMatch(/Click a component/i);
  });

  it('renders description, usage, and connects for a selected node', () => {
    const { container } = render(<ComponentInfo node={node('dnsRecord')} />);
    const info = componentInfo.dnsRecord;
    expect(container.textContent).toContain(info.description);
    expect(container.textContent).toContain(info.usage);
    expect(container.textContent).toContain(info.connects);
  });

  it('renders the realWorld section when info has one', () => {
    // dnsRecord has a realWorld blurb; assert the section appears.
    const { container } = render(<ComponentInfo node={node('dnsRecord')} />);
    const labels = [...container.querySelectorAll('.component-info-label')].map((el) => el.textContent);
    expect(labels).toContain('In the real world');
  });

  it('omits the realWorld section when info has none', () => {
    // program has no realWorld field; assert the label isn't present.
    const { container } = render(<ComponentInfo node={node('program')} />);
    const labels = [...container.querySelectorAll('.component-info-label')].map((el) => el.textContent);
    expect(labels).not.toContain('In the real world');
  });

  it('uses the component type\'s color in the header dot', () => {
    const { container } = render(<ComponentInfo node={node('router')} />);
    const dot = container.querySelector('.component-info-dot');
    expect(dot).not.toBeNull();
    expect(dot.getAttribute('style')).toMatch(/background:\s*rgb\(124,\s*58,\s*237\)|#7c3aed/);
  });
});
