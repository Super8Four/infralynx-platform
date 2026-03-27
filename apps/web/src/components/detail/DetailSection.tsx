import type { ReactNode } from "react";

interface DetailField {
  readonly label: string;
  readonly value: ReactNode;
}

interface DetailSectionProps {
  readonly title: string;
  readonly fields: readonly DetailField[];
  readonly children?: ReactNode;
}

export function DetailSection({ title, fields, children }: DetailSectionProps) {
  return (
    <section className="detail-section">
      <header className="detail-section__header">
        <p className="page-section__eyebrow">Detail</p>
        <h3>{title}</h3>
      </header>
      <dl className="detail-section__grid">
        {fields.map((field) => (
          <div key={field.label} className="detail-section__row">
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </section>
  );
}
