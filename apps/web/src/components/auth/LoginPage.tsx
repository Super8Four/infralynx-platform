import { useEffect, useState } from "react";

import {
  fetchEnabledAuthProviders,
  loginWithLdap,
  loginWithLocal,
  startOidcLogin,
  startSamlLogin,
  type AuthProviderSummary
} from "../../services/auth";

interface LoginPageProps {
  readonly errorMessage: string | null;
  readonly onAuthenticated: () => void;
}

export function LoginPage({ errorMessage, onAuthenticated }: LoginPageProps) {
  const [providers, setProviders] = useState<readonly AuthProviderSummary[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("provider-local");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("ChangeMe!123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(errorMessage);

  useEffect(() => {
    void fetchEnabledAuthProviders()
      .then((response) => {
        setProviders(response.providers);
        const defaultProvider = response.providers.find((provider) => provider.isDefault) ?? response.providers[0];
        if (defaultProvider) {
          setSelectedProviderId(defaultProvider.id);
        }
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Unable to load authentication providers.");
      });
  }, []);

  async function handleSubmit() {
    const provider = providers.find((entry) => entry.id === selectedProviderId);

    if (!provider) {
      setError("Select an authentication provider first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (provider.type === "local") {
        await loginWithLocal(username, password);
        onAuthenticated();
        return;
      }

      if (provider.type === "ldap") {
        await loginWithLdap(provider.id, username, password);
        onAuthenticated();
        return;
      }

      if (provider.type === "oidc") {
        const result = await startOidcLogin(provider.id);
        window.location.href = result.redirectUrl;
        return;
      }

      const result = await startSamlLogin(provider.id);
      window.location.href = result.redirectUrl;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? null;
  const needsCredentials = selectedProvider?.type === "local" || selectedProvider?.type === "ldap";

  return (
    <div className="login-shell">
      <section className="login-shell__panel">
        <p className="page-section__eyebrow">InfraLynx</p>
        <h1>Authentication Gateway</h1>
        <p>
          Local admin access stays available as a fallback while LDAP, OIDC, and SAML providers can run side by side.
        </p>
        {error ? <div className="page-shell__error">{error}</div> : null}
        <label className="entity-form__field">
          <span>Provider</span>
          <select value={selectedProviderId} onChange={(event) => setSelectedProviderId(event.target.value)}>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name} ({provider.type})
              </option>
            ))}
          </select>
        </label>
        {needsCredentials ? (
          <div className="entity-form__grid">
            <label className="entity-form__field">
              <span>Username</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label className="entity-form__field">
              <span>Password</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
          </div>
        ) : null}
        <div className="page-shell__actions">
          <button type="button" onClick={handleSubmit}>
            {loading ? "Working…" : selectedProvider?.type === "oidc" || selectedProvider?.type === "saml" ? "Continue" : "Sign in"}
          </button>
        </div>
      </section>
    </div>
  );
}
