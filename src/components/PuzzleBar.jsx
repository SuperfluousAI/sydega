import { useRef } from 'react';

import ChangelogBell from './ChangelogBell.jsx';
import { useScrollHints } from './useScrollHints.js';

export default function PuzzleBar({
  puzzle,
  simResult,
  evaluation,
  onRun,
  onReset,
  onShowSolution,
  onHint,
  onUndo,
  canUndo,
  celebrationKey = 0,
}) {
  const hasSolution = typeof puzzle.solution === 'function';
  const background = Array.isArray(puzzle.background) ? puzzle.background : [];
  const sources = Array.isArray(puzzle.sources) ? puzzle.sources : [];
  const hasBackground = background.length > 0;
  // Reading paragraphs: prefer the deep `background[]` content; otherwise
  // surface the full `blurb` so multi-sentence intros aren't truncated
  // (this is what the now-removed LessonPanel used to do). When falling
  // back to the blurb, suppress the slug under the title — otherwise the
  // first sentence would render twice (slug + opening of the blurb).
  const readingParagraphs = hasBackground
    ? background
    : (puzzle.blurb ? [puzzle.blurb] : []);
  const slug = puzzle.slug || (hasBackground ? firstSentence(puzzle.blurb) : null);
  const hasReading = readingParagraphs.length > 0 || sources.length > 0;

  // Results column scroll-hint: appears when the sim output + requirements
  // overflow the fixed-height results region.
  const resultsRef = useRef(null);
  const { showUp: showScrollUpHint, showDown: showScrollHint } = useScrollHints(
    resultsRef,
    [simResult, evaluation]
  );

  // Top-pane LEFT-side lesson reading region (duplicate of the right-side
  // LessonPanel content per operator's preference — same lesson, two
  // surfaces). Same scroll-hint pattern; deps include `puzzle.id` so the
  // hook re-evaluates when switching lessons.
  const readingRef = useRef(null);
  const { showUp: showReadingUpHint, showDown: showReadingDownHint } = useScrollHints(
    readingRef,
    [puzzle.id]
  );

  return (
    <header className="puzzle-bar">
      <ChangelogBell />
      <div className="puzzle-info">
        <h1>
          <span className="lesson-pill">Lesson {puzzle.order}</span> {puzzle.title}
        </h1>
        {slug && <p className="puzzle-slug">{slug}</p>}
        {hasReading && (
          <div className="puzzle-reading-wrap">
            {showReadingUpHint && (
              <div className="puzzle-reading-scroll-hint puzzle-reading-scroll-hint--up" aria-hidden="true">
                <span className="scroll-hint-arrow">▲</span>
                <span className="scroll-hint-arrow">▲</span>
              </div>
            )}
            <div ref={readingRef} className="puzzle-reading">
              {readingParagraphs.map((para, i) => (
                <p key={i} className="puzzle-reading-para">{para}</p>
              ))}
              {sources.length > 0 && (
                <div className="puzzle-reading-sources">
                  <div className="puzzle-reading-sources-label">Sources</div>
                  <ul>
                    {sources.map((s, i) => (
                      <li key={i}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
                        {s.note && <span className="puzzle-reading-source-note"> — {s.note}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {showReadingDownHint && (
              <div className="puzzle-reading-scroll-hint" aria-hidden="true">
                <span className="scroll-hint-arrow">▼</span>
                <span className="scroll-hint-arrow">▼</span>
              </div>
            )}
          </div>
        )}
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
        {hasSolution && onHint && (
          <button
            className="ghost-button hint-button"
            onClick={onHint}
            title="Place the next missing canonical piece — one step at a time."
          >
            💡 Hint
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
          {simResult && simResult.ok && simResult.kind === 'dataflow' && (
            <DataflowResults r={simResult} />
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

function DataflowResults({ r }) {
  return (
    <>
      <div className="result-row">
        <span title="Number of test cases your function passed.">
          Test cases passed
        </span>
        <strong className={r.passedCount === r.totalCount && r.totalCount > 0 ? 'good' : 'bad'}>
          {r.passedCount} / {r.totalCount}
        </strong>
      </div>
      {r.playgroundOutput != null && (
        <div className="result-row result-row--divider">
          <span className="result-row-label">Live output (current input)</span>
        </div>
      )}
      {r.playgroundOutput != null && (
        <pre className="dataflow-playground-output">{r.playgroundOutput}</pre>
      )}
    </>
  );
}
