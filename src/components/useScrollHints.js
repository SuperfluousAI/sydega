import { useEffect, useState } from 'react';

// Wires the ▲/▼ scroll-affordance pattern used by PuzzleBar's results
// column, Palette's lessons list, and PuzzleBar's lesson-reading area.
// Returns `{ showUp, showDown }` reflecting whether the scrollable
// region has hidden content above / below the current viewport.
//
// Re-checks on scroll (live) and on size changes (ResizeObserver — guarded
// for jsdom, which doesn't ship it). `deps` are extra triggers — pass any
// state that changes the content size (sim results, expanded sections,
// puzzle switches) so the hook re-evaluates after re-renders.
export function useScrollHints(ref, deps = []) {
  const [showUp, setShowUp] = useState(false);
  const [showDown, setShowDown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const overflow = el.scrollHeight - el.clientHeight;
      const atBottom = el.scrollTop >= overflow - 4;
      const atTop = el.scrollTop <= 4;
      setShowDown(overflow > 4 && !atBottom);
      setShowUp(overflow > 4 && !atTop);
    };
    check();
    el.addEventListener('scroll', check);
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(check);
      ro.observe(el);
    }
    return () => {
      el.removeEventListener('scroll', check);
      if (ro) ro.disconnect();
    };
    // The ref's `.current` is stable across renders; consumers pass any
    // content-affecting state via `deps` so the check re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { showUp, showDown };
}
