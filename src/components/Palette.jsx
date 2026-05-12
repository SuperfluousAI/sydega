import { useState } from 'react';
import {
  componentTypes,
  paletteMetaFor,
  parsePaletteEntry,
} from '../lib/componentTypes.js';
import { puzzles, puzzleOrder } from '../lib/puzzles.js';

// Stable identity for an allowedComponents entry. Role-aware types use
// `type:role`; plain types use the bare typeKey. Powers the "is this entry
// already in the lesson's allowed list?" check for the sandbox section.
function entryKey(entry) {
  const { type, role } = parsePaletteEntry(entry);
  return role ? `${type}:${role}` : type;
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

export default function Palette({ puzzle, onSwitchPuzzle, completedPuzzleIds = [] }) {
  // Per-type drag-time flags. Today only "prepopulate" exists, for Computer.
  // If a future component needs its own flag, generalize this.
  const [prepopulateComputer, setPrepopulateComputer] = useState(false);
  // More-components panel is collapsed by default — it's an escape hatch
  // from the lesson's curated component list, not the primary surface.
  const [moreOpen, setMoreOpen] = useState(false);

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
  };

  const allowedKeys = new Set(puzzle.allowedComponents.map(entryKey));
  const extraEntries = allPaletteEntries().filter((e) => !allowedKeys.has(entryKey(e)));

  return (
    <aside className="palette">
      <h2 className="panel-title">Lessons</h2>
      <div className="lessons-list">
        {puzzleOrder.map((pid) => {
          const p = puzzles[pid];
          const active = p.id === puzzle.id;
          const completed = completedPuzzleIds.includes(pid);
          return (
            <button
              key={pid}
              className={`lesson-item ${active ? 'active' : ''} ${completed ? 'completed' : ''}`}
              onClick={() => onSwitchPuzzle(pid)}
            >
              <span className="lesson-num">{completed ? '✓' : p.order}</span>
              <span className="lesson-title">{p.title}</span>
            </button>
          );
        })}
      </div>

      <h2 className="panel-title" style={{ marginTop: 20 }}>Components</h2>
      <p className="panel-hint">Drag onto the canvas. Wire output → input.</p>
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
