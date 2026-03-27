import { Client } from "ldapts";

import type { LdapAuthConfig } from "../../../auth-core/dist/index.js";

function createLdapUrl(config: LdapAuthConfig) {
  return `${config.ssl ? "ldaps" : "ldap"}://${config.server}:${config.port}`;
}

export async function testLdapProvider(config: LdapAuthConfig) {
  const client = new Client({
    url: createLdapUrl(config),
    connectTimeout: 5000,
    timeout: 5000
  });

  try {
    await client.bind(config.bindDn, config.bindPassword);
    return {
      valid: true,
      reason: "ldap bind succeeded"
    };
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

export async function authenticateLdapCredentials(
  config: LdapAuthConfig,
  username: string,
  password: string
) {
  const client = new Client({
    url: createLdapUrl(config),
    connectTimeout: 5000,
    timeout: 5000
  });

  try {
    await client.bind(config.bindDn, config.bindPassword);
    const filter = `(|(sAMAccountName=${username})(userPrincipalName=${username})(mail=${username}))`;
    const search = await client.search(config.searchBase, {
      scope: "sub",
      filter,
      attributes: ["dn", "mail", "displayName", "cn", "userPrincipalName", "sAMAccountName"]
    });
    const entry = search.searchEntries[0] as Record<string, unknown> | undefined;

    if (!entry || typeof entry["dn"] !== "string") {
      throw new Error("ldap user could not be found");
    }

    await client.bind(entry["dn"], password);

    return {
      externalId: entry["dn"],
      username:
        typeof entry["userPrincipalName"] === "string"
          ? entry["userPrincipalName"]
          : typeof entry["mail"] === "string"
            ? entry["mail"]
            : typeof entry["sAMAccountName"] === "string"
              ? entry["sAMAccountName"]
              : username,
      displayName:
        typeof entry["displayName"] === "string"
          ? entry["displayName"]
          : typeof entry["cn"] === "string"
            ? entry["cn"]
            : username
    };
  } finally {
    await client.unbind().catch(() => undefined);
  }
}
