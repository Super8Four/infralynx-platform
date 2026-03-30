import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { compareSync, hashSync } from "bcrypt";
import { SignJWT, jwtVerify } from "jose";

import type {
  ExternalRoleMappingInput,
  PermissionGrant,
  ProviderRoleMapping,
  RoleAssignment,
  RoleDefinition,
  ScopedAccessContext
} from "../../core-domain/dist/index.js";
import {
  createRoleAssignmentId,
  defaultCoreRoles,
  evaluateScopedAccess,
  expandRoleAssignmentsToGrants,
  resolveProviderRoleAssignments
} from "../../core-domain/dist/index.js";

export type AuthenticationMethod =
  | "local"
  | "ldap"
  | "oidc"
  | "saml"
  | "api-token"
  | "service-account";
export type AuthProviderType = "local" | "ldap" | "oidc" | "saml";
export type AuthLogLevel = "info" | "warn" | "error";

export interface AuthIdentity {
  readonly id: string;
  readonly subject: string;
  readonly tenantId: string;
  readonly method: AuthenticationMethod;
  readonly roleIds: readonly string[];
  readonly assignments?: readonly RoleAssignment[];
  readonly grants?: readonly PermissionGrant[];
  readonly displayName?: string;
}

export interface AuthSession {
  readonly id: string;
  readonly identityId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface AccessDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly grants?: readonly PermissionGrant[];
}

export interface AuthProviderSummary {
  readonly id: string;
  readonly name: string;
  readonly type: AuthProviderType;
  readonly enabled: boolean;
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly configSummary: Record<string, unknown>;
}

export interface AuthProviderRecord {
  readonly id: string;
  readonly name: string;
  readonly type: AuthProviderType;
  readonly enabled: boolean;
  readonly isDefault: boolean;
  readonly encryptedConfig: string;
  readonly createdAt: string;
}

export interface AuthUserRecord {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly tenantId: string;
  readonly roleIds: readonly string[];
  readonly status: "active" | "disabled";
  readonly passwordHash: string | null;
  readonly createdAt: string;
}

export interface AuthUserProviderMapping {
  readonly userId: string;
  readonly providerId: string;
  readonly externalId: string;
}

export type AuthUserRoleAssignment = RoleAssignment;

export type AuthProviderRoleMapping = ProviderRoleMapping;

export interface AuthSessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly providerId: string;
  readonly subject: string;
  readonly tenantId: string;
  readonly roleIds: readonly string[];
  readonly displayName: string;
  readonly accessExpiresAt: string;
  readonly refreshExpiresAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AuthTransactionRecord {
  readonly id: string;
  readonly providerId: string;
  readonly type: "oidc" | "saml";
  readonly redirectBaseUrl: string;
  readonly codeVerifier?: string;
  readonly expectedState?: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface AuthLogRecord {
  readonly id: string;
  readonly level: AuthLogLevel;
  readonly action: string;
  readonly actorId: string | null;
  readonly providerId: string | null;
  readonly sessionId: string | null;
  readonly message: string;
  readonly createdAt: string;
}

export interface SessionTokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly session: AuthSessionRecord;
}

export interface LocalAuthConfig {
  readonly passwordMinLength: number;
}

export interface LdapAuthConfig {
  readonly server: string;
  readonly port: number;
  readonly bindDn: string;
  readonly bindPassword: string;
  readonly searchBase: string;
  readonly ssl: boolean;
}

export interface OidcAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly issuerUrl: string;
  readonly redirectUri: string;
}

export interface SamlAuthConfig {
  readonly metadataUrl: string | null;
  readonly metadataXml: string | null;
  readonly entityId: string;
  readonly acsUrl: string;
}

export type AuthProviderConfig =
  | LocalAuthConfig
  | LdapAuthConfig
  | OidcAuthConfig
  | SamlAuthConfig;

interface AuthRepositoryState {
  readonly providers: readonly AuthProviderRecord[];
  readonly users: readonly AuthUserRecord[];
  readonly mappings: readonly AuthUserProviderMapping[];
  readonly roleAssignments: readonly AuthUserRoleAssignment[];
  readonly providerRoleMappings: readonly AuthProviderRoleMapping[];
  readonly sessions: readonly AuthSessionRecord[];
  readonly transactions: readonly AuthTransactionRecord[];
  readonly logs: readonly AuthLogRecord[];
}

const sessionAccessTtlMinutes = 15;
const sessionRefreshTtlHours = 12;
const transactionTtlMinutes = 10;

const secretSummaryKeys = new Set([
  "bindPassword",
  "clientSecret",
  "metadataXml",
  "idpCert",
  "privateKey",
  "publicCert"
]);

function createDefaultState(): AuthRepositoryState {
  const createdAt = new Date().toISOString();

  return {
    providers: [
      {
        id: "provider-local",
        name: "Local Administrator",
        type: "local",
        enabled: true,
        isDefault: true,
        encryptedConfig: "",
        createdAt
      }
    ],
    users: [
      {
        id: "user-local-admin",
        username: "admin",
        displayName: "InfraLynx Local Admin",
        tenantId: "tenant-ops",
        roleIds: ["core-platform-admin"],
        status: "active",
        passwordHash: hashSync("ChangeMe!123", 10),
        createdAt
      }
    ],
    mappings: [
      {
        userId: "user-local-admin",
        providerId: "provider-local",
        externalId: "admin"
      }
    ],
    roleAssignments: [
      {
        id: createRoleAssignmentId({
          userId: "user-local-admin",
          roleId: "core-platform-admin",
          scopeType: "global",
          scopeId: null
        }),
        userId: "user-local-admin",
        roleId: "core-platform-admin",
        scopeType: "global",
        scopeId: null,
        createdAt
      }
    ],
    providerRoleMappings: [],
    sessions: [],
    transactions: [],
    logs: []
  };
}

function createSessionTimestamps(now = new Date()) {
  const accessExpiresAt = new Date(now.getTime() + sessionAccessTtlMinutes * 60_000).toISOString();
  const refreshExpiresAt = new Date(now.getTime() + sessionRefreshTtlHours * 60 * 60_000).toISOString();

  return {
    accessExpiresAt,
    refreshExpiresAt
  };
}

function deriveKey(secret: string): Uint8Array {
  return createHash("sha256").update(secret).digest();
}

function getOrCreateMasterSecret(masterKeyPath: string): string {
  if (process.env["INFRALYNX_AUTH_MASTER_KEY"]) {
    return process.env["INFRALYNX_AUTH_MASTER_KEY"];
  }

  if (existsSync(masterKeyPath)) {
    return readFileSync(masterKeyPath, "utf8");
  }

  const generated = randomBytes(32).toString("hex");
  mkdirSync(dirname(masterKeyPath), { recursive: true });
  writeFileSync(masterKeyPath, generated);

  return generated;
}

function encryptConfig(payload: Record<string, unknown>, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    content: encrypted.toString("base64")
  });
}

function decryptConfig<TConfig extends AuthProviderConfig>(payload: string, secret: string): TConfig {
  const parsed = JSON.parse(payload) as {
    readonly iv: string;
    readonly tag: string;
    readonly content: string;
  };
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(parsed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.content, "base64")),
    decipher.final()
  ]);

  return JSON.parse(decrypted.toString("utf8")) as TConfig;
}

function maskConfigSummary(config: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => {
      if (secretSummaryKeys.has(key)) {
        return [key, typeof value === "string" && value.length > 0 ? "••••••••" : null];
      }

      return [key, value];
    })
  );
}

export class FileBackedAuthRepository {
  readonly #stateFilePath: string;
  readonly #masterSecret: string;
  #loadedState: AuthRepositoryState | null = null;

  constructor(stateFilePath: string, masterKeyPath: string) {
    this.#stateFilePath = stateFilePath;
    this.#masterSecret = getOrCreateMasterSecret(masterKeyPath);
  }

  listProviders(): readonly AuthProviderSummary[] {
    return this.#loadState().providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      enabled: provider.enabled,
      isDefault: provider.isDefault,
      createdAt: provider.createdAt,
      configSummary: maskConfigSummary(this.getProviderConfig(provider.id) as unknown as Record<string, unknown>)
    }));
  }

  getProviderById(providerId: string): AuthProviderSummary | null {
    return this.listProviders().find((provider) => provider.id === providerId) ?? null;
  }

  getProviderRecord(providerId: string): AuthProviderRecord | null {
    return this.#loadState().providers.find((provider) => provider.id === providerId) ?? null;
  }

  getProviderConfig<TConfig extends AuthProviderConfig>(providerId: string): TConfig {
    const provider = this.getProviderRecord(providerId);

    if (!provider) {
      throw new Error(`provider ${providerId} was not found`);
    }

    if (provider.encryptedConfig.length === 0 && provider.type === "local") {
      return { passwordMinLength: 12 } as TConfig;
    }

    return decryptConfig<TConfig>(provider.encryptedConfig, this.#masterSecret);
  }

  saveProvider(input: {
    readonly id?: string;
    readonly name: string;
    readonly type: AuthProviderType;
    readonly enabled: boolean;
    readonly isDefault: boolean;
    readonly config: AuthProviderConfig;
  }): AuthProviderSummary {
    const state = this.#loadState();
    const providerId = input.id ?? `provider-${randomUUID()}`;
    const createdAt = state.providers.find((provider) => provider.id === providerId)?.createdAt ?? new Date().toISOString();
    const nextProvider: AuthProviderRecord = {
      id: providerId,
      name: input.name,
      type: input.type,
      enabled: input.enabled,
      isDefault: input.isDefault,
      encryptedConfig: encryptConfig(input.config as unknown as Record<string, unknown>, this.#masterSecret),
      createdAt
    };
    const nextProviders = state.providers
      .filter((provider) => provider.id !== providerId)
      .map((provider) => (nextProvider.isDefault ? { ...provider, isDefault: false } : provider))
      .concat(nextProvider)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    this.#persistState({
      ...state,
      providers: nextProviders
    });

    return this.getProviderById(providerId) as AuthProviderSummary;
  }

  deleteProvider(providerId: string): boolean {
    const state = this.#loadState();
    const provider = state.providers.find((entry) => entry.id === providerId);

    if (!provider || provider.type === "local") {
      return false;
    }

    this.#persistState({
      ...state,
      providers: state.providers.filter((entry) => entry.id !== providerId),
      mappings: state.mappings.filter((entry) => entry.providerId !== providerId)
    });

    return true;
  }

  listEnabledProviders(): readonly AuthProviderSummary[] {
    return this.listProviders().filter((provider) => provider.enabled);
  }

  listUsers(): readonly AuthUserRecord[] {
    return this.#loadState().users;
  }

  getUserById(userId: string): AuthUserRecord | null {
    return this.#loadState().users.find((user) => user.id === userId) ?? null;
  }

  getUserByUsername(username: string): AuthUserRecord | null {
    return this.#loadState().users.find((user) => user.username.toLowerCase() === username.trim().toLowerCase()) ?? null;
  }

  saveUser(record: AuthUserRecord): AuthUserRecord {
    const state = this.#loadState();
    const nextUsers = state.users.filter((user) => user.id !== record.id).concat(record);
    this.#persistState({
      ...state,
      users: nextUsers
    });

    return record;
  }

  listRoleAssignments(): readonly AuthUserRoleAssignment[] {
    return this.#loadState().roleAssignments;
  }

  listRoleAssignmentsByUser(userId: string): readonly AuthUserRoleAssignment[] {
    return this.#loadState().roleAssignments.filter((assignment) => assignment.userId === userId);
  }

  saveRoleAssignment(assignment: AuthUserRoleAssignment): AuthUserRoleAssignment {
    const state = this.#loadState();
    this.#persistState({
      ...state,
      roleAssignments: state.roleAssignments.filter((entry) => entry.id !== assignment.id).concat(assignment)
    });

    return assignment;
  }

  deleteRoleAssignment(assignmentId: string): boolean {
    const state = this.#loadState();
    const exists = state.roleAssignments.some((assignment) => assignment.id === assignmentId);

    if (!exists) {
      return false;
    }

    this.#persistState({
      ...state,
      roleAssignments: state.roleAssignments.filter((assignment) => assignment.id !== assignmentId)
    });

    return true;
  }

  getMapping(providerId: string, externalId: string): AuthUserProviderMapping | null {
    return this.#loadState().mappings.find((mapping) => mapping.providerId === providerId && mapping.externalId === externalId) ?? null;
  }

  saveMapping(mapping: AuthUserProviderMapping): AuthUserProviderMapping {
    const state = this.#loadState();
    this.#persistState({
      ...state,
      mappings: state.mappings
        .filter((entry) => !(entry.providerId === mapping.providerId && entry.externalId === mapping.externalId))
        .concat(mapping)
    });

    return mapping;
  }

  listProviderRoleMappings(providerId?: string): readonly AuthProviderRoleMapping[] {
    const mappings = this.#loadState().providerRoleMappings;
    return providerId ? mappings.filter((mapping) => mapping.providerId === providerId) : mappings;
  }

  saveProviderRoleMapping(mapping: AuthProviderRoleMapping): AuthProviderRoleMapping {
    const state = this.#loadState();
    this.#persistState({
      ...state,
      providerRoleMappings: state.providerRoleMappings.filter((entry) => entry.id !== mapping.id).concat(mapping)
    });

    return mapping;
  }

  deleteProviderRoleMapping(mappingId: string): boolean {
    const state = this.#loadState();
    const exists = state.providerRoleMappings.some((mapping) => mapping.id === mappingId);

    if (!exists) {
      return false;
    }

    this.#persistState({
      ...state,
      providerRoleMappings: state.providerRoleMappings.filter((mapping) => mapping.id !== mappingId)
    });

    return true;
  }

  createSessionRecord(identity: {
    readonly userId: string;
    readonly providerId: string;
    readonly subject: string;
    readonly tenantId: string;
    readonly roleIds: readonly string[];
    readonly displayName: string;
  }): AuthSessionRecord {
    const now = new Date();
    const timestamps = createSessionTimestamps(now);
    const record: AuthSessionRecord = {
      id: `session-${randomUUID()}`,
      userId: identity.userId,
      providerId: identity.providerId,
      subject: identity.subject,
      tenantId: identity.tenantId,
      roleIds: identity.roleIds,
      displayName: identity.displayName,
      accessExpiresAt: timestamps.accessExpiresAt,
      refreshExpiresAt: timestamps.refreshExpiresAt,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    const state = this.#loadState();
    this.#persistState({
      ...state,
      sessions: state.sessions.concat(record)
    });

    return record;
  }

  getSessionRecord(sessionId: string): AuthSessionRecord | null {
    return this.#loadState().sessions.find((session) => session.id === sessionId) ?? null;
  }

  updateSession(record: AuthSessionRecord): AuthSessionRecord {
    const state = this.#loadState();
    this.#persistState({
      ...state,
      sessions: state.sessions.filter((session) => session.id !== record.id).concat(record)
    });

    return record;
  }

  deleteSession(sessionId: string): boolean {
    const state = this.#loadState();
    const exists = state.sessions.some((session) => session.id === sessionId);

    if (!exists) {
      return false;
    }

    this.#persistState({
      ...state,
      sessions: state.sessions.filter((session) => session.id !== sessionId)
    });

    return true;
  }

  createTransaction(
    input: Omit<AuthTransactionRecord, "id" | "createdAt" | "expiresAt"> & { readonly id?: string }
  ): AuthTransactionRecord {
    const now = new Date();
    const record: AuthTransactionRecord = {
      id: input.id ?? `transaction-${randomUUID()}`,
      providerId: input.providerId,
      type: input.type,
      redirectBaseUrl: input.redirectBaseUrl,
      codeVerifier: input.codeVerifier,
      expectedState: input.expectedState,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + transactionTtlMinutes * 60_000).toISOString()
    };
    const state = this.#loadState();
    this.#persistState({
      ...state,
      transactions: state.transactions.concat(record)
    });

    return record;
  }

  consumeTransaction(transactionId: string): AuthTransactionRecord | null {
    const state = this.#loadState();
    const transaction = state.transactions.find((entry) => entry.id === transactionId) ?? null;

    if (!transaction) {
      return null;
    }

    this.#persistState({
      ...state,
      transactions: state.transactions.filter((entry) => entry.id !== transactionId)
    });

    if (new Date(transaction.expiresAt).getTime() < Date.now()) {
      return null;
    }

    return transaction;
  }

  appendLog(input: Omit<AuthLogRecord, "id" | "createdAt">): AuthLogRecord {
    const record: AuthLogRecord = {
      id: `auth-log-${randomUUID()}`,
      createdAt: new Date().toISOString(),
      ...input
    };
    const state = this.#loadState();
    this.#persistState({
      ...state,
      logs: state.logs.concat(record)
    });

    return record;
  }

  listLogs(): readonly AuthLogRecord[] {
    return this.#loadState().logs;
  }

  #loadState(): AuthRepositoryState {
    if (this.#loadedState) {
      return this.#loadedState;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.#stateFilePath, "utf8")) as Partial<AuthRepositoryState>;
      this.#loadedState = {
        providers: parsed.providers ?? createDefaultState().providers,
        users: parsed.users ?? createDefaultState().users,
        mappings: parsed.mappings ?? createDefaultState().mappings,
        roleAssignments: parsed.roleAssignments ?? createDefaultState().roleAssignments,
        providerRoleMappings: parsed.providerRoleMappings ?? [],
        sessions: parsed.sessions ?? [],
        transactions: parsed.transactions ?? [],
        logs: parsed.logs ?? []
      };
    } catch {
      const initialState = createDefaultState();
      const localProvider = initialState.providers[0];
      this.#loadedState = {
        ...initialState,
        providers: [
          {
            ...localProvider,
            encryptedConfig: encryptConfig({ passwordMinLength: 12 }, this.#masterSecret)
          }
        ]
      };
      this.#persistState(this.#loadedState);
    }

    return this.#loadedState;
  }

  #persistState(state: AuthRepositoryState) {
    mkdirSync(dirname(this.#stateFilePath), { recursive: true });
    writeFileSync(this.#stateFilePath, JSON.stringify(state, null, 2));
    this.#loadedState = state;
  }
}

export interface AuthenticatedUserProfile {
  readonly user: AuthUserRecord;
  readonly provider: AuthProviderSummary;
  readonly externalId: string;
}

function createGlobalAssignmentsFromIdentity(identity: AuthIdentity): readonly AuthUserRoleAssignment[] {
  return identity.roleIds.map((roleId) => ({
    id: createRoleAssignmentId({
      userId: identity.id,
      roleId,
      scopeType: "global",
      scopeId: null
    }),
    userId: identity.id,
    roleId,
    scopeType: "global",
    scopeId: null,
    createdAt: new Date().toISOString()
  }));
}

export function resolveAccessDecision(
  identity: AuthIdentity,
  roles: readonly RoleDefinition[],
  permissionId: string,
  context: ScopedAccessContext = {}
): AccessDecision {
  const assignments = identity.assignments ?? createGlobalAssignmentsFromIdentity(identity);
  const grants = identity.grants ?? expandRoleAssignmentsToGrants(assignments, roles);
  const decision = evaluateScopedAccess(grants, permissionId, {
    tenantId: context.tenantId ?? identity.tenantId,
    siteId: context.siteId ?? null,
    deviceId: context.deviceId ?? null
  });

  return {
    allowed: decision.allowed,
    reason: decision.reason,
    grants: decision.grants
  };
}

export function createSession(identityId: string, issuedAt: string, ttlMinutes: number): AuthSession {
  const issuedAtDate = new Date(issuedAt);
  const expiresAtDate = new Date(issuedAtDate.getTime() + ttlMinutes * 60_000);

  return {
    id: `${identityId}:${issuedAtDate.toISOString()}`,
    identityId,
    issuedAt: issuedAtDate.toISOString(),
    expiresAt: expiresAtDate.toISOString()
  };
}

export function validateLocalPassword(user: AuthUserRecord, password: string): boolean {
  return Boolean(user.passwordHash && compareSync(password, user.passwordHash));
}

export function createPasswordHash(password: string): string {
  return hashSync(password, 10);
}

async function signToken(payload: Record<string, unknown>, secret: string, expiresIn: string): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(deriveKey(secret));
}

export async function issueSessionTokens(
  repository: FileBackedAuthRepository,
  session: AuthSessionRecord,
  masterKeyPath: string
): Promise<SessionTokenPair> {
  const secret = getOrCreateMasterSecret(masterKeyPath);
  const accessToken = await signToken(
    {
      sessionId: session.id,
      userId: session.userId,
      tenantId: session.tenantId,
      roleIds: session.roleIds,
      providerId: session.providerId,
      subject: session.subject,
      displayName: session.displayName,
      tokenType: "access"
    },
    secret,
    `${sessionAccessTtlMinutes}m`
  );
  const refreshToken = await signToken(
    {
      sessionId: session.id,
      userId: session.userId,
      tokenType: "refresh"
    },
    secret,
    `${sessionRefreshTtlHours}h`
  );

  repository.appendLog({
    level: "info",
    action: "auth.session.issued",
    actorId: session.userId,
    providerId: session.providerId,
    sessionId: session.id,
    message: `session issued for ${session.displayName}`
  });

  return {
    accessToken,
    refreshToken,
    session
  };
}

export async function verifySessionToken(
  token: string,
  masterKeyPath: string,
  expectedTokenType: "access" | "refresh"
): Promise<Record<string, unknown>> {
  const secret = getOrCreateMasterSecret(masterKeyPath);
  const { payload } = await jwtVerify(token, deriveKey(secret));

  if (payload["tokenType"] !== expectedTokenType) {
    throw new Error(`expected ${expectedTokenType} token`);
  }

  return payload as Record<string, unknown>;
}

export function createAuthIdentityFromSession(
  session: AuthSessionRecord,
  repository?: FileBackedAuthRepository
): AuthIdentity {
  const storedAssignments = repository?.listRoleAssignmentsByUser(session.userId) ?? [];
  const assignments = storedAssignments.length > 0 ? storedAssignments : undefined;
  const grants = assignments ? expandRoleAssignmentsToGrants(assignments, defaultCoreRoles) : undefined;

  return {
    id: session.userId,
    subject: session.subject,
    tenantId: session.tenantId,
    method: session.providerId === "provider-local" ? "local" : "api-token",
    roleIds: session.roleIds,
    assignments,
    grants,
    displayName: session.displayName
  };
}

export async function resolveRequestAuthIdentity(input: {
  readonly authorizationHeader: string | undefined;
  readonly repository: FileBackedAuthRepository;
  readonly masterKeyPath: string;
}): Promise<AuthIdentity | null> {
  const header = input.authorizationHeader;

  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();
  const payload = await verifySessionToken(token, input.masterKeyPath, "access");
  const sessionId = typeof payload["sessionId"] === "string" ? payload["sessionId"] : null;

  if (!sessionId) {
    return null;
  }

  const session = input.repository.getSessionRecord(sessionId);

  if (!session || new Date(session.accessExpiresAt).getTime() < Date.now()) {
    return null;
  }

  return createAuthIdentityFromSession(session, input.repository);
}

export function requirePermission(
  identity: AuthIdentity | null,
  permissionId: string,
  roles: readonly RoleDefinition[] = defaultCoreRoles,
  context: ScopedAccessContext = {}
): AccessDecision {
  if (!identity) {
    return { allowed: false, reason: "authentication is required" };
  }

  return resolveAccessDecision(identity, roles, permissionId, context);
}

export function validateProviderInput(type: AuthProviderType, config: Record<string, unknown>): readonly string[] {
  const errors: string[] = [];

  if (type === "local") {
    const minLength = Number(config["passwordMinLength"] ?? 12);
    if (!Number.isInteger(minLength) || minLength < 8) {
      errors.push("local provider password minimum must be at least 8");
    }
  }

  if (type === "ldap") {
    if (typeof config["server"] !== "string" || config["server"].trim().length === 0) {
      errors.push("ldap server is required");
    }
    if (!Number.isInteger(Number(config["port"]))) {
      errors.push("ldap port must be an integer");
    }
    if (typeof config["bindDn"] !== "string" || config["bindDn"].trim().length === 0) {
      errors.push("ldap bind DN is required");
    }
    if (typeof config["searchBase"] !== "string" || config["searchBase"].trim().length === 0) {
      errors.push("ldap search base is required");
    }
  }

  if (type === "oidc") {
    for (const field of ["clientId", "clientSecret", "issuerUrl", "redirectUri"]) {
      if (typeof config[field] !== "string" || String(config[field]).trim().length === 0) {
        errors.push(`oidc ${field} is required`);
      }
    }
  }

  if (type === "saml") {
    if (
      (typeof config["metadataUrl"] !== "string" || String(config["metadataUrl"]).trim().length === 0) &&
      (typeof config["metadataXml"] !== "string" || String(config["metadataXml"]).trim().length === 0)
    ) {
      errors.push("saml metadata URL or metadata XML is required");
    }
    if (typeof config["entityId"] !== "string" || String(config["entityId"]).trim().length === 0) {
      errors.push("saml entity ID is required");
    }
    if (typeof config["acsUrl"] !== "string" || String(config["acsUrl"]).trim().length === 0) {
      errors.push("saml ACS URL is required");
    }
  }

  return errors;
}

export function normalizeProviderConfig(type: AuthProviderType, payload: Record<string, unknown>): AuthProviderConfig {
  if (type === "local") {
    return { passwordMinLength: Number(payload["passwordMinLength"] ?? 12) };
  }

  if (type === "ldap") {
    return {
      server: String(payload["server"] ?? ""),
      port: Number(payload["port"] ?? 389),
      bindDn: String(payload["bindDn"] ?? ""),
      bindPassword: String(payload["bindPassword"] ?? ""),
      searchBase: String(payload["searchBase"] ?? ""),
      ssl: Boolean(payload["ssl"])
    };
  }

  if (type === "oidc") {
    return {
      clientId: String(payload["clientId"] ?? ""),
      clientSecret: String(payload["clientSecret"] ?? ""),
      issuerUrl: String(payload["issuerUrl"] ?? ""),
      redirectUri: String(payload["redirectUri"] ?? "")
    };
  }

  return {
    metadataUrl: typeof payload["metadataUrl"] === "string" && payload["metadataUrl"].trim().length > 0 ? payload["metadataUrl"] : null,
    metadataXml: typeof payload["metadataXml"] === "string" && payload["metadataXml"].trim().length > 0 ? payload["metadataXml"] : null,
    entityId: String(payload["entityId"] ?? ""),
    acsUrl: String(payload["acsUrl"] ?? "")
  };
}

export function mapExternalIdentityToUser(
  repository: FileBackedAuthRepository,
  input: {
    readonly providerId: string;
    readonly externalId: string;
    readonly username: string;
    readonly displayName: string;
    readonly tenantId?: string;
    readonly roleIds?: readonly string[];
    readonly externalRoles?: ExternalRoleMappingInput;
  }
): AuthenticatedUserProfile {
  const existingMapping = repository.getMapping(input.providerId, input.externalId);
  const mappedUser = existingMapping
    ? repository.getUserById(existingMapping.userId)
    : repository.getUserByUsername(input.username);
  const user =
    mappedUser ??
    repository.saveUser({
      id: `user-${randomUUID()}`,
      username: input.username,
      displayName: input.displayName,
      tenantId: input.tenantId ?? "tenant-ops",
      roleIds: input.roleIds ?? ["core-auditor"],
      status: "active",
      passwordHash: null,
      createdAt: new Date().toISOString()
    });
  const provider = repository.getProviderById(input.providerId);

  if (!provider) {
    throw new Error(`provider ${input.providerId} was not found`);
  }

  repository.saveMapping({
    userId: user.id,
    providerId: input.providerId,
    externalId: input.externalId
  });

  const mappedAssignments = resolveProviderRoleAssignments(
    repository.listProviderRoleMappings(input.providerId),
    input.providerId,
    input.externalRoles ?? {},
    user.id
  );

  for (const assignment of mappedAssignments) {
    repository.saveRoleAssignment(assignment);
  }

  return {
    user:
      mappedAssignments.length > 0
        ? repository.saveUser({
            ...user,
            roleIds: Array.from(
              new Set(
                repository
                  .listRoleAssignmentsByUser(user.id)
                  .map((assignment) => assignment.roleId)
                  .concat(user.roleIds)
              )
            )
          })
        : user,
    provider,
    externalId: input.externalId
  };
}

export function buildLoginSuccessRedirect(
  redirectBaseUrl: string,
  tokens: SessionTokenPair
): string {
  const url = new URL(redirectBaseUrl);
  url.hash =
    `/login/success?accessToken=${encodeURIComponent(tokens.accessToken)}` +
    `&refreshToken=${encodeURIComponent(tokens.refreshToken)}` +
    `&sessionId=${encodeURIComponent(tokens.session.id)}` +
    `&userId=${encodeURIComponent(tokens.session.userId)}` +
    `&providerId=${encodeURIComponent(tokens.session.providerId)}` +
    `&tenantId=${encodeURIComponent(tokens.session.tenantId)}` +
    `&displayName=${encodeURIComponent(tokens.session.displayName)}` +
    `&roleIds=${encodeURIComponent(tokens.session.roleIds.join(","))}` +
    `&accessExpiresAt=${encodeURIComponent(tokens.session.accessExpiresAt)}` +
    `&refreshExpiresAt=${encodeURIComponent(tokens.session.refreshExpiresAt)}`;
  return url.toString();
}

export function buildLoginFailureRedirect(redirectBaseUrl: string, error: string): string {
  const url = new URL(redirectBaseUrl);
  url.hash = `/login?error=${encodeURIComponent(error)}`;
  return url.toString();
}

export function createAuthRepository(stateFilePath: string, masterKeyPath: string) {
  return new FileBackedAuthRepository(stateFilePath, masterKeyPath);
}
