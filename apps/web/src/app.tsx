import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import { workspaceMetadata } from "../../../packages/config/dist/index.js";
import { shellNavigation, workspacePanels, getNavigationItem } from "../../../packages/ui/dist/index.js";

function getSectionFromHash(): string {
  const hash = window.location.hash.replace(/^#/, "");

  return shellNavigation.some((item) => item.id === hash) ? hash : "overview";
}

export function App() {
  const [activeSection, setActiveSection] = useState(() => getSectionFromHash());
  const deferredSection = useDeferredValue(activeSection);

  useEffect(() => {
    const onHashChange = () => {
      startTransition(() => {
        setActiveSection(getSectionFromHash());
      });
    };

    window.addEventListener("hashchange", onHashChange);

    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const activeItem = useMemo(() => getNavigationItem(deferredSection), [deferredSection]);

  const navigation = shellNavigation.map((item) => ({
    ...item,
    active: item.id === activeSection
  }));

  return (
    <div className="shell">
      <aside className="shell__rail">
        <div className="shell__brand">
          <span className="shell__brand-mark" />
          <div>
            <p>InfraLynx</p>
            <span>Enterprise infrastructure control plane</span>
          </div>
        </div>

        <nav className="shell__nav" aria-label="Primary">
          {navigation.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={item.active ? "shell__nav-link shell__nav-link--active" : "shell__nav-link"}
              style={{ "--nav-accent": item.accent } as React.CSSProperties}
            >
              <span>{item.label}</span>
              <small>{item.domain}</small>
            </a>
          ))}
        </nav>

        <div className="shell__rail-footer">
          <p>Workspace state</p>
          <strong>Structured for multi-domain delivery</strong>
        </div>
      </aside>

      <main className="shell__workspace">
        <header className="shell__header">
          <div>
            <p className="shell__eyebrow">UI shell baseline</p>
            <h1>{workspaceMetadata.name}</h1>
          </div>

          <div className="shell__header-meta">
            <span>Active section</span>
            <strong>{activeItem.label}</strong>
          </div>
        </header>

        <section className="shell__hero" id={activeItem.id}>
          <div className="shell__hero-copy">
            <p className="shell__eyebrow">Operational shell</p>
            <h2>One workspace for physical, logical, and policy infrastructure.</h2>
            <p>
              The first UI layer separates domains clearly, keeps navigation persistent, and leaves
              room for deep operational surfaces without collapsing into dashboard-card clutter.
            </p>
          </div>

          <div className="shell__hero-grid" aria-label="Domain overview">
            {workspacePanels.map((panel) => (
              <article key={panel.id} className="shell__panel">
                <p className="shell__panel-eyebrow">{panel.eyebrow}</p>
                <h3>{panel.title}</h3>
                <p>{panel.summary}</p>
                <ul>
                  {panel.indicators.map((indicator) => (
                    <li key={indicator}>{indicator}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="shell__strip">
          <div>
            <span>Navigation model</span>
            <strong>Persistent left rail with domain-first wayfinding</strong>
          </div>
          <div>
            <span>Surface model</span>
            <strong>Primary workspace plus contextual right rail</strong>
          </div>
          <div>
            <span>Design baseline</span>
            <strong>Dark-first shell with restrained accent signaling</strong>
          </div>
        </section>
      </main>

      <aside className="shell__context">
        <section className="shell__context-block">
          <p className="shell__eyebrow">Current focus</p>
          <h3>{activeItem.label}</h3>
          <p>
            Navigation changes are hash-driven so the shell works immediately without backend
            routing. Domain apps can replace the central workspace later without reworking the outer
            frame.
          </p>
        </section>

        <section className="shell__context-block">
          <p className="shell__eyebrow">Shell decisions</p>
          <ul className="shell__notes">
            <li>Navigation remains domain-led instead of feature-led.</li>
            <li>Context rail is reserved for status, selection, and workflow cues.</li>
            <li>Shared UI tokens live in `@infralynx/ui` to prevent app-only drift.</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
