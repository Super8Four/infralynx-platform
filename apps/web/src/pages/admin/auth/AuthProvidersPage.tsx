import { useEffect, useMemo, useState } from "react";

import { AuthProviderForm, type AuthProviderFormValues } from "../../../components/auth/AuthProviderForm";
import { DetailSection } from "../../../components/detail/DetailSection";
import { DataTable, type DataColumn } from "../../../components/tables/DataTable";
import {
  deleteAuthProvider,
  fetchAuthProvider,
  fetchAuthProviders,
  saveAuthProvider,
  testAuthProvider,
  type AuthProviderSummary
} from "../../../services/auth";

const columns: readonly DataColumn<AuthProviderSummary>[] = [
  { id: "name", label: "Name", sortable: true, render: (provider) => provider.name },
  { id: "type", label: "Type", sortable: true, render: (provider) => provider.type },
  { id: "enabled", label: "Enabled", sortable: true, render: (provider) => (provider.enabled ? "Yes" : "No") },
  { id: "isDefault", label: "Default", sortable: true, render: (provider) => (provider.isDefault ? "Yes" : "No") }
] as const;

export interface AuthProvidersPageProps {
  readonly mode: "list" | "new" | "detail" | "edit";
  readonly recordId: string | null;
}

function createDefaultFormValues(): AuthProviderFormValues {
  return {
    name: "",
    type: "local",
    enabled: true,
    isDefault: false,
    config: {
      passwordMinLength: "12"
    }
  };
}

function toFormValues(provider: AuthProviderSummary | null): AuthProviderFormValues {
  return {
    name: provider?.name ?? "",
    type: provider?.type ?? "local",
    enabled: provider?.enabled ?? true,
    isDefault: provider?.isDefault ?? false,
    config: Object.fromEntries(Object.entries(provider?.configSummary ?? {}).map(([key, value]) => [key, String(value ?? "")]))
  };
}

export function AuthProvidersPage({ mode, recordId }: AuthProvidersPageProps) {
  const [providers, setProviders] = useState<readonly AuthProviderSummary[]>([]);
  const [detail, setDetail] = useState<AuthProviderSummary | null>(null);
  const [formValues, setFormValues] = useState<AuthProviderFormValues>(createDefaultFormValues());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void fetchAuthProviders()
      .then((response) => setProviders(response.providers))
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Unable to load providers."));
  }, []);

  useEffect(() => {
    if (!recordId) {
      setDetail(null);
      setFormValues(createDefaultFormValues());
      return;
    }

    void fetchAuthProvider(recordId)
      .then((response) => {
        setDetail(response.provider);
        setFormValues(toFormValues(response.provider));
      })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Unable to load provider."));
  }, [recordId]);

  const sortedProviders = useMemo(() => [...providers].sort((left, right) => left.name.localeCompare(right.name)), [providers]);

  function navigate(path: string) {
    window.location.hash = path;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const response = await saveAuthProvider({
        id: recordId ?? undefined,
        name: formValues.name,
        type: formValues.type,
        enabled: formValues.enabled,
        isDefault: formValues.isDefault,
        config: formValues.config
      });
      navigate(`/auth-providers/${response.provider.id}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save provider.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!recordId) {
      setError("Save the provider before running a connection test.");
      return;
    }

    setTesting(true);
    setError(null);

    try {
      const result = await testAuthProvider(recordId);
      setError(`${result.status}: ${result.reason}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Provider test failed.");
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    if (!recordId || !window.confirm("Delete this authentication provider?")) {
      return;
    }

    try {
      await deleteAuthProvider(recordId);
      navigate("/auth-providers");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete provider.");
    }
  }

  if (mode === "new" || mode === "edit") {
    return (
      <AuthProviderForm
        title={mode === "new" ? "Add Authentication Provider" : "Edit Authentication Provider"}
        values={formValues}
        error={error}
        testing={testing}
        saving={saving}
        onChange={setFormValues}
        onSubmit={handleSave}
        onCancel={() => navigate(recordId ? `/auth-providers/${recordId}` : "/auth-providers")}
        onTest={handleTest}
      />
    );
  }

  if (mode === "detail" && detail) {
    return (
      <section className="workspace-page">
        <header className="workspace-page__header">
          <div>
            <p className="page-section__eyebrow">Authentication</p>
            <h2>{detail.name}</h2>
          </div>
          <p className="workspace-page__summary">{detail.type} provider with encrypted configuration and runtime connection validation.</p>
        </header>
        {error ? <div className="page-shell__error">{error}</div> : null}
        <div className="page-shell__actions">
          <button type="button" className="button-secondary" onClick={() => navigate(`/auth-providers/${detail.id}/edit`)}>
            Edit
          </button>
          <button type="button" className="button-secondary" onClick={handleTest}>
            {testing ? "Testing…" : "Test Connection"}
          </button>
          <button type="button" className="button-danger" onClick={handleDelete}>
            Delete
          </button>
        </div>
        <DetailSection
          title={detail.name}
          fields={[
            { label: "Type", value: detail.type },
            { label: "Enabled", value: detail.enabled ? "Yes" : "No" },
            { label: "Default", value: detail.isDefault ? "Yes" : "No" },
            { label: "Created", value: new Date(detail.createdAt).toLocaleString() }
          ]}
        />
        <DetailSection
          title="Configuration Summary"
          fields={Object.entries(detail.configSummary).map(([label, value]) => ({
            label,
            value: String(value ?? "Not set")
          }))}
        />
      </section>
    );
  }

  return (
    <section className="workspace-page">
      <header className="workspace-page__header">
        <div>
          <p className="page-section__eyebrow">Admin</p>
          <h2>Authentication Providers</h2>
        </div>
        <p className="workspace-page__summary">Configure local, LDAP, OIDC, and SAML providers without editing config files or leaking raw secrets into the UI.</p>
      </header>
      {error ? <div className="page-shell__error">{error}</div> : null}
      <div className="page-shell__toolbar">
        <div className="page-shell__filters">
          <span className="page-shell__badge">{sortedProviders.length} configured</span>
        </div>
        <button type="button" onClick={() => navigate("/auth-providers/new")}>
          Add Provider
        </button>
      </div>
      <DataTable
        columns={columns}
        records={sortedProviders}
        sortField="name"
        sortDirection="asc"
        onSort={() => undefined}
        getRowKey={(record) => record.id}
        onRowSelect={(record) => navigate(`/auth-providers/${record.id}`)}
        emptyState="No authentication providers are configured yet."
      />
    </section>
  );
}
