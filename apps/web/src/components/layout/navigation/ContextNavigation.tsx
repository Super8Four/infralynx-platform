import type { NavigationContextLink } from "@infralynx/ui";

export function ContextNavigation({
  title,
  summary,
  links
}: {
  readonly title: string;
  readonly summary: string;
  readonly links: readonly NavigationContextLink[];
}) {
  return (
    <section className="context-nav">
      <div className="context-nav__header">
        <p className="page-section__eyebrow">Context</p>
        <h3>{title}</h3>
      </div>
      <p className="context-nav__summary">{summary}</p>
      <ul className="context-nav__links">
        {links.map((link) => (
          <li key={link.id}>
            <a href={link.href}>{link.label}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
