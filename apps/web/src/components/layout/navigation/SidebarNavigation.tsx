import type { NavigationGroup, NavigationRoute } from "@infralynx/ui";

interface SidebarNavigationProps {
  readonly groups: readonly NavigationGroup[];
  readonly activeRouteId: string;
  readonly activeResourceCountByRoute: Record<string, number | null>;
}

export function SidebarNavigation({
  groups,
  activeRouteId,
  activeResourceCountByRoute
}: SidebarNavigationProps) {
  return (
    <nav className="nav-sidebar" aria-label="Primary navigation">
      {groups.map((group) => (
        <section key={group.id} className="nav-sidebar__group">
          <p className="nav-sidebar__group-label">{group.label}</p>
          <ul className="nav-sidebar__routes">
            {group.routes.map((route) => (
              <SidebarNavigationItem
                key={route.id}
                route={route}
                active={route.id === activeRouteId}
                count={activeResourceCountByRoute[route.id] ?? null}
              />
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function SidebarNavigationItem({
  route,
  active,
  count
}: {
  readonly route: NavigationRoute;
  readonly active: boolean;
  readonly count: number | null;
}) {
  return (
    <li>
      <a className={active ? "nav-sidebar__route nav-sidebar__route--active" : "nav-sidebar__route"} href={`#/${route.id}`}>
        <span>{route.label}</span>
        <span className="nav-sidebar__meta">
          {count === null ? route.group : String(count)}
        </span>
      </a>
    </li>
  );
}
