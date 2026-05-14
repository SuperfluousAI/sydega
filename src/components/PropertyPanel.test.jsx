import { describe, it, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import PropertyPanel from './PropertyPanel.jsx';
import { defaultsFor } from '../lib/componentTypes.js';

function makeNode(type, configOverrides = {}) {
  return {
    id: 'n1',
    data: { type, config: { ...defaultsFor(type), ...configOverrides } },
  };
}

describe('PropertyPanel — Custom Program code editor', () => {
  // VISUAL CONTRACT: the code editor must mount the CodeEditor component
  // wrapper. The wrapper provides the syntax-highlighted overlay; a bare
  // textarea would not.
  it('renders a CodeEditor wrapper for the customProgram code field', () => {
    const node = makeNode('customProgram');
    const { container } = render(
      <PropertyPanel node={node} onChange={() => {}} onDelete={() => {}} />
    );
    const wrap = container.querySelector('.code-editor');
    expect(wrap).not.toBeNull();
    // Both the input layer and the highlighted overlay must be present.
    expect(wrap.querySelector('.code-editor-input')).not.toBeNull();
    expect(wrap.querySelector('.code-editor-overlay')).not.toBeNull();
    expect(wrap.querySelector('.code-editor-input').tagName).toBe('TEXTAREA');
  });

  it('seeds the editor with the node\'s current code', () => {
    const node = makeNode('customProgram', { code: 'function transform(input) { return {}; }' });
    const { container } = render(
      <PropertyPanel node={node} onChange={() => {}} onDelete={() => {}} />
    );
    const ta = container.querySelector('.code-editor-input');
    expect(ta.value).toBe('function transform(input) { return {}; }');
  });

  // VISUAL CONTRACT: the syntax overlay must show token spans — that's the
  // whole point of the editor. If it's empty or unstyled the highlighter
  // got disconnected.
  it('renders syntax-highlighted token spans in the overlay', () => {
    const node = makeNode('customProgram', { code: 'function transform() { return 1; }' });
    const { container } = render(
      <PropertyPanel node={node} onChange={() => {}} onDelete={() => {}} />
    );
    const overlay = container.querySelector('.code-editor-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.querySelector('.tok-keyword')).not.toBeNull();
    expect(overlay.querySelector('.tok-number')).not.toBeNull();
  });

  // VISUAL CONTRACT: the line-number gutter must render one cell per line,
  // numbered from 1. Without it, code-editor users lose their place on
  // longer functions.
  it('renders one numbered line in the gutter for each line of code', () => {
    const node = makeNode('customProgram', {
      code: 'function transform(input) {\n  return input;\n}',
    });
    const { container } = render(
      <PropertyPanel node={node} onChange={() => {}} onDelete={() => {}} />
    );
    const gutter = container.querySelector('.code-editor-gutter');
    expect(gutter).not.toBeNull();
    const numbers = gutter.querySelectorAll('.code-editor-line-number');
    expect(numbers.length).toBe(3);
    expect(numbers[0].textContent).toBe('1');
    expect(numbers[1].textContent).toBe('2');
    expect(numbers[2].textContent).toBe('3');
  });

  it('calls onChange with the merged config when the user edits the code', () => {
    const node = makeNode('customProgram', { displayLabel: 'Gate' });
    let lastConfig = null;
    const { container } = render(
      <PropertyPanel node={node} onChange={(_id, cfg) => { lastConfig = cfg; }} onDelete={() => {}} />
    );
    const ta = container.querySelector('.code-editor-input');
    act(() => {
      fireEvent.change(ta, { target: { value: 'function transform() { return null; }' } });
    });
    expect(lastConfig).not.toBeNull();
    expect(lastConfig.code).toBe('function transform() { return null; }');
    // Other config fields survive the update.
    expect(lastConfig.displayLabel).toBe('Gate');
  });

  it('does NOT render a code editor for non-customProgram nodes', () => {
    const node = makeNode('loadBalancer');
    const { container } = render(
      <PropertyPanel node={node} onChange={() => {}} onDelete={() => {}} />
    );
    expect(container.querySelector('.code-editor')).toBeNull();
  });
});
