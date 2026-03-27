import type { CSSProperties } from "react";

import type { NavigationGroup, NavigationRoute } from "../../../../../packages/ui/dist/index.js";

export interface SidebarNavigationProps {
  readonly groups: readonly NavigationGroup[];
  readonly activeRouteId: string;
}

function isRouteActive(route: NavigationRoute, activeRouteId: string) {
  return route.id === activeRouteId;
}

export function SidebarNavigation({ groups, activeRouteId }: SidebarNavigationProps) {
  return (
    <nav className="shell__nav-groups" aria-label="Primary">
      {groups.map((group) => (
        <section key={group.id} className="shell__nav-group" aria-label={group.label}>
          <p className="shell__nav-group-label">{group.label}</p>

          <div className="shell__nav">
            {group.routes.map((route) => (
              <a
                key={route.id}
                href={`#${route.id}`}
                className={
                  isRouteActive(route, activeRouteId)
                    ? "shell__nav-link shell__nav-link--active"
                    : "shell__nav-link"
                }
                style={{ "--nav-accent": route.accent } as CSSProperties}
              >
                <span>{route.label}</span>
                <small>{route.domainLabel}</small>
              </a>
            ))}
          </div>
        </section>
      ))}
    </nav>
  );
}
