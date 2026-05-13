// Static right-side panel that shows the current lesson's deep content:
// blurb + background paragraphs + sources links. Independent of node selection.
// Pairs with PropertyPanel (which is for the selected component).
//
// Collapsible: clicking the chevron in the header retracts the panel to just
// its title row, freeing vertical space for PropertyPanel above. Collapse
// state is owned by App and applied to the parent grid so the rows resize.
export default function LessonPanel({ puzzle, collapsed = false, onToggleCollapse }) {
  if (!puzzle) return null;
  const hasBackground = Array.isArray(puzzle.background) && puzzle.background.length > 0;
  const hasSources = Array.isArray(puzzle.sources) && puzzle.sources.length > 0;
  return (
    <aside className={`lesson-panel${collapsed ? ' lesson-panel-collapsed' : ''}`}>
      <header className="lesson-panel-header">
        <h3 className="lesson-panel-title">
          Lesson {puzzle.order} — {puzzle.title}
        </h3>
        {onToggleCollapse && (
          <button
            type="button"
            className="lesson-panel-toggle"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand lesson' : 'Collapse lesson'}
          >
            {collapsed ? '▸' : '▾'}
          </button>
        )}
      </header>
      {!collapsed && (
        <div className="lesson-panel-body">
          {puzzle.blurb && <p className="lesson-panel-blurb">{puzzle.blurb}</p>}
          {hasBackground && (
            <div className="lesson-panel-reading">
              {puzzle.background.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}
          {hasSources && (
            <div className="reading-sources">
              <h3>Sources</h3>
              <ul>
                {puzzle.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer noopener">
                      {s.title}
                    </a>
                    {s.note && <span className="reading-sources-note"> — {s.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
