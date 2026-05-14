import { useRef, useState } from 'react';
import {
  componentTypes,
  paletteMetaFor,
  parsePaletteEntry,
} from '../lib/componentTypes.js';
import { puzzles, puzzleOrder } from '../lib/puzzles.js';
import { useScrollHints } from './useScrollHints.js';

// Stable identity for an allowedComponents entry. Role-aware types use
// `type:role`; plain types use the bare typeKey. Powers the "is this entry
// already in the lesson's allowed list?" check for the sandbox section.
function entryKey(entry) {
  const { type, role } = parsePaletteEntry(entry);
  return role ? `${type}:${role}` : type;
}

// Build a tight DOM "ghost" used as the HTML5 drag image so the player sees
// a card that resembles the canvas node, not the full palette-item button.
// Positioned off-screen until setDragImage snapshots it, then removed on
// the next frame (the browser caches the bitmap so removing it doesn't
// disturb the in-flight drag).
function makeDragGhost(meta) {
  if (!meta || typeof document === 'undefined') return null;
  const el = document.createElement('div');
  el.style.cssText = [
    'position: absolute',
    'top: -1000px',
    'left: -1000px',
    'display: inline-flex',
    'align-items: center',
    'gap: 8px',
    'padding: 8px 12px',
    'background: #1a1a2e',
    `border: 2px solid ${meta.color || '#888'}`,
    `border-left: 6px solid ${meta.color || '#888'}`,
    'border-radius: 8px',
    'color: #e6e6f5',
    'font-size: 13px',
    'font-weight: 600',
    'font-family: system-ui, -apple-system, sans-serif',
    'box-shadow: 0 6px 18px rgba(0,0,0,0.55)',
    'white-space: nowrap',
    'pointer-events: none',
  ].join(';');
  const dot = document.createElement('span');
  dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${meta.color || '#888'}`;
  const label = document.createElement('span');
  label.textContent = meta.label || '';
  el.appendChild(dot);
  el.appendChild(label);
  return el;
}

// Flatten componentTypes into a palette-entry list, expanding role-aware
// types (like `service`) into one entry per role. Used by the More-
// components section so the player can grab anything regardless of whether
// the current lesson lists it.
function allPaletteEntries() {
  const out = [];
  for (const [typeKey, meta] of Object.entries(componentTypes)) {
    if (meta.roles) {
      for (const role of Object.keys(meta.roles)) out.push({ type: typeKey, role });
    } else {
      out.push(typeKey);
    }
  }
  return out;
}

export default function Palette({
  puzzle,
  onSwitchPuzzle,
  completedPuzzleIds = [],
  onClearCompletion,
  collapsed = false,
  onToggleCollapse,
  autoStack = true,
  onToggleAutoStack,
  activeTrack = 'systems',
  onSwitchTrack,
}) {
  // Per-type drag-time flags. Today only "prepopulate" exists, for Computer.
  // If a future component needs its own flag, generalize this.
  const [prepopulateComputer, setPrepopulateComputer] = useState(false);
  // More-components panel is collapsed by default — it's an escape hatch
  // from the lesson's curated component list, not the primary surface.
  const [moreOpen, setMoreOpen] = useState(false);

  // Lessons list scroll-hint. As the curriculum grew past 19 lessons the
  // list pushed the Components section off-screen; now the list is height-
  // constrained + scrollable, with the same ▲/▼ overlays PuzzleBar uses
  // for its results column.
  const lessonsRef = useRef(null);
  const {
    showUp: showLessonsUpHint,
    showDown: showLessonsDownHint,
  } = useScrollHints(lessonsRef, [puzzle.id, puzzleOrder.length]);

  // allowedComponents entries are either a string (typeKey only) or an object
  // `{ type, role }` for role-aware types like service. Drag payload carries
  // both type and role so handleDrop can build the right config.
  const handleDragStart = (event, entry) => {
    const { type, role } = parsePaletteEntry(entry);
    event.dataTransfer.setData('application/sdgame-type', type);
    if (role) event.dataTransfer.setData('application/sdgame-role', role);
    if (type === 'computer' && prepopulateComputer) {
      event.dataTransfer.setData('application/sdgame-prepopulate', '1');
    }
    event.dataTransfer.effectAllowed = 'move';
    // Browser default: the drag image is a screenshot of the source element
    // (the entire palette-item button). Replace it with a tight chip that
    // looks like the node that will land on canvas — color dot + label.
    const ghost = makeDragGhost(paletteMetaFor(entry));
    if (ghost) {
      document.body.appendChild(ghost);
      event.dataTransfer.setDragImage(ghost, 10, 10);
      // setDragImage snapshots the element immediately; remove on next frame.
      requestAnimationFrame(() => {
        if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
      });
    }
  };

  const allowedKeys = new Set(puzzle.allowedComponents.map(entryKey));
  const extraEntries = allPaletteEntries().filter((e) => !allowedKeys.has(entryKey(e)));

  if (collapsed) {
    return (
      <aside className="palette palette-collapsed">
        <button
          type="button"
          className="palette-toggle palette-toggle-collapsed"
          onClick={onToggleCollapse}
          aria-expanded="false"
          title="Expand lessons + components"
        >
          ▸
        </button>
      </aside>
    );
  }

  return (
    <aside className="palette">
      <div className="palette-header">
        <h2 className="panel-title" style={{ margin: 0 }}>Lessons</h2>
        {onToggleCollapse && (
          <button
            type="button"
            className="palette-toggle"
            onClick={onToggleCollapse}
            aria-expanded="true"
            title="Collapse lessons + components"
          >
            ◂
          </button>
        )}
      </div>
      {onSwitchTrack && (
        <div className="track-toggle" role="tablist" aria-label="Lesson track">
          <button
            type="button"
            role="tab"
            aria-selected={activeTrack === 'systems'}
            className={`track-pill ${activeTrack === 'systems' ? 'active' : ''}`}
            onClick={() => onSwitchTrack('systems')}
          >
            Systems
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTrack === 'javascript'}
            className={`track-pill ${activeTrack === 'javascript' ? 'active' : ''}`}
            onClick={() => onSwitchTrack('javascript')}
          >
            JavaScript
          </button>
        </div>
      )}
      <div className="lessons-list-wrap">
        {showLessonsUpHint && (
          <div className="puzzle-reading-scroll-hint puzzle-reading-scroll-hint--up" aria-hidden="true">
            <span className="scroll-hint-arrow">▲</span>
            <span className="scroll-hint-arrow">▲</span>
          </div>
        )}
        <div ref={lessonsRef} className="lessons-list">
        {puzzleOrder
          .filter((pid) => {
            // 'systems' is the default — any lesson without an explicit
            // `track` field counts as systems. Only puzzles explicitly
            // tagged `track: 'javascript'` show up in the JS pill.
            const p = puzzles[pid];
            const t = p.track || 'systems';
            return t === activeTrack;
          })
          .map((pid) => {
          const p = puzzles[pid];
          const active = p.id === puzzle.id;
          const completed = completedPuzzleIds.includes(pid);
          return (
            <button
              key={pid}
              className={`lesson-item ${active ? 'active' : ''} ${completed ? 'completed' : ''}`}
              onClick={() => onSwitchPuzzle(pid)}
            >
              <span className="lesson-num">{p.order}</span>
              <span className="lesson-title">{p.title}</span>
              {completed && (
                <span className="lesson-check-wrap">
                  <span className="lesson-check" aria-label="completed">✓</span>
                  {onClearCompletion && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="lesson-check-clear"
                      aria-label={`Clear completion for ${p.title}`}
                      title="Clear completion for this lesson"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClearCompletion(pid);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          onClearCompletion(pid);
                        }
                      }}
                    >
                      ✕
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
        </div>
        {showLessonsDownHint && (
          <div className="puzzle-reading-scroll-hint" aria-hidden="true">
            <span className="scroll-hint-arrow">▼</span>
            <span className="scroll-hint-arrow">▼</span>
          </div>
        )}
      </div>

      <h2 className="panel-title" style={{ marginTop: 20 }}>Components</h2>
      <p className="panel-hint">Drag onto the canvas. Wire output → input.</p>
      {onToggleAutoStack && (
        <label
          className="palette-auto-stack"
          title="When ON, children inside a container snap to a 20px grid and the container resizes to fit. Leave gaps between components for arrow clarity — auto-stack doesn't crunch them together."
        >
          <input
            type="checkbox"
            checked={autoStack}
            onChange={onToggleAutoStack}
          />
          <span>Auto-stack inside containers</span>
        </label>
      )}
      <div className="palette-items">
        {puzzle.allowedComponents.map((entry) => {
          const { type, role } = parsePaletteEntry(entry);
          const meta = paletteMetaFor(entry);
          if (!meta) return null;
          // React-stable key — distinct per (type, role) so two service roles
          // don't share the same DOM identity.
          const key = role ? `${type}:${role}` : type;
          const isComputer = type === 'computer';
          return (
            <div
              key={key}
              className="palette-item"
              draggable
              onDragStart={(e) => handleDragStart(e, entry)}
              style={{ borderLeftColor: meta.color }}
            >
              <span className="palette-dot" style={{ background: meta.color }} />
              <span className="palette-label">{meta.label}</span>
              {isComputer && (
                <label
                  className="palette-flag"
                  title="When checked, dropping a Computer also adds a CPU, RAM, and Disk inside it."
                  // Stop the drag from being initiated by clicks on the checkbox.
                  onDragStart={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={prepopulateComputer}
                    onChange={(e) => setPrepopulateComputer(e.target.checked)}
                  />
                  prepopulate
                </label>
              )}
            </div>
          );
        })}
      </div>

      {extraEntries.length > 0 && (
        <div className="more-components">
          <button
            type="button"
            className="more-components-toggle"
            onClick={() => setMoreOpen((v) => !v)}
          >
            <span className="more-components-caret">{moreOpen ? '▾' : '▸'}</span>
            <span className="more-components-label">More components</span>
            <span className="more-components-count">{extraEntries.length}</span>
          </button>
          {moreOpen && (
            <>
              <p className="panel-hint" style={{ marginTop: 8 }}>
                Sandbox — drag any component onto the canvas, even ones outside this lesson.
              </p>
              <div className="palette-items palette-items--muted">
                {extraEntries.map((entry) => {
                  const { type, role } = parsePaletteEntry(entry);
                  const meta = paletteMetaFor(entry);
                  if (!meta) return null;
                  const key = role ? `${type}:${role}` : type;
                  return (
                    <div
                      key={key}
                      className="palette-item palette-item--muted"
                      draggable
                      onDragStart={(e) => handleDragStart(e, entry)}
                      style={{ borderLeftColor: meta.color }}
                    >
                      <span className="palette-dot" style={{ background: meta.color }} />
                      <span className="palette-label">{meta.label}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
