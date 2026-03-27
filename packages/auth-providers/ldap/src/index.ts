import ldap from "ldapjs";

import type { LdapAuthConfig } from "../../../auth-core/dist/index.js";

function createLdapUrl(config: LdapAuthConfig) {
  return `${config.ssl ? "ldaps" : "ldap"}://${config.server}:${config.port}`;
}

export async function testLdapProvider(config: LdapAuthConfig) {
  const client = ldap.createClient({
    url: createLdapUrl(config),
    connectTimeout: 5000,
    timeout: 5000
  });

  try {
    await new Promise<void>((resolve, reject) => {
      client.bind(config.bindDn, config.bindPassword, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    return {
      valid: true,
      reason: "ldap bind succeeded"
    };
  } finally {
    await new Promise<void>((resolve) => {
      client.unbind(() => resolve());
    });
  }
}

export async function authenticateLdapCredentials(
  config: LdapAuthConfig,
  username: string,
  password: string
) {
  const client = ldap.createClient({
    url: createLdapUrl(config),
    connectTimeout: 5000,
    timeout: 5000
  });

  try {
    await new Promise<void>((resolve, reject) => {
      client.bind(config.bindDn, config.bindPassword, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    const filter = `(|(sAMAccountName=${username})(userPrincipalName=${username})(mail=${username}))`;
    const entry = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
      client.search(config.searchBase, {
        scope: "sub",
        filter,
        attributes: ["dn", "mail", "displayName", "cn", "userPrincipalName", "sAMAccountName"]
      }, (error, search) => {
        if (error || !search) {
          reject(error ?? new Error("ldap search did not return a result stream"));
          return;
        }

        const entries: Record<string, unknown>[] = [];

        search.on("searchEntry", (result: any) => {
          const object = result.object ?? result.pojo?.object;
          if (object && typeof object === "object") {
            entries.push(object as Record<string, unknown>);
          }
        });
        search.on("error", reject);
        search.on("end", () => resolve(entries[0]));
      });
    });

    if (!entry || typeof entry["dn"] !== "string") {
      throw new Error("ldap user could not be found");
    }

    await new Promise<void>((resolve, reject) => {
      client.bind(String(entry["dn"]), password, (error: Error | null) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

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
    await new Promise<void>((resolve) => {
      client.unbind(() => resolve());
    });
  }
}
