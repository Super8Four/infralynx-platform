import {
  FileBackedAuthRepository,
  type AuthenticatedUserProfile,
  type LocalAuthConfig,
  validateLocalPassword
} from "../../../auth-core/dist/index.js";

export function testLocalProvider(config: LocalAuthConfig) {
  return {
    valid: Number.isInteger(config.passwordMinLength) && config.passwordMinLength >= 8,
    reason: "local provider configuration validated"
  };
}

export function authenticateLocalCredentials(
  repository: FileBackedAuthRepository,
  input: {
    readonly username: string;
    readonly password: string;
  }
): AuthenticatedUserProfile {
  const provider = repository.getProviderById("provider-local");

  if (!provider || !provider.enabled) {
    throw new Error("local provider is not enabled");
  }

  const user = repository.getUserByUsername(input.username);

  if (!user || user.status !== "active" || !validateLocalPassword(user, input.password)) {
    throw new Error("local credentials were rejected");
  }

  return {
    user,
    provider,
    externalId: user.username
  };
}
