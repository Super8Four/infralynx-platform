import type { FormEvent, ReactNode } from "react";

export interface FormFieldDefinition {
  readonly id: string;
  readonly label: string;
  readonly type?: "text" | "number" | "select";
  readonly required?: boolean;
  readonly placeholder?: string;
  readonly options?: readonly { value: string; label: string }[];
}

interface EntityFormProps {
  readonly title: string;
  readonly fields: readonly FormFieldDefinition[];
  readonly values: Record<string, string>;
  readonly errors: Record<string, string>;
  readonly submitLabel: string;
  readonly onChange: (fieldId: string, value: string) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly actions?: ReactNode;
}

export function EntityForm({
  title,
  fields,
  values,
  errors,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
  actions
}: EntityFormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="entity-form__header">
        <div>
          <p className="page-section__eyebrow">Form</p>
          <h3>{title}</h3>
        </div>
        {actions}
      </div>
      <div className="entity-form__grid">
        {fields.map((field) => (
          <label key={field.id} className="entity-form__field">
            <span>
              {field.label}
              {field.required ? " *" : ""}
            </span>
            {field.type === "select" ? (
              <select
                value={values[field.id] ?? ""}
                onChange={(event) => onChange(field.id, event.target.value)}
              >
                <option value="">Select…</option>
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type ?? "text"}
                value={values[field.id] ?? ""}
                placeholder={field.placeholder}
                onChange={(event) => onChange(field.id, event.target.value)}
              />
            )}
            {errors[field.id] ? <small>{errors[field.id]}</small> : null}
          </label>
        ))}
      </div>
      <div className="entity-form__footer">
        <button type="submit">{submitLabel}</button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
