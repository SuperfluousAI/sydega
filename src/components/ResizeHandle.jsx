import { useCallback } from 'react';

// Generic drag-to-resize handle. Mounts as a small absolutely-positioned
// strip on the edge of its parent pane; mousedown captures the starting
// pointer + starting size, then mousemove dispatches `onChange(newSize)`
// clamped to [min, max]. Used for:
//   - the bottom edge of the top puzzle bar (vertical resize)
//   - the right edge of the left palette (horizontal resize)
//   - the left edge of the right panel stack (horizontal resize, inverted)
//
// Props:
//   orientation: 'horizontal' (drag along x) | 'vertical' (drag along y)
//   side:        'top' | 'right' | 'bottom' | 'left' — where the handle
//                sits on the parent. Also determines the sign convention:
//                dragging "outward" from the parent's center grows it.
//   getCurrent:  () => current size in px
//   onChange:    (next: number) => void
//   min, max:    clamp bounds
export default function ResizeHandle({ orientation, side, getCurrent, onChange, min = 0, max = Infinity }) {
  const onMouseDown = useCallback(
    (e) => {
      e.preventDefault();
      const start = orientation === 'horizontal' ? e.clientX : e.clientY;
      const startSize = getCurrent();
      // Direction: dragging outward from the parent grows it.
      //   side=right or bottom → outward = positive delta
      //   side=left or top     → outward = negative delta (invert sign)
      const sign = side === 'left' || side === 'top' ? -1 : 1;
      const onMove = (ev) => {
        const cur = orientation === 'horizontal' ? ev.clientX : ev.clientY;
        const delta = (cur - start) * sign;
        const next = Math.max(min, Math.min(max, startSize + delta));
        onChange(next);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      document.body.style.cursor = orientation === 'horizontal' ? 'ew-resize' : 'ns-resize';
      // Suppress text selection while dragging — otherwise text in panes
      // gets selected as the cursor sweeps across content.
      document.body.style.userSelect = 'none';
    },
    [orientation, side, getCurrent, onChange, min, max]
  );
  return (
    <div
      className={`resize-handle resize-handle-${side}`}
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation={orientation === 'horizontal' ? 'vertical' : 'horizontal'}
    />
  );
}
