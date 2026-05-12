// Visual-only React Flow node that renders a labeled, translucent rectangle
// behind the actual interactive nodes. Used by Lesson 3 (and future networking
// lessons) to show "this area is your LAN; that area is the Internet."
//
// These nodes are filtered out by the simulator (see simulator.js — region
// nodes are removed at the top of `simulate()` alongside failed nodes). They
// don't participate in flow, capacity, latency — they're purely a visual cue
// for the *spatial* metaphor we're teaching.
export default function RegionNode({ data }) {
  const { label, color, w, h } = data;
  return (
    <div
      className="canvas-region"
      style={{
        width: w,
        height: h,
        backgroundColor: `${color}14`, // ~8% alpha
        border: `1.5px dashed ${color}`,
        borderRadius: 16,
        position: 'relative',
        pointerEvents: 'none',
      }}
    >
      <div
        className="canvas-region-label"
        style={{
          position: 'absolute',
          top: 10,
          left: 16,
          color,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: 0.85,
        }}
      >
        {label}
      </div>
    </div>
  );
}
