import { SAML, type Profile, type SamlConfig } from "@node-saml/node-saml";

import type { SamlAuthConfig } from "../../../auth-core/dist/index.js";

interface ParsedMetadata {
  readonly entryPoint: string;
  readonly idpCert: string;
}

function parseMetadataXml(metadataXml: string): ParsedMetadata {
  const urlMatch =
    metadataXml.match(/SingleSignOnService[^>]+Location="([^"]+)"/i) ??
    metadataXml.match(/Location='([^']+)'/i);
  const certMatch =
    metadataXml.match(/<X509Certificate>([^<]+)<\/X509Certificate>/i) ??
    metadataXml.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/i);

  if (!urlMatch?.[1] || !certMatch?.[1]) {
    throw new Error("saml metadata did not contain the expected SSO URL and signing certificate");
  }

  return {
    entryPoint: urlMatch[1],
    idpCert: certMatch[1].replace(/\s+/g, "")
  };
}

async function loadMetadata(config: SamlAuthConfig): Promise<string> {
  if (config.metadataXml) {
    return config.metadataXml;
  }

  if (!config.metadataUrl) {
    throw new Error("saml provider requires metadata XML or metadata URL");
  }

  const response = await fetch(config.metadataUrl);

  if (!response.ok) {
    throw new Error(`unable to fetch saml metadata: ${response.status}`);
  }

  return response.text();
}

async function createSaml(config: SamlAuthConfig) {
  const metadataXml = await loadMetadata(config);
  const parsed = parseMetadataXml(metadataXml);
  const samlConfig: SamlConfig = {
    issuer: config.entityId,
    callbackUrl: config.acsUrl,
    entryPoint: parsed.entryPoint,
    idpCert: parsed.idpCert,
    wantAssertionsSigned: true,
    signatureAlgorithm: "sha256"
  };

  return {
    saml: new SAML(samlConfig),
    parsed
  };
}

export async function testSamlProvider(config: SamlAuthConfig) {
  await createSaml(config);
  return {
    valid: true,
    reason: "saml metadata parsed successfully"
  };
}

export async function buildSamlAuthorizationRedirect(config: SamlAuthConfig, relayState: string) {
  const { saml } = await createSaml(config);
  const redirectUrl = await saml.getAuthorizeUrlAsync(relayState, undefined, {});

  return {
    redirectUrl
  };
}

export async function completeSamlAuthorization(config: SamlAuthConfig, samlResponse: string) {
  const { saml } = await createSaml(config);
  const result = await saml.validatePostResponseAsync({
    SAMLResponse: samlResponse
  });
  const profile = result.profile as Profile | null;

  if (!profile) {
    throw new Error("saml response did not include a profile");
  }

  const externalId =
    (typeof profile["nameID"] === "string" ? profile["nameID"] : null) ??
    (typeof profile["mail"] === "string" ? profile["mail"] : null);

  if (!externalId) {
    throw new Error("saml profile did not include a stable subject");
  }

  return {
    externalId,
    username:
      (typeof profile["email"] === "string" ? profile["email"] : null) ??
      (typeof profile["mail"] === "string" ? profile["mail"] : null) ??
      externalId,
    displayName:
      (typeof profile["displayName"] === "string" ? profile["displayName"] : null) ??
      (typeof profile["cn"] === "string" ? profile["cn"] : null) ??
      externalId
  };
}
