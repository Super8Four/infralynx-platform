import type { ReactNode } from "react";

export interface AppShellProps {
  readonly brand: ReactNode;
  readonly sidebar: ReactNode;
  readonly topbar: ReactNode;
  readonly content: ReactNode;
  readonly context: ReactNode;
}

export function AppShell({ brand, sidebar, topbar, content, context }: AppShellProps) {
  return (
    <div className="shell">
      <aside className="shell__rail">
        <div className="shell__rail-head">{brand}</div>
        {sidebar}
      </aside>

      <main className="shell__workspace">
        {topbar}
        {content}
      </main>

      <aside className="shell__context">{context}</aside>
    </div>
  );
}
