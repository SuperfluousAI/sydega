// R6 — banner is rendered inside the frame so it resizes with the frame.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import SystemNode from './SystemNode.jsx';

function renderContainer(data = {}) {
  // Computer is a container that now also has handles (for floating-edge
  // wiring). React Flow Handle components require a store provider; wrap.
  return render(
    <ReactFlowProvider>
      <SystemNode
        data={{
          type: 'computer',
          config: {},
          ...data,
        }}
        selected={false}
      />
    </ReactFlowProvider>
  );
}

describe('node handles — every node renders 4 sides of attachable handles', () => {
  // Floating edges anchor at perimeter intersections — the handle's position
  // is only the drag-START dot. We render one handle per side so the player
  // can grab from any side, with handles styled invisible-until-hovered.
  // Tests here pin the structural contract: presence of handles on all four
  // sides, both source and target when the type has hasInput && hasOutput.
  // Catches "Computer is missing its right handle" class of regression.

  it('Computer renders 4 source + 4 target handles (8 total)', () => {
    const { container } = renderContainer();
    const handles = container.querySelectorAll('.react-flow__handle.floating-handle');
    // 4 positions × 2 types (source + target) = 8.
    expect(handles).toHaveLength(8);
  });

  it.each([
    ['top', 'react-flow__handle-top'],
    ['right', 'react-flow__handle-right'],
    ['bottom', 'react-flow__handle-bottom'],
    ['left', 'react-flow__handle-left'],
  ])('Computer has a handle on the %s side', (_side, cls) => {
    const { container } = renderContainer();
    const handles = container.querySelectorAll(`.floating-handle.${cls}`);
    expect(handles.length).toBeGreaterThan(0);
  });

  it('handles are SIBLINGS of the frame, not children — so the frame cannot cover them', () => {
    // If a handle were inside .computer-frame, .computer-frame's z-index or
    // background could occlude it. Keep them outside.
    const { container } = renderContainer();
    const frame = container.querySelector('.computer-frame');
    const handles = container.querySelectorAll('.floating-handle');
    expect(handles.length).toBeGreaterThan(0);
    for (const h of handles) {
      expect(frame.contains(h)).toBe(false);
    }
  });
});

describe('R6 — banner is a child of the frame', () => {
  it('the header element is a DOM descendant of the frame element', () => {
    const { container } = renderContainer();
    const frame = container.querySelector('.computer-frame');
    const header = container.querySelector('.computer-header');
    expect(frame).not.toBeNull();
    expect(header).not.toBeNull();
    expect(frame.contains(header)).toBe(true);
  });

  it('extending the frame with CSS variables also extends the header inside it', () => {
    const { container } = renderContainer({
      overshoot: { top: 0, right: 50, bottom: 0, left: 0 },
    });
    const frame = container.querySelector('.computer-frame');
    // The frame should carry the --over-right CSS variable that drives its extension.
    expect(frame.style.getPropertyValue('--over-right')).toBe('50px');
  });
});
