import { useEffect, useRef, useState } from 'react';

export default function PuzzleBar({
  puzzle,
  simResult,
  evaluation,
  onRun,
  onReset,
  onShowSolution,
  onUndo,
  canUndo,
  celebrationKey = 0,
}) {
  const hasSolution = typeof puzzle.solution === 'function';
  // Slug = a short one-liner under the title. Falls back to the first sentence
  // of the blurb so older lessons without an explicit slug still show context.
  const slug = puzzle.slug || firstSentence(puzzle.blurb);

  // The results column caps height and scrolls when its content (sim metrics
  // + many requirements + warnings) is taller than the cap. Show an explicit
  // "▼ scroll for more" hint bar only when there's actual overflow AND the
  // user isn't already at the bottom. Re-checked on content change (Run +
  // simResult update) and on every scroll event.
  const resultsRef = useRef(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const [showScrollUpHint, setShowScrollUpHint] = useState(false);
  useEffect(() => {
    const el = resultsRef.current;
    if (!el) return;
    const check = () => {
      const overflow = el.scrollHeight - el.clientHeight;
      const atBottom = el.scrollTop >= overflow - 4;
      const atTop = el.scrollTop <= 4;
      setShowScrollHint(overflow > 4 && !atBottom);
      setShowScrollUpHint(overflow > 4 && !atTop);
    };
    check();
    el.addEventListener('scroll', check);
    // ResizeObserver isn't available in jsdom; gracefully degrade by
    // skipping the observer in test environments.
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(check);
      ro.observe(el);
    }
    return () => {
      el.removeEventListener('scroll', check);
      if (ro) ro.disconnect();
    };
  }, [simResult, evaluation]);

  return (
    <header className="puzzle-bar">
      <div className="puzzle-info">
        <h1>
          <span className="lesson-pill">Lesson {puzzle.order}</span> {puzzle.title}
        </h1>
        {slug && <p className="puzzle-slug">{slug}</p>}
      </div>
      <div className="puzzle-actions">
        <button className="primary-button" onClick={onRun}>
          ▶ Run
        </button>
        {onUndo && (
          <button
            className="ghost-button"
            onClick={onUndo}
            disabled={!canUndo}
            title={canUndo ? 'Undo (Cmd/Ctrl+Z)' : 'Nothing to undo'}
          >
            ↶ Undo
          </button>
        )}
        {hasSolution && onShowSolution && (
          <button
            className="ghost-button"
            onClick={onShowSolution}
            title="Replace the canvas with a working solution for this lesson"
          >
            ✨ Show solution
          </button>
        )}
        <button className="ghost-button" onClick={onReset}>
          Reset
        </button>
      </div>
      <div className="puzzle-results-wrap">
      {showScrollUpHint && (
        <div className="puzzle-results-scroll-hint puzzle-results-scroll-hint--up" aria-hidden="true">
          <span className="scroll-hint-arrow">▲</span>
          <span className="scroll-hint-arrow">▲</span>
        </div>
      )}
      <div
        ref={resultsRef}
        className={`puzzle-results${simResult ? ' puzzle-results--has-data' : ''}`}
      >
        {!simResult && <div className="dim">Press Run to test your system.</div>}
        {simResult && !simResult.ok && <div className="bad">Error: {simResult.error}</div>}
        {simResult && simResult.ok && simResult.kind === 'flow' && <FlowResults r={simResult} />}
        {simResult && simResult.ok && simResult.kind === 'composition' && (
          <CompositionResults r={simResult} />
        )}
        {simResult && simResult.ok && simResult.kind === 'connectivity' && (
          <ConnectivityResults r={simResult} />
        )}
        {simResult && simResult.ok && (
          <div className="requirements">
            {evaluation.results.map((r) => (
              <div key={r.key} className={`req ${r.passed ? 'good' : 'bad'}`}>
                <div className="req-line">
                  {r.passed ? '✓' : '✗'} {r.label}
                </div>
                {!r.passed && r.lesson && <div className="req-lesson">{r.lesson}</div>}
              </div>
            ))}
            {simResult.warnings && simResult.warnings.length > 0 && (
              <div className="warnings">
                {simResult.warnings.map((w, i) => (
                  <div key={i} className="warning">⚠ {w}</div>
                ))}
              </div>
            )}
            {evaluation.passed && (
              <div key={celebrationKey} className="banner good celebrate">
                <span className="celebrate-emoji">🎉</span> Puzzle solved!
              </div>
            )}
          </div>
        )}
      </div>
      {showScrollHint && (
        <div className="puzzle-results-scroll-hint" aria-hidden="true">
          <span className="scroll-hint-arrow">▼</span>
          <span className="scroll-hint-arrow">▼</span>
        </div>
      )}
      </div>
    </header>
  );
}

function firstSentence(text) {
  if (!text || typeof text !== 'string') return null;
  // Match up to first '.', '!', '?' followed by whitespace or end of string.
  // Falls back to the full string if no sentence-ender is found.
  const m = text.match(/^[^.!?]+[.!?](?:\s|$)/);
  return (m ? m[0] : text).trim();
}

function FlowResults({ r }) {
  const hasWrites = r.totalWriteAttempted > 0;
  return (
    <>
      <div className="result-row">
        <span title="Read requests successfully handled per second (totals across all sinks reached).">
          Reads served
        </span>
        <strong>
          {Math.round(r.totalReadServed).toLocaleString()} / {Math.round(r.totalReadAttempted).toLocaleString()} req/s
        </strong>
      </div>
      {hasWrites && (
        <div className="result-row">
          <span title="Write requests successfully handled per second. Read Replicas reject writes.">
            Writes served
          </span>
          <strong>
            {Math.round(r.totalWriteServed).toLocaleString()} / {Math.round(r.totalWriteAttempted).toLocaleString()} req/s
          </strong>
        </div>
      )}
      <div className="result-row">
        <span title="Requests the system couldn't serve — a node along the path was at capacity. The bottleneck row points at where.">
          Dropped
        </span>
        <strong className={r.totalDropped > 0 ? 'bad' : 'good'}>
          {Math.round(r.totalDropped).toLocaleString()} req/s
        </strong>
      </div>
      <div className="result-row">
        <span title="Mean latency per request, accumulated along the path it travels. Cache hits short-circuit before reaching slow downstream nodes.">
          Avg latency
        </span>
        <strong>{r.avgLatency.toFixed(1)} ms</strong>
      </div>
      {r.avgP99Latency != null && r.avgP99Latency > 0 && (
        <div className="result-row">
          <span title="99th percentile latency — the slowest 1% of requests are at least this slow. Tail behavior, not average. Industry default: ~3× the mean unless a component declares its own p99.">
            p99 latency
          </span>
          <strong>{r.avgP99Latency.toFixed(1)} ms</strong>
        </div>
      )}
      {r.bottleneckLabel && r.totalDropped > 0 && (
        <div className="result-row">
          <span title="The node currently dropping the most traffic. Start here when scaling — bigger capacity, more peers behind a load balancer, or a different topology.">
            Bottleneck
          </span>
          <strong className="bad">{r.bottleneckLabel}</strong>
        </div>
      )}
      {r.totalBackgroundAttempted > 0 && (
        <>
          <div className="result-row result-row--divider">
            <span className="result-row-label">Background (async)</span>
          </div>
          <div className="result-row">
            <span title="Background jobs that fully completed — the Queue's enqueue rate became this many jobs/s reaching a downstream sink.">
              Jobs drained
            </span>
            <strong>
              {Math.round(r.totalBackgroundServed).toLocaleString()} / {Math.round(r.totalBackgroundAttempted).toLocaleString()} jobs/s
            </strong>
          </div>
          <div className="result-row">
            <span title="Percentage of queued jobs that made it through Workers to a sink. The headline async trap: this can be 5% while sync success is 100%.">
              Background success
            </span>
            <strong className={r.backgroundSuccessRate >= 0.99 ? 'good' : 'bad'}>
              {(r.backgroundSuccessRate * 100).toFixed(1)}%
            </strong>
          </div>
        </>
      )}
    </>
  );
}

function CompositionResults({ r }) {
  return (
    <>
      <div className="result-row">
        <span>Programs hosted</span>
        <strong className={r.allHosted && r.programCount > 0 ? 'good' : 'bad'}>
          {r.allHosted && r.programCount > 0 ? 'all' : 'not all'}
        </strong>
      </div>
      <div className="result-row">
        <span>Orphan hardware</span>
        <strong className={r.orphanCount === 0 ? 'good' : 'bad'}>{r.orphanCount}</strong>
      </div>
    </>
  );
}

function ConnectivityResults({ r }) {
  return (
    <div className="result-row">
      <span>Visitors reaching VPS</span>
      <strong className={r.allReach && r.visitorCount > 0 ? 'good' : 'bad'}>
        {r.allReach && r.visitorCount > 0 ? 'all' : 'not all'}
      </strong>
    </div>
  );
}
