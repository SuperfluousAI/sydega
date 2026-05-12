// Floating-edge geometry. Given a source node and a target node — each with
// a position and a size — compute where an edge between them should anchor
// on each node's perimeter. The anchor is the intersection of the
// center-to-center line with the node's bounding rectangle.
//
// This makes edges visually attach to whatever side of a node "faces" the
// other endpoint, instead of being pinned to a single fixed handle dot.
//
// Pure. No React Flow imports. Tested in edgeGeometry.test.js.

const DEFAULT_W = 170;
const DEFAULT_H = 90;

export function getFloatingEdgeEndpoints(sourceNode, targetNode) {
  const sCenter = nodeCenter(sourceNode);
  const tCenter = nodeCenter(targetNode);
  return {
    source: perimeterIntersection(sourceNode, tCenter),
    target: perimeterIntersection(targetNode, sCenter),
  };
}

export function nodeCenter(node) {
  const w = nodeWidth(node);
  const h = nodeHeight(node);
  const x = (node.positionAbsolute?.x ?? node.position?.x ?? 0) + w / 2;
  const y = (node.positionAbsolute?.y ?? node.position?.y ?? 0) + h / 2;
  return { x, y };
}

export function nodeWidth(node) {
  return node.width || node.style?.width || DEFAULT_W;
}

export function nodeHeight(node) {
  return node.height || node.style?.height || DEFAULT_H;
}

// Which side of the node's bounding rect does the line from node-center to
// the external point exit through? Returned as a string ('top' | 'right' |
// 'bottom' | 'left') so callers can map to React Flow's Position enum.
//
// This is the missing piece for arrow-orientation: getBezierPath uses
// sourcePosition / targetPosition to pick control points, which sets the
// curve's tangent at the endpoint, which is what the SVG marker (arrowhead)
// rotates to follow. Pass the wrong side and the arrow points the wrong way.
export function exitSide(node, towardPoint) {
  const { x: cx, y: cy } = nodeCenter(node);
  const dx = towardPoint.x - cx;
  const dy = towardPoint.y - cy;
  const halfW = nodeWidth(node) / 2;
  const halfH = nodeHeight(node) / 2;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const tx = absDx === 0 ? Infinity : halfW / absDx;
  const ty = absDy === 0 ? Infinity : halfH / absDy;
  if (tx <= ty) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

// Given a node and a point external to it, return the point on the node's
// bounding rectangle hit by the line from node center to that external point.
export function perimeterIntersection(node, towardPoint) {
  const { x: cx, y: cy } = nodeCenter(node);
  const halfW = nodeWidth(node) / 2;
  const halfH = nodeHeight(node) / 2;
  const dx = towardPoint.x - cx;
  const dy = towardPoint.y - cy;

  // Degenerate: external point sits at our center. No meaningful direction.
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  // Find scale factor t such that one of |t*dx|=halfW or |t*dy|=halfH first.
  // The smaller of the two t's is where we exit the rectangle.
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const tx = absDx === 0 ? Infinity : halfW / absDx;
  const ty = absDy === 0 ? Infinity : halfH / absDy;
  const t = Math.min(tx, ty);

  return { x: cx + t * dx, y: cy + t * dy };
}
