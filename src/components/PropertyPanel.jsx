import CodeEditor from './CodeEditor.jsx';
import { metaFor } from '../lib/componentTypes.js';

export default function PropertyPanel({ node, onChange, onDelete, onToggleFailed }) {
  if (!node) {
    return (
      <aside className="property-panel">
        <h2 className="panel-title">Properties</h2>
        <p className="panel-hint">Select a node to edit its properties.</p>
      </aside>
    );
  }

  // Role-aware so service nodes show "App Server" / "Worker" with the
  // corresponding color in the header.
  const meta = metaFor(node);
  const cfg = node.data.config;

  const update = (key, value) => {
    onChange(node.id, { ...cfg, [key]: value });
  };

  return (
    <aside className="property-panel">
      <h2 className="panel-title" style={{ color: meta.color }}>
        {meta.label}
      </h2>
      {meta.props.length === 0 && (
        <p className="panel-hint">No properties — this node aggregates whatever you wire into it.</p>
      )}
      <div className="property-fields">
        {meta.props.map((p) => (
          <label key={p.key} className="property-field">
            <span>{p.label}</span>
            {p.type === 'code' ? (
              <CodeEditor
                value={cfg[p.key] ?? ''}
                onChange={(next) => update(p.key, next)}
                rows={14}
                ariaLabel={p.label}
              />
            ) : p.type === 'text' ? (
              <input
                type="text"
                value={cfg[p.key] ?? ''}
                onChange={(e) => update(p.key, e.target.value)}
              />
            ) : (
              <input
                type="number"
                min={p.min}
                max={p.max}
                step={p.step || 1}
                value={cfg[p.key]}
                onChange={(e) => {
                  const v = e.target.value;
                  update(p.key, v === '' ? '' : Number(v));
                }}
              />
            )}
          </label>
        ))}
      </div>
      {onToggleFailed && (
        <button
          className={node.data.failed ? 'restore-button' : 'fail-button'}
          onClick={() => onToggleFailed(node.id)}
          title={
            node.data.failed
              ? 'Bring this node back online — the simulator will see it again.'
              : 'Take this node offline — the simulator removes it and any edges touching it. Reversible.'
          }
        >
          {node.data.failed ? '↑ Restore node' : '↓ Simulate failure'}
        </button>
      )}
      <button className="danger-button" onClick={() => onDelete(node.id)}>
        Delete node
      </button>
    </aside>
  );
}
