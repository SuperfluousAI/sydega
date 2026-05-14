import { useEffect, useRef, useState } from 'react';
import { changelog, currentVersion } from '../lib/changelog.js';

const STORAGE_KEY = 'sdg-changelog-last-seen';

function readLastSeen() {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export default function ChangelogBell() {
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(readLastSeen);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  const hasNew = currentVersion && lastSeen !== currentVersion;

  // Close the dropdown when clicking outside it (but not on the bell itself,
  // since the bell already toggles open state). Esc also closes.
  useEffect(() => {
    if (!open) return;
    const handleDoc = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (buttonRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleDoc);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDoc);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleToggle = () => {
    setOpen((v) => {
      const next = !v;
      // Opening marks the current top entry as seen — the red dot clears as
      // soon as the player has looked at the panel.
      if (next && currentVersion && lastSeen !== currentVersion) {
        try { localStorage.setItem(STORAGE_KEY, currentVersion); } catch { /* ignore */ }
        setLastSeen(currentVersion);
      }
      return next;
    });
  };

  return (
    <div className="changelog-bell-wrap">
      <button
        ref={buttonRef}
        type="button"
        className={`changelog-bell${hasNew ? ' changelog-bell--has-new' : ''}`}
        onClick={handleToggle}
        aria-label={hasNew ? 'What\'s new (unread)' : 'What\'s new'}
        aria-expanded={open}
        title={hasNew ? 'What\'s new — unread updates' : 'What\'s new'}
      >
        <span className="changelog-bell-icon" aria-hidden="true">🔔</span>
        {hasNew && <span className="changelog-bell-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div ref={panelRef} className="changelog-panel" role="dialog" aria-label="Changelog">
          <div className="changelog-panel-header">
            <span>What's new</span>
            <button
              type="button"
              className="changelog-panel-close"
              onClick={() => setOpen(false)}
              aria-label="Close changelog"
            >
              ✕
            </button>
          </div>
          <div className="changelog-panel-body">
            {changelog.map((release) => (
              <div key={release.version} className="changelog-release">
                <div className="changelog-release-date">{release.date}</div>
                <ul className="changelog-release-entries">
                  {release.entries.map((entry, i) => (
                    <li key={i}>{entry}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
