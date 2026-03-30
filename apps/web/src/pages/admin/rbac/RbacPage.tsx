import { useEffect, useMemo, useState } from "react";

import { DetailSection } from "../../../components/detail/DetailSection";
import { DataTable, type DataColumn } from "../../../components/tables/DataTable";
import {
  createProviderRoleMapping,
  createRoleAssignment,
  deleteProviderRoleMapping,
  deleteRoleAssignment,
  fetchRbacSummary,
  type ProviderRoleMapping,
  type RbacRole,
  type RbacRoleAssignment,
  type RbacSummaryResponse
} from "../../../services/rbac";

const roleColumns: readonly DataColumn<RbacRole>[] = [
  { id: "name", label: "Role", sortable: true, render: (role) => role.name },
  { id: "slug", label: "Slug", sortable: true, render: (role) => role.slug },
  { id: "permissionCount", label: "Permissions", sortable: true, render: (role) => String(role.permissionIds.length) }
] as const;

const assignmentColumns: readonly DataColumn<RbacRoleAssignment>[] = [
  { id: "userId", label: "User", sortable: true, render: (assignment) => assignment.userId },
  { id: "roleId", label: "Role", sortable: true, render: (assignment) => assignment.roleId },
  { id: "scopeType", label: "Scope", sortable: true, render: (assignment) => assignment.scopeType },
  { id: "scopeId", label: "Scope ID", sortable: true, render: (assignment) => assignment.scopeId ?? "Global" }
] as const;

const mappingColumns: readonly DataColumn<ProviderRoleMapping>[] = [
  { id: "providerId", label: "Provider", sortable: true, render: (mapping) => mapping.providerId },
  { id: "claimType", label: "Type", sortable: true, render: (mapping) => mapping.claimType },
  { id: "claimValue", label: "Match", sortable: true, render: (mapping) => `${mapping.claimKey}=${mapping.claimValue}` },
  { id: "roleId", label: "Role", sortable: true, render: (mapping) => mapping.roleId }
] as const;

function createEmptyAssignmentForm() {
  return {
    userId: "",
    roleId: "",
    scopeType: "global",
    scopeId: ""
  };
}

function createEmptyMappingForm() {
  return {
    providerId: "",
    claimType: "ldap-group",
    claimKey: "groups",
    claimValue: "",
    roleId: "",
    scopeType: "global",
    scopeId: ""
  };
}

export function RbacPage() {
  const [summary, setSummary] = useState<RbacSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignmentForm, setAssignmentForm] = useState(createEmptyAssignmentForm());
  const [mappingForm, setMappingForm] = useState(createEmptyMappingForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchRbacSummary()
      .then(setSummary)
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Unable to load RBAC data."));
  }, []);

  const currentPermissions = useMemo(
    () => summary?.summary?.permissions.join(", ") ?? "No active RBAC summary is available.",
    [summary]
  );

  async function handleCreateAssignment() {
    setSaving(true);
    setError(null);

    try {
      await createRoleAssignment({
        userId: assignmentForm.userId,
        roleId: assignmentForm.roleId,
        scopeType: assignmentForm.scopeType,
        scopeId: assignmentForm.scopeId || null
      });
      setSummary(await fetchRbacSummary());
      setAssignmentForm(createEmptyAssignmentForm());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save role assignment.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateMapping() {
    setSaving(true);
    setError(null);

    try {
      await createProviderRoleMapping({
        providerId: mappingForm.providerId,
        claimType: mappingForm.claimType,
        claimKey: mappingForm.claimKey,
        claimValue: mappingForm.claimValue,
        roleId: mappingForm.roleId,
        scopeType: mappingForm.scopeType,
        scopeId: mappingForm.scopeId || null
      });
      setSummary(await fetchRbacSummary());
      setMappingForm(createEmptyMappingForm());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save provider role mapping.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAssignment(assignmentId: string) {
    if (!window.confirm("Delete this role assignment?")) {
      return;
    }

    await deleteRoleAssignment(assignmentId);
    setSummary(await fetchRbacSummary());
  }

  async function handleDeleteMapping(mappingId: string) {
    if (!window.confirm("Delete this provider role mapping?")) {
      return;
    }

    await deleteProviderRoleMapping(mappingId);
    setSummary(await fetchRbacSummary());
  }

  return (
    <section className="workspace-page">
      <header className="workspace-page__header">
        <div>
          <p className="page-section__eyebrow">Admin</p>
          <h2>RBAC</h2>
        </div>
        <p className="workspace-page__summary">Manage roles, scoped assignments, and external provider mappings without editing config files.</p>
      </header>
      {error ? <div className="page-shell__error">{error}</div> : null}
      <div className="crud-layout-grid">
        <DetailSection
          title="Current Session"
          fields={[
            { label: "Actor", value: summary?.summary?.identity.displayName ?? "Unknown" },
            { label: "Tenant", value: summary?.summary?.identity.tenantId ?? "Unknown" },
            { label: "Permissions", value: currentPermissions }
          ]}
        />
        <DetailSection
          title="Assignment Guidance"
          fields={[
            { label: "Scopes", value: "Global, tenant, site, and device" },
            { label: "Provider Mapping", value: "LDAP groups, OIDC claims, or SAML attributes" },
            { label: "Enforcement", value: "API-first, UI-gated from the current session summary" }
          ]}
        />
      </div>

      <div className="crud-layout-grid">
        <section className="page-shell__card">
          <h3>Role Assignments</h3>
          <div className="crud-form-grid">
            <select value={assignmentForm.userId} onChange={(event) => setAssignmentForm((current) => ({ ...current, userId: event.target.value }))}>
              <option value="">Select user</option>
              {(summary?.users ?? []).map((user) => (
                <option key={user.id} value={user.id}>{user.displayName}</option>
              ))}
            </select>
            <select value={assignmentForm.roleId} onChange={(event) => setAssignmentForm((current) => ({ ...current, roleId: event.target.value }))}>
              <option value="">Select role</option>
              {(summary?.roles ?? []).map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
            <select value={assignmentForm.scopeType} onChange={(event) => setAssignmentForm((current) => ({ ...current, scopeType: event.target.value }))}>
              <option value="global">Global</option>
              <option value="tenant">Tenant</option>
              <option value="site">Site</option>
              <option value="device">Device</option>
            </select>
            <input
              value={assignmentForm.scopeId}
              onChange={(event) => setAssignmentForm((current) => ({ ...current, scopeId: event.target.value }))}
              placeholder="Scope ID (optional for global)"
            />
            <button type="button" onClick={handleCreateAssignment} disabled={saving}>Save Assignment</button>
          </div>
          <DataTable
            columns={assignmentColumns}
            records={summary?.assignments ?? []}
            sortField="userId"
            sortDirection="asc"
            onSort={() => undefined}
            getRowKey={(record) => record.id}
            onRowSelect={(record) => void handleDeleteAssignment(record.id)}
            emptyState="No role assignments have been defined yet."
          />
        </section>

        <section className="page-shell__card">
          <h3>Provider Role Mappings</h3>
          <div className="crud-form-grid">
            <select value={mappingForm.providerId} onChange={(event) => setMappingForm((current) => ({ ...current, providerId: event.target.value }))}>
              <option value="">Select provider</option>
              {(summary?.providers ?? []).map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
            <select value={mappingForm.claimType} onChange={(event) => setMappingForm((current) => ({ ...current, claimType: event.target.value }))}>
              <option value="ldap-group">LDAP Group</option>
              <option value="oidc-claim">OIDC Claim</option>
              <option value="saml-attribute">SAML Attribute</option>
            </select>
            <input value={mappingForm.claimKey} onChange={(event) => setMappingForm((current) => ({ ...current, claimKey: event.target.value }))} placeholder="Claim key" />
            <input value={mappingForm.claimValue} onChange={(event) => setMappingForm((current) => ({ ...current, claimValue: event.target.value }))} placeholder="Claim value" />
            <select value={mappingForm.roleId} onChange={(event) => setMappingForm((current) => ({ ...current, roleId: event.target.value }))}>
              <option value="">Select role</option>
              {(summary?.roles ?? []).map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
            <select value={mappingForm.scopeType} onChange={(event) => setMappingForm((current) => ({ ...current, scopeType: event.target.value }))}>
              <option value="global">Global</option>
              <option value="tenant">Tenant</option>
              <option value="site">Site</option>
              <option value="device">Device</option>
            </select>
            <input value={mappingForm.scopeId} onChange={(event) => setMappingForm((current) => ({ ...current, scopeId: event.target.value }))} placeholder="Scope ID (optional for global)" />
            <button type="button" onClick={handleCreateMapping} disabled={saving}>Save Mapping</button>
          </div>
          <DataTable
            columns={mappingColumns}
            records={summary?.providerMappings ?? []}
            sortField="providerId"
            sortDirection="asc"
            onSort={() => undefined}
            getRowKey={(record) => record.id}
            onRowSelect={(record) => void handleDeleteMapping(record.id)}
            emptyState="No provider-to-role mappings have been defined yet."
          />
        </section>
      </div>

      <section className="page-shell__card">
        <h3>Role Matrix</h3>
        <DataTable
          columns={roleColumns}
          records={summary?.roles ?? []}
          sortField="name"
          sortDirection="asc"
          onSort={() => undefined}
          getRowKey={(record) => record.id}
          onRowSelect={() => undefined}
          emptyState="No roles are available."
        />
      </section>
    </section>
  );
}
