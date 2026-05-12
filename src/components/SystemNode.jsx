import { useEffect, useRef, useState } from 'react';
import { Handle, Position } from 'reactflow';
import { componentTypes, metaFor } from '../lib/componentTypes.js';

// Common ports surfaced in the "Set port" sub-menu. The property panel still
// lets the player type any port; this is a fast-path for the common cases.
const COMMON_PORTS = [80, 443, 3000, 8080];

// Floating edges render at geometric perimeter intersections — the handle's
// position only affects where the drag-start dot lives. We render one handle
// per side so the user can grab from any side of a node, then style them
// invisible-by-default / visible-on-hover so the affordance is discoverable
// without being permanently distracting.
const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];

function FloatingHandles({ hasInput, hasOutput }) {
  return (
    <>
      {hasInput &&
        SIDES.map((p) => (
          <Handle
            key={`t-${p}`}
            type="target"
            position={p}
            id={`t-${p}`}
            className="floating-handle"
          />
        ))}
      {hasOutput &&
        SIDES.map((p) => (
          <Handle
            key={`s-${p}`}
            type="source"
            position={p}
            id={`s-${p}`}
            className="floating-handle"
          />
        ))}
    </>
  );
}

function NodeMenu({
  targets,
  currentParentId,
  onReparent,
  onAddHardware,
  currentPort,
  onSetPort,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const visibleTargets = (targets || []).filter((t) => t.id !== currentParentId);
  const showReparent = visibleTargets.length > 0;
  const showAddHardware = !!onAddHardware;
  const showSetPort = !!onSetPort;
  if (!showReparent && !showAddHardware && !showSetPort) return null;

  return (
    <div className="node-menu nodrag nopan" ref={ref}>
      <button
        className="node-menu-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label="Node menu"
      >
        ⋯
      </button>
      {open && (
        <div className="node-menu-popover" onClick={(e) => e.stopPropagation()}>
          {showAddHardware && (
            <>
              <div className="node-menu-label">Hardware</div>
              <button
                className="node-menu-option"
                onClick={() => {
                  onAddHardware();
                  setOpen(false);
                }}
              >
                + Add CPU + RAM + Disk
              </button>
            </>
          )}
          {showSetPort && (
            <>
              <div className="node-menu-label">Listening port</div>
              {COMMON_PORTS.map((p) => (
                <button
                  key={p}
                  className={`node-menu-option ${p === currentPort ? 'current' : ''}`}
                  onClick={() => {
                    onSetPort(p);
                    setOpen(false);
                  }}
                >
                  :{p}
                  {p === currentPort && <span className="node-menu-current"> · current</span>}
                </button>
              ))}
            </>
          )}
          {showReparent && (
            <>
              <div className="node-menu-label">Move to…</div>
              {visibleTargets.map((t) => (
                <button
                  key={t.id ?? '__none__'}
                  className="node-menu-option"
                  onClick={() => {
                    onReparent(t.id);
                    setOpen(false);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function SystemNode({ data, selected }) {
  // Use metaFor so service nodes pick up their role-specific label/color.
  // For non-role-aware types this returns the same object as componentTypes[type].
  const meta = metaFor({ data });
  const cfg = data.config;
  const sim = data.sim;

  const hasMenu = data.onReparent || data.onAddHardware || data.onSetPort;
  const menu = hasMenu ? (
    <NodeMenu
      targets={data.reparentTargets}
      currentParentId={data.parentId}
      onReparent={data.onReparent}
      onAddHardware={data.onAddHardware}
      currentPort={cfg.port}
      onSetPort={data.onSetPort}
    />
  ) : null;

  if (data.type === 'router') {
    const routerSim = sim && sim.kind === 'router' ? sim : null;
    return (
      <div
        className={`system-node router-node ${data.failed ? 'failed' : ''}`}
        style={{
          borderColor: selected ? '#fff' : meta.color,
          boxShadow: selected ? `0 0 0 2px ${meta.color}` : undefined,
        }}
      >
        <div className="system-node-header" style={{ background: meta.color }}>
          <span>{meta.label}</span>
          {menu}
        </div>
        <div className="system-node-body">
          <div className="router-meta">
            <div className="router-cidr">
              {routerSim?.cidr || cfg.cidr || '—'}
              {routerSim?.ip && <span className="router-ip"> · {routerSim.ip}</span>}
            </div>
            {cfg.ssid && <div className="router-ssid">SSID: {cfg.ssid}</div>}
            {cfg.port != null && <div className="router-port">admin :{cfg.port}</div>}
          </div>
          <div className="router-devices">
            {routerSim?.devices?.length ? (
              routerSim.devices.map((d) => (
                <div key={d.id} className="router-device-row">
                  <span className="router-device-label">{d.label}</span>
                  <span className="router-device-ip">{d.ip}</span>
                </div>
              ))
            ) : (
              <div className="router-no-devices">no devices wired in</div>
            )}
          </div>
        </div>
        <FloatingHandles hasInput={meta.hasInput} hasOutput={meta.hasOutput} />
      </div>
    );
  }

  if (meta.container) {
    const computerSim = sim && sim.kind === 'computer' ? sim.resources : null;
    const sides = data.shakeSides || null;
    const isStretching = !!(sides && (sides.top || sides.right || sides.bottom || sides.left));
    // Pin the transform origin to the side OPPOSITE the escape direction so
    // the frame appears to reach toward the leaving child.
    const overshoot = data.overshoot;
    const frameStyle = {
      borderColor: selected ? '#fff' : meta.color,
      // Frame extends OUTSIDE the node's underlying bounds in any direction
      // the child is poking past, so the perimeter visually wraps the child.
      ...(overshoot
        ? {
            '--over-top': `${overshoot.top}px`,
            '--over-right': `${overshoot.right}px`,
            '--over-bottom': `${overshoot.bottom}px`,
            '--over-left': `${overshoot.left}px`,
          }
        : {}),
      ...(isStretching
        ? {
            '--stretch-origin-x': sides.right ? '0%' : sides.left ? '100%' : '50%',
            '--stretch-origin-y': sides.bottom ? '0%' : sides.top ? '100%' : '50%',
            '--stretch-x': sides.right || sides.left ? 1.05 : 1,
            '--stretch-y': sides.bottom || sides.top ? 1.05 : 1,
          }
        : {}),
    };
    return (
      <div className="computer-node">
        <div
          key={data.ripple ? `frame-ripple-${data.ripple.key}` : 'frame'}
          className={
            `computer-frame ${selected ? 'selected' : ''} ` +
            `${isStretching ? 'stretching' : ''} ${data.ripple ? 'rippling' : ''} ` +
            `${data.failed ? 'failed' : ''}`
          }
          style={frameStyle}
        >
          {/* R6 — banner lives inside the frame so it resizes/moves with it. */}
          <div className="computer-header" style={{ background: meta.color }}>
            <span>{meta.label}</span>
            {computerSim && (
              <span className="computer-resources">
                {computerSim.cores}c · {computerSim.ramGb}GB · {computerSim.diskGb}GB disk
              </span>
            )}
            {sim?.lanIp?.ip && (
              <span className="computer-lan-ip">{sim.lanIp.ip}</span>
            )}
            {menu}
          </div>
          <div className="computer-hint">drop hardware + a program inside</div>
        </div>
        {/* Floating edges render at the perimeter geometrically; the handles
            are just connection-drag anchors. They're styled to be invisible
            (see .floating-handle in App.css) so the Computer doesn't show
            "ports" but can still participate in wiring. */}
        <FloatingHandles hasInput={meta.hasInput} hasOutput={meta.hasOutput} />
      </div>
    );
  }

  const summary = summarize(data.type, cfg);
  const simLine = sim ? simSummary(data.type, sim) : null;
  const isBad = sim && simLine && simLine.tone === 'bad';

  return (
    <div
      className={`system-node ${data.failed ? 'failed' : ''}`}
      style={{
        borderColor: selected ? '#fff' : meta.color,
        boxShadow: selected ? `0 0 0 2px ${meta.color}` : undefined,
      }}
    >
      <div className="system-node-header" style={{ background: meta.color }}>
        <span>{meta.label}</span>
        {data.failed && <span className="system-node-offline">OFFLINE</span>}
        {menu}
      </div>
      <div className="system-node-body">
        {summary && <div className="system-node-summary">{summary}</div>}
        {simLine && !data.failed && (
          <div className={`system-node-sim ${isBad ? 'overloaded' : ''}`}>{simLine.text}</div>
        )}
      </div>
      <FloatingHandles hasInput={meta.hasInput} hasOutput={meta.hasOutput} />
    </div>
  );
}

function summarize(type, cfg) {
  switch (type) {
    case 'client':
      return `${formatRps(cfg.rps)} · ${Math.round(cfg.readRatio * 100)}% reads`;
    case 'cache':
      return `${formatRps(cfg.capacity)} cap · ${Math.round(cfg.hitRate * 100)}% hit · ${cfg.latency}ms`;
    case 'loadBalancer':
    case 'appServer':
    case 'database':
      return `${formatRps(cfg.capacity)} cap · ${cfg.latency}ms`;
    case 'cpu':
      return `${cfg.cores} cores`;
    case 'ram':
      return `${cfg.gb} GB`;
    case 'disk':
      return `${cfg.gb} GB`;
    case 'program':
      return `needs ${cfg.requires_cores}c · ${cfg.requires_ram_gb}GB · ${cfg.requires_disk_gb}GB`;
    case 'webServer':
      return (
        `needs ${cfg.requires_cores}c · ${cfg.requires_ram_gb}GB · ${cfg.requires_disk_gb}GB` +
        (cfg.port ? ` · :${cfg.port}` : '')
      );
    case 'computer':
      return 'holds hardware + programs';
    case 'visitor':
      return `wants ${cfg.targetDomain || '?'}`;
    case 'domain':
      return cfg.name || '?';
    case 'dnsRecord':
      return `${cfg.recordType || 'A'} → ${cfg.value || '?'}`;
    case 'vps':
      return cfg.ip || '?';
    default:
      return '';
  }
}

function simSummary(type, sim) {
  // Flow sim: incoming/accepted/dropped flow.
  if ('incoming' in sim || 'accepted' in sim || 'continuing' in sim || 'dropped' in sim) {
    const dropped = sim.dropped || 0;
    const ok = sim.accepted || sim.continuing || 0;
    const asyncDropped = sim.asyncDropped || 0;
    const asyncOk = sim.asyncAccepted || sim.asyncContinuing || 0;
    const hasSync = ok > 0.01 || dropped > 0.01;
    const hasAsync = asyncOk > 0.01 || asyncDropped > 0.01;
    if (!hasSync && !hasAsync) return { text: 'idle', tone: 'dim' };
    const tone = (dropped > 0.01 || asyncDropped > 0.01) ? 'bad' : 'good';
    const parts = [];
    if (hasSync) {
      parts.push(dropped > 0.01 ? `${formatRps(ok)} ok · ${formatRps(dropped)} dropped` : `${formatRps(ok)} ok`);
    }
    if (hasAsync) {
      // Workers and any other node draining a Queue only see traffic on the
      // async pass; without this branch they'd render as "idle" while doing
      // all the actual work. The "async" suffix distinguishes from sync flow
      // when both are present (e.g., on a Database fed by both a cache-miss
      // sync path and a worker-fed async path).
      parts.push(asyncDropped > 0.01 ? `${formatRps(asyncOk)} async · ${formatRps(asyncDropped)} dropped` : `${formatRps(asyncOk)} async`);
    }
    return { text: parts.join(' · '), tone };
  }

  // Composition sim.
  if (sim.kind === 'computer') {
    const r = sim.resources;
    return {
      text: `${r.cores}c · ${r.ramGb}GB RAM · ${r.diskGb}GB`,
      tone: r.cores + r.ramGb + r.diskGb === 0 ? 'dim' : 'good',
    };
  }
  if (sim.kind === 'program') {
    return {
      text: sim.hosted ? '✓ hosted' : `✗ ${sim.reason}`,
      tone: sim.hosted ? 'good' : 'bad',
    };
  }

  if (sim.kind === 'phone') {
    if (sim.lanIp?.ip) return { text: `IP ${sim.lanIp.ip}`, tone: 'good' };
    return { text: 'not on a LAN', tone: 'dim' };
  }

  // Connectivity sim.
  if (sim.kind === 'visitor') {
    return {
      text: sim.reached ? `✓ reaches ${sim.reason.replace('OK → ', '')}` : `✗ ${sim.reason}`,
      tone: sim.reached ? 'good' : 'bad',
    };
  }

  return null;
}

function formatRps(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return `${Math.round(n)}`;
}
