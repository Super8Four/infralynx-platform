import type { AuthProviderType } from "../../services/auth";

export interface AuthProviderFormValues {
  readonly name: string;
  readonly type: AuthProviderType;
  readonly enabled: boolean;
  readonly isDefault: boolean;
  readonly config: Record<string, string | boolean>;
}

interface AuthProviderFormProps {
  readonly title: string;
  readonly values: AuthProviderFormValues;
  readonly error: string | null;
  readonly testing: boolean;
  readonly saving: boolean;
  readonly onChange: (next: AuthProviderFormValues) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly onTest: () => void;
}

function providerFields(type: AuthProviderType) {
  if (type === "local") {
    return [{ id: "passwordMinLength", label: "Minimum Password Length", kind: "number" as const }];
  }

  if (type === "ldap") {
    return [
      { id: "server", label: "Server", kind: "text" as const },
      { id: "port", label: "Port", kind: "number" as const },
      { id: "bindDn", label: "Bind DN", kind: "text" as const },
      { id: "bindPassword", label: "Bind Password", kind: "password" as const },
      { id: "searchBase", label: "Search Base", kind: "text" as const },
      { id: "ssl", label: "Use SSL", kind: "checkbox" as const }
    ];
  }

  if (type === "oidc") {
    return [
      { id: "clientId", label: "Client ID", kind: "text" as const },
      { id: "clientSecret", label: "Client Secret", kind: "password" as const },
      { id: "issuerUrl", label: "Issuer URL", kind: "text" as const },
      { id: "redirectUri", label: "Redirect URI", kind: "text" as const }
    ];
  }

  return [
    { id: "metadataUrl", label: "Metadata URL", kind: "text" as const },
    { id: "metadataXml", label: "Metadata XML", kind: "textarea" as const },
    { id: "entityId", label: "Entity ID", kind: "text" as const },
    { id: "acsUrl", label: "ACS URL", kind: "text" as const }
  ];
}

export function AuthProviderForm({
  title,
  values,
  error,
  testing,
  saving,
  onChange,
  onSubmit,
  onCancel,
  onTest
}: AuthProviderFormProps) {
  const fields = providerFields(values.type);

  return (
    <section className="page-shell">
      <header className="workspace-page__header">
        <div>
          <p className="page-section__eyebrow">Authentication</p>
          <h2>{title}</h2>
        </div>
        <p className="workspace-page__summary">
          Provider configuration stays inside the auth service and never leaks library-specific details into the rest of the platform.
        </p>
      </header>
      {error ? <div className="page-shell__error">{error}</div> : null}
      <div className="entity-form">
        <div className="entity-form__grid">
          <label className="entity-form__field">
            <span>Name</span>
            <input
              value={values.name}
              onChange={(event) => onChange({ ...values, name: event.target.value })}
            />
          </label>
          <label className="entity-form__field">
            <span>Type</span>
            <select
              value={values.type}
              onChange={(event) =>
                onChange({
                  ...values,
                  type: event.target.value as AuthProviderType,
                  config: {}
                })
              }
            >
              <option value="local">Local</option>
              <option value="ldap">LDAP</option>
              <option value="oidc">OIDC</option>
              <option value="saml">SAML</option>
            </select>
          </label>
        </div>
        <div className="entity-form__grid">
          <label className="entity-form__field entity-form__field--checkbox">
            <input
              type="checkbox"
              checked={values.enabled}
              onChange={(event) => onChange({ ...values, enabled: event.target.checked })}
            />
            <span>Enabled</span>
          </label>
          <label className="entity-form__field entity-form__field--checkbox">
            <input
              type="checkbox"
              checked={values.isDefault}
              onChange={(event) => onChange({ ...values, isDefault: event.target.checked })}
            />
            <span>Default provider</span>
          </label>
        </div>
        <div className="entity-form__grid">
          {fields.map((field) => (
            <label
              key={field.id}
              className={field.kind === "textarea" ? "entity-form__field entity-form__field--full" : "entity-form__field"}
            >
              <span>{field.label}</span>
              {field.kind === "textarea" ? (
                <textarea
                  rows={6}
                  value={String(values.config[field.id] ?? "")}
                  onChange={(event) =>
                    onChange({
                      ...values,
                      config: { ...values.config, [field.id]: event.target.value }
                    })
                  }
                />
              ) : field.kind === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={Boolean(values.config[field.id])}
                  onChange={(event) =>
                    onChange({
                      ...values,
                      config: { ...values.config, [field.id]: event.target.checked }
                    })
                  }
                />
              ) : (
                <input
                  type={field.kind}
                  value={String(values.config[field.id] ?? "")}
                  onChange={(event) =>
                    onChange({
                      ...values,
                      config: { ...values.config, [field.id]: event.target.value }
                    })
                  }
                />
              )}
            </label>
          ))}
        </div>
        <div className="page-shell__actions">
          <button type="button" className="button-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button-secondary" onClick={onTest}>
            {testing ? "Testing…" : "Test Connection"}
          </button>
          <button type="button" onClick={onSubmit}>
            {saving ? "Saving…" : "Save Provider"}
          </button>
        </div>
      </div>
    </section>
  );
}
