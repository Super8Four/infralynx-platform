import type { NavigationBreadcrumb } from "@infralynx/ui";

export function Breadcrumbs({ items }: { readonly items: readonly NavigationBreadcrumb[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item) => (
          <li key={item.id}>{item.label}</li>
        ))}
      </ol>
    </nav>
  );
}
