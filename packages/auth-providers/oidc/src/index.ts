import { decodeJwt } from "jose";
import * as client from "openid-client";

import type { OidcAuthConfig } from "../../../auth-core/dist/index.js";

async function discover(config: OidcAuthConfig) {
  return client.discovery(new URL(config.issuerUrl), config.clientId, config.clientSecret);
}

export async function testOidcProvider(config: OidcAuthConfig) {
  await discover(config);
  return {
    valid: true,
    reason: "oidc discovery succeeded"
  };
}

export async function buildOidcAuthorizationRedirect(config: OidcAuthConfig, expectedState?: string) {
  const discovered = await discover(config);
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = expectedState ?? client.randomState();
  const redirectUrl = client.buildAuthorizationUrl(discovered, {
    redirect_uri: config.redirectUri,
    scope: "openid profile email",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state
  });

  return {
    redirectUrl: redirectUrl.toString(),
    codeVerifier,
    state
  };
}

export async function completeOidcAuthorization(
  config: OidcAuthConfig,
  callbackUrl: URL,
  input: {
    readonly codeVerifier: string;
    readonly expectedState: string;
  }
) {
  const discovered = await discover(config);
  const tokens = await client.authorizationCodeGrant(discovered, callbackUrl, {
    pkceCodeVerifier: input.codeVerifier,
    expectedState: input.expectedState
  });

  const idToken = typeof tokens.id_token === "string" ? decodeJwt(tokens.id_token) : null;
  const userInfo =
    typeof tokens.access_token === "string"
      ? await client.fetchUserInfo(discovered, tokens.access_token, client.skipSubjectCheck)
      : null;

  const subject =
    (typeof idToken?.sub === "string" ? idToken.sub : null) ??
    (typeof userInfo?.sub === "string" ? userInfo.sub : null);

  if (!subject) {
    throw new Error("oidc callback did not include a stable subject");
  }

  return {
    externalId: subject,
    username:
      (typeof idToken?.email === "string" ? idToken.email : null) ??
      (typeof userInfo?.email === "string" ? userInfo.email : null) ??
      subject,
    displayName:
      (typeof idToken?.name === "string" ? idToken.name : null) ??
      (typeof userInfo?.name === "string" ? userInfo.name : null) ??
      subject
  };
}
