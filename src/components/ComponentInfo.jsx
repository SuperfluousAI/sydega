// Bottom info pane. Shows pedagogical context for whatever node is selected
// (or a placeholder if nothing is). The data lives in src/lib/componentInfo.js
// and is keyed by component type. The PropertyPanel on the right is for
// EDITING the component; this pane is for UNDERSTANDING it.

import { metaFor } from '../lib/componentTypes.js';
import { infoFor } from '../lib/componentInfo.js';

export default function ComponentInfo({ node }) {
  if (!node) {
    return (
      <div className="component-info component-info-empty">
        <p>Click a component on the canvas to learn what it is and how to use it.</p>
      </div>
    );
  }

  // Role-aware lookup so service nodes show the right info for their role.
  const meta = metaFor(node);
  const info = infoFor(node);
  if (!meta || !info) {
    return (
      <div className="component-info component-info-empty">
        <p>(No info available for this component type.)</p>
      </div>
    );
  }

  return (
    <div className="component-info">
      <header className="component-info-header">
        <span className="component-info-dot" style={{ background: meta.color }} />
        <h3 className="component-info-title">{meta.label}</h3>
      </header>
      <div className="component-info-body">
        <Section label="What it is">{info.description}</Section>
        <Section label="How to use it">{info.usage}</Section>
        <Section label="Connections">{info.connects}</Section>
        {info.realWorld && <Section label="In the real world">{info.realWorld}</Section>}
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div className="component-info-section">
      <div className="component-info-label">{label}</div>
      <div className="component-info-text">{children}</div>
    </div>
  );
}
