// Custom React Flow edge that anchors to each node's perimeter (rather than
// to fixed handle dots). The endpoint positions come from edgeGeometry, which
// finds where the center-to-center line crosses each node's bounding rect.
//
// Each edge also exposes two clickable endpoint dots — clicking a dot toggles
// whether that side has an arrowhead, which in turn drives the path's
// animation direction:
//   - arrows.target only          → dashes flow source → target
//   - arrows.source only          → dashes flow target → source
//   - both arrows                 → two stacked paths animate opposite ways
//   - neither                     → static line, no animation
// The R/W "kind" axis is independent of arrows and remains togglable via the
// edge body click (handled in Canvas.jsx's handleEdgeClick).

import {
  useStore,
  useReactFlow,
  EdgeLabelRenderer,
  getBezierPath,
  Position,
} from 'reactflow';
import { exitSide, getFloatingEdgeEndpoints, nodeCenter } from '../lib/edgeGeometry.js';

const SIDE_TO_POSITION = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

// Default for an edge that hasn't been customized: bidirectional. Both
// endpoints have arrows; animation flows both ways. The player removes
// arrowheads by clicking the endpoint dots to express specific direction.
const DEFAULT_ARROWS = { source: true, target: true };

// Exported so tests can lock the default down and reuse the same shape.
export function arrowsOf(data) {
  return data?.arrows || DEFAULT_ARROWS;
}

// Endpoint affordance: each side shows EITHER an arrow OR a clickable dot,
// never both. Returns the className for that side. Exported as a pure
// function so the either-or rule has a tiny unit test (FloatingEdge.test.js)
// — the bug class is "dot AND arrow rendered on the same side."
export function endpointClassName(hasArrowOnThisSide) {
  return hasArrowOnThisSide ? 'with-arrow' : 'as-dot';
}

export default function FloatingEdge({
  id,
  source,
  target,
  data,
  style,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
}) {
  const sourceNode = useStore((s) => s.nodeInternals.get(source));
  const targetNode = useStore((s) => s.nodeInternals.get(target));
  const { setEdges } = useReactFlow();
  if (!sourceNode || !targetNode) return null;

  const arrows = arrowsOf(data);
  // Custom SVG marker with orient="auto-start-reverse" so the SAME marker
  // flips 180° when used as marker-start. React Flow's built-in MarkerType
  // uses orient="auto", which makes markerStart arrows point the same
  // direction as markerEnd ones — that's the visual asymmetry bug. Each
  // edge gets its own marker so per-edge color (R/W kind) is honored.
  const markerColor = style?.stroke || '#cbd5e1';
  const markerId = `sdg-arrow-${id}`;
  const markerUrl = `url(#${markerId})`;
  const { source: src, target: tgt } = getFloatingEdgeEndpoints(sourceNode, targetNode);
  // Pass sourcePosition / targetPosition so getBezierPath picks control points
  // matching the actual geometry — the arrowhead orients to the resulting
  // tangent, so passing the wrong side makes the arrow point the wrong way.
  const sourceSide = exitSide(sourceNode, nodeCenter(targetNode));
  const targetSide = exitSide(targetNode, nodeCenter(sourceNode));
  const [path, labelX, labelY] = getBezierPath({
    sourceX: src.x,
    sourceY: src.y,
    sourcePosition: SIDE_TO_POSITION[sourceSide],
    targetX: tgt.x,
    targetY: tgt.y,
    targetPosition: SIDE_TO_POSITION[targetSide],
  });

  const toggleArrow = (side) => {
    setEdges((es) =>
      es.map((e) => {
        if (e.id !== id) return e;
        const cur = arrowsOf(e.data);
        return {
          ...e,
          data: { ...(e.data || {}), arrows: { ...cur, [side]: !cur[side] } },
        };
      })
    );
  };

  const both = arrows.source && arrows.target;
  const forwardOnly = !arrows.source && arrows.target;
  const reverseOnly = arrows.source && !arrows.target;
  const flowClass = both
    ? 'edge-flow-forward'
    : forwardOnly
      ? 'edge-flow-forward'
      : reverseOnly
        ? 'edge-flow-reverse'
        : 'edge-flow-static';

  return (
    <>
      {/* Per-edge marker def. orient="auto-start-reverse" is the key:
          one marker definition serves both ends, flipping automatically when
          used as marker-start. Without this, marker-start would render the
          arrow pointing the same way as marker-end (both → target). */}
      <defs>
        <marker
          id={markerId}
          viewBox="-10 -10 20 20"
          refX="0"
          refY="0"
          markerWidth="12"
          markerHeight="12"
          orient="auto-start-reverse"
        >
          <polyline points="-5,-4 0,0 -5,4 -5,-4" fill={markerColor} stroke={markerColor} strokeWidth="1" />
        </marker>
      </defs>

      {/* Wider invisible overlay path catches body clicks (R/W cycle) — the
          visible 2px stroke is too thin to hit reliably. */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
      />

      {/* The visible animated path. markerStart / markerEnd are conditional
          on arrows.{source, target} so the player sees an arrow only on the
          end(s) that have one toggled on. Both endpoints use the same marker
          definition; the SVG flips for marker-start automatically. */}
      <path
        id={id}
        className={`react-flow__edge-path ${flowClass}`}
        d={path}
        markerStart={arrows.source ? markerUrl : undefined}
        markerEnd={arrows.target ? markerUrl : undefined}
        style={style}
      />

      {/* For "both" arrows, overlay a second path animating in the reverse
          direction so the player sees motion both ways. The marker is on the
          primary path; this one is just for the dash motion. */}
      {both && (
        <path
          d={path}
          className="react-flow__edge-path edge-flow-reverse"
          style={{ ...style, opacity: 0.55 }}
        />
      )}

      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              padding: labelBgPadding ? `${labelBgPadding[1]}px ${labelBgPadding[0]}px` : '3px 6px',
              borderRadius: labelBgBorderRadius ?? 4,
              ...(labelBgStyle || {}),
              ...(labelStyle || {}),
              fontSize: labelStyle?.fontSize ?? 10,
              fontWeight: labelStyle?.fontWeight ?? 700,
            }}
            className="nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Endpoint click zones.
          - If the side has an arrow → render an invisible hot-zone overlay
            (`.with-arrow`); the arrow itself is the visual. Hover reveals a
            faint outline so the affordance is discoverable.
          - If the side has no arrow → render an outlined dot (`.as-dot`);
            clicking adds the arrow.
          Either or, never both. */}
      <EdgeLabelRenderer>
        <button
          type="button"
          data-arrow-side="source"
          className={`edge-endpoint nodrag nopan ${endpointClassName(arrows.source)}`}
          style={{
            position: 'absolute',
            left: src.x,
            top: src.y,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'all',
          }}
          onClick={(e) => {
            e.stopPropagation();
            toggleArrow('source');
          }}
          title={arrows.source ? 'Remove arrow on this side' : 'Add arrow on this side'}
          aria-label="Toggle source-side arrow"
        />
        <button
          type="button"
          data-arrow-side="target"
          className={`edge-endpoint nodrag nopan ${endpointClassName(arrows.target)}`}
          style={{
            position: 'absolute',
            left: tgt.x,
            top: tgt.y,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'all',
          }}
          onClick={(e) => {
            e.stopPropagation();
            toggleArrow('target');
          }}
          title={arrows.target ? 'Remove arrow on this side' : 'Add arrow on this side'}
          aria-label="Toggle target-side arrow"
        />
      </EdgeLabelRenderer>
    </>
  );
}
