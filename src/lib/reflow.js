// Containers no longer auto-resize their underlying dimensions. Their
// `style.width`/`style.height` stay at whatever the puzzle's initial nodes
// set them to (the baseline). Visual wrapping of overshooting children is
// handled purely by the `--over-*` CSS variables computed at render time
// (see App.computeOvershoot) — that way detach works symmetrically on all
// four sides (the parent's bounds don't expand to chase the child).
//
// Kept as a passthrough for callers that import it; trivially removable.
export function reflowContainers(nodes) {
  return nodes;
}
