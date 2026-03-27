import type {
  NavigationAction,
  NavigationContextLink,
  NavigationRoute
} from "../../../../../packages/ui/dist/index.js";

export interface ContextNavigationProps {
  readonly route: NavigationRoute;
  readonly actions: readonly NavigationAction[];
  readonly contextLinks: readonly NavigationContextLink[];
}

export function ContextNavigation({ route, actions, contextLinks }: ContextNavigationProps) {
  return (
    <>
      <section className="shell__context-block shell__context-block--nav">
        <p className="shell__eyebrow">Page hierarchy</p>
        <h3>{route.label}</h3>
        <p>{route.summary}</p>

        <div className="shell__context-links">
          {contextLinks.map((link) => (
            <a key={link.id} href={link.href} className="shell__context-link">
              {link.label}
            </a>
          ))}
        </div>
      </section>

      <section className="shell__context-block shell__context-block--nav">
        <p className="shell__eyebrow">Quick actions</p>
        <div className="shell__action-stack">
          {actions.map((action) => (
            <a key={action.id} href={action.href} className="shell__action-link">
              {action.label}
            </a>
          ))}
        </div>
      </section>
    </>
  );
}
