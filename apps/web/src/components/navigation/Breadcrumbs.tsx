import type { NavigationBreadcrumb } from "../../../../../packages/ui/dist/index.js";

export interface BreadcrumbsProps {
  readonly items: readonly NavigationBreadcrumb[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="shell__breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={item.id} className="shell__breadcrumb">
          <span>{item.label}</span>
          {index < items.length - 1 ? <small aria-hidden="true">/</small> : null}
        </span>
      ))}
    </nav>
  );
}
