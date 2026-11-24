// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource, WithId } from '@medplum/core';
import {
  Logger,
  OperationOutcomeError,
  badRequest,
  forbidden,
  isGone,
  isNotFound,
  parseLogLevel,
  resolveId,
} from '@medplum/core';
import type {
  Bot,
  ClientApplication,
  Extension,
  Login,
  Project,
  ProjectMembership,
  Reference,
  SmartAppLaunch,
  User,
} from '@medplum/fhirtypes';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getConfig } from './config/loader';
import { getRepoForLogin } from './fhir/accesspolicy';
import { FhirRateLimiter, getFhirQuotaConfig } from './fhir/fhirquota';
import { getInactiveReason } from './fhir/projectmembership';
import type { Repository, SuperAdminRepository, SystemRepository } from './fhir/repo';
import { getGlobalSystemRepo } from './fhir/repo';
import { ResourceCap } from './fhir/resource-cap';
import { hasSmartResourceScopes } from './fhir/smart';
import { getLogger, globalLogger, writeLineToStdout } from './logger';
import type { AuthState } from './oauth/middleware';
import { authenticateTokenImpl } from './oauth/middleware';
import { getRateLimitRedis } from './redis';
import type { IRequestContext } from './request-context-store';
import { requestContextStore } from './request-context-store';
import { getLogTag } from './util/log-tag';
import { generateTraceId, getTraceId } from './util/tracing';

export class RequestContext implements IRequestContext {
  readonly requestId: string;
  readonly traceId: string;
  readonly logger: Logger;

  constructor(requestId: string, traceId: string, logger?: Logger, loggerMetadata?: Record<string, any>) {
    this.requestId = requestId;
    this.traceId = traceId;
    this.logger =
      logger ??
      new Logger(
        writeLineToStdout,
        { ...loggerMetadata, requestId, traceId },
        parseLogLevel(getConfig().logLevel ?? 'info')
      );
  }

  [Symbol.dispose](): void {
    // No-op, descendants may override
  }

  static empty(): RequestContext {
    return new RequestContext('', '');
  }
}

export type AuthenticatedContextOptions = {
  logger?: Logger;
  async?: boolean;
  logTag?: string; // Opaque caller-supplied string included in log output
};

/** Login details of the caller. Under On-Behalf-Of, these still describe the caller, not the delegated member. */
export interface AuthenticatedSession {
  readonly authMethod: Login['authMethod'];
  readonly scope?: string;
  readonly clientId?: string;
  readonly smartAppLaunch?: WithId<SmartAppLaunch>;
}

export interface Attribution {
  /** The caller's `Login.user`. */
  readonly actor: Login['user'];
  /** The delegated member's profile, under On-Behalf-Of. */
  readonly onBehalfOf?: ProjectMembership['profile'];
}

export class AuthenticatedRequestContext extends RequestContext {
  readonly authState: Readonly<AuthState>;
  readonly project: WithId<Project>;
  readonly repo: Repository;
  readonly isAsync: boolean;
  readonly fhirRateLimiter?: FhirRateLimiter;
  readonly resourceCap?: ResourceCap;

  constructor(
    requestId: string,
    traceId: string,
    authState: Readonly<AuthState>,
    repo: Repository,
    options?: AuthenticatedContextOptions
  ) {
    const loggerMetadata: Record<string, any> = {};
    const projectId = repo.currentProject()?.id;
    if (projectId) {
      let profile = authState.membership.profile.reference;
      const asUserProfile = authState.onBehalfOfMembership?.profile.reference;
      if (asUserProfile && asUserProfile !== profile) {
        profile += ` (as ${asUserProfile})`;
      }
      loggerMetadata.projectId = projectId;
      loggerMetadata.profile = profile;
    }
    if (options?.logTag) {
      loggerMetadata.logTag = options.logTag;
    }
    super(requestId, traceId, options?.logger, loggerMetadata);

    this.fhirRateLimiter = getFhirRateLimiter(authState, this.logger);
    this.resourceCap = getResourceCap(authState, this.logger);

    this.authState = authState;
    this.repo = repo;
    const project = repo.currentProject();
    if (!project) {
      throw new Error('Authenticated repository must have a current project');
    }
    this.project = project;
    this.isAsync = options?.async ?? false;
  }

  get membership(): WithId<ProjectMembership> {
    return this.authState.onBehalfOfMembership ?? this.authState.membership;
  }

  get session(): AuthenticatedSession {
    const { login, profile, smartAppLaunch } = this.authState;
    return {
      authMethod: login.authMethod,
      scope: login.scope,
      // Basic auth logins have no client; the ClientApplication is the profile instead
      clientId: resolveId(login.client) ?? (profile?.resourceType === 'ClientApplication' ? profile.id : undefined),
      smartAppLaunch,
    };
  }

  getAttribution(): Attribution {
    return { actor: this.authState.login.user, onBehalfOf: this.authState.onBehalfOfMembership?.profile };
  }

  /**
   * Returns the caller's User, for routes that manage the caller's own account.
   * Refuses On-Behalf-Of, callers that are not Users, and logins limited by SMART resource scopes.
   * @returns The caller's User reference.
   */
  requireCallerUser(): Reference<User> {
    const { membership, onBehalfOfMembership } = this.authState;
    if (
      onBehalfOfMembership ||
      !membership.user?.reference?.startsWith('User/') ||
      hasSmartResourceScopes(this.session)
    ) {
      throw new OperationOutcomeError(forbidden);
    }
    return membership.user as Reference<User>;
  }

  /**
   * Returns the caller's Login, for routes that act on the session itself. Refuses On-Behalf-Of.
   * @returns The caller's Login.
   */
  requireCallerLogin(): Login {
    if (this.authState.onBehalfOfMembership) {
      throw new OperationOutcomeError(forbidden);
    }
    return this.authState.login;
  }

  /**
   * Returns the delegated membership, for routes where a project admin acts on behalf of a member.
   * @returns The On-Behalf-Of membership.
   */
  requireDelegatingAdmin(): WithId<ProjectMembership> {
    const { project, membership, onBehalfOfMembership } = this.authState;
    if (project.superAdmin || !membership.admin) {
      throw new OperationOutcomeError(forbidden);
    }
    if (!onBehalfOfMembership) {
      throw new OperationOutcomeError(badRequest('Requires X-Medplum-On-Behalf-Of'));
    }
    return onBehalfOfMembership;
  }

  /** Requires the caller, not the delegated member, to be in a super admin project. */
  requireSuperAdminCaller(): void {
    if (!this.authState.project.superAdmin) {
      throw new OperationOutcomeError(forbidden);
    }
  }

  get profile(): Reference<ProfileResource | Bot | ClientApplication> {
    return this.membership.profile;
  }

  /**
   * @returns a SystemRepository for the same shard as this context's repository.
   * Use this when you need elevated privileges within request handling.
   */
  get systemRepo(): SystemRepository {
    return this.repo.getSystemRepo();
  }

  [Symbol.dispose](): void {
    this.repo[Symbol.dispose]();
  }
}

export function tryGetRequestContext(): IRequestContext | undefined {
  return requestContextStore.getStore();
}

export function getRequestContext(): IRequestContext {
  const ctx = requestContextStore.getStore();
  if (!ctx) {
    throw new Error('No request context available');
  }
  return ctx;
}

export function getAuthenticatedContext(): AuthenticatedRequestContext {
  const ctx = getRequestContext();
  if (!(ctx instanceof AuthenticatedRequestContext)) {
    throw new Error('Request is not authenticated');
  }
  return ctx;
}

export async function attachRequestContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { requestId, traceId } = requestIds(req);

  // Echo the identifiers so that a caller can correlate its own logs with Medplum's without
  // having to supply (and have Medplum trust) an identifier of its own.
  res.set('X-Request-Id', requestId);
  res.set('X-Trace-Id', traceId);

  let logTag: string | undefined;
  try {
    logTag = getLogTag(req);
  } catch (err: any) {
    // Ensure next() is called in a request context, so later middleware (e.g. logging) can run correctly
    const ctx = new RequestContext(requestId, traceId);
    requestContextStore.run(ctx, () => next(err));
    return;
  }
  const loggerMetadata = logTag ? { logTag } : undefined;

  // Authenticate within an unauthenticated context, so that anything logged during authentication
  // carries the request and trace IDs
  const unauthenticatedCtx = new RequestContext(requestId, traceId, undefined, loggerMetadata);
  let ctx: RequestContext | undefined;
  try {
    const result = await requestContextStore.run(unauthenticatedCtx, () => authenticateTokenImpl(req));
    if (result) {
      const { authState, repo } = result;
      ctx = new AuthenticatedRequestContext(requestId, traceId, authState, repo, { logTag });
    }
  } catch (err: any) {
    // Ensure next() is called in a request context, so later middleware (e.g. logging) can run correctly
    ctx ??= unauthenticatedCtx;
    requestContextStore.run(ctx, () => {
      getLogger().error('Authentication error', { err: err.toString(), stack: err.stack });
      const outcome = badRequest('Authentication error');
      outcome.issue[0].diagnostics = err.toString();
      const wrappedErr = new OperationOutcomeError(outcome, { cause: err });
      next(wrappedErr);
    });
    return;
  }

  ctx ??= unauthenticatedCtx;
  requestContextStore.run(ctx, () => next());
}

export function closeRequestContext(): void {
  const ctx = requestContextStore.getStore();
  if (ctx) {
    ctx[Symbol.dispose]();
  }
}

export function tryRunInRequestContext<T>(requestId: string | undefined, traceId: string | undefined, fn: () => T): T {
  if (requestId && traceId) {
    return requestContextStore.run(new RequestContext(requestId, traceId), fn);
  } else {
    return fn();
  }
}

/**
 * Runs `fn` in a new request context, generating any missing IDs.
 * @param requestId - The request ID to log under; generated if absent.
 * @param traceId - The trace ID to log under; generated if absent.
 * @param fn - The work to run.
 * @param loggerMetadata - Optional fields added to every log line in the context.
 * @returns The result of `fn`.
 */
export function runInRequestContext<T>(
  requestId: string | undefined,
  traceId: string | undefined,
  fn: () => T,
  loggerMetadata?: Record<string, unknown>
): T {
  return requestContextStore.run(
    new RequestContext(requestId ?? randomUUID(), traceId ?? generateTraceId(), undefined, loggerMetadata),
    fn
  );
}

/** Thrown when a serialized auth state's project or membership has been deactivated or deleted. */
export class RevokedAuthStateError extends OperationOutcomeError {}

/**
 * Runs `fn` as the user in `authState`, with its project and memberships re-read so `fn` sees their
 * current versions rather than the serialized ones.
 * @param authState - The serialized auth state to run as.
 * @param requestId - The request ID to log under; generated if absent.
 * @param traceId - The trace ID to log under; generated if absent.
 * @param options - Options for the authenticated context.
 * @param fn - The work to run.
 * @returns The result of `fn`.
 * @throws RevokedAuthStateError if the project or a membership has since been deactivated or deleted.
 */
export async function runInAuthenticatedContext<T>(
  authState: Readonly<AuthState>,
  requestId: string | undefined,
  traceId: string | undefined,
  options: AuthenticatedContextOptions | undefined,
  fn: () => T
): Promise<T> {
  const currentAuthState = await refreshAuthState(authState);
  const repo = await getRepoForLogin(currentAuthState, true);
  requestId ??= randomUUID();
  traceId ??= generateTraceId();

  return requestContextStore.run(
    new AuthenticatedRequestContext(requestId, traceId, currentAuthState, repo, options),
    fn
  );
}

async function refreshAuthState(authState: Readonly<AuthState>): Promise<AuthState> {
  const systemRepo = getGlobalSystemRepo();
  let project: WithId<Project>;
  let membership: WithId<ProjectMembership>;
  let onBehalfOfMembership: WithId<ProjectMembership> | undefined;
  let onBehalfOfProject: WithId<Project> | undefined;
  try {
    [project, membership, onBehalfOfMembership] = await Promise.all([
      systemRepo.readResource<Project>('Project', authState.project.id),
      systemRepo.readResource<ProjectMembership>('ProjectMembership', authState.membership.id),
      authState.onBehalfOfMembership &&
        systemRepo.readResource<ProjectMembership>('ProjectMembership', authState.onBehalfOfMembership.id),
    ]);
    // A super admin can act on behalf of a member of another project, and the work then runs there
    if (onBehalfOfMembership && resolveId(onBehalfOfMembership.project) !== project.id) {
      onBehalfOfProject = await systemRepo.readReference<Project>(onBehalfOfMembership.project);
    }
  } catch (err) {
    if (err instanceof OperationOutcomeError && (isNotFound(err.outcome) || isGone(err.outcome))) {
      throw new RevokedAuthStateError(err.outcome, { cause: err });
    }
    throw err;
  }

  const inactiveReason =
    getInactiveReason(project, membership) ??
    (onBehalfOfMembership && getInactiveReason(onBehalfOfProject ?? project, onBehalfOfMembership));
  if (inactiveReason) {
    throw new RevokedAuthStateError(badRequest(inactiveReason));
  }
  return { ...authState, project, membership, onBehalfOfMembership };
}

export function buildTracingExtension(): Extension | undefined {
  const ctx = tryGetRequestContext();

  if (ctx === undefined) {
    return undefined;
  }

  const subExtensions: Extension[] = [];
  if (ctx.requestId) {
    subExtensions.push({ url: 'requestId', valueId: ctx.requestId });
  }

  if (ctx.traceId) {
    subExtensions.push({ url: 'traceId', valueId: ctx.traceId });
  }

  if (subExtensions.length === 0) {
    return undefined;
  }

  return {
    url: 'https://medplum.com/fhir/StructureDefinition/tracing',
    extension: subExtensions,
  };
}

function requestIds(req: Request): { requestId: string; traceId: string } {
  // The request ID is always minted here, never taken from the caller. A caller-controlled request
  // ID cannot be relied upon during an incident, because a caller can collide, reuse, or forge it.
  // Callers correlate using the X-Request-Id response header instead.
  const requestId = randomUUID();
  const traceId = getTraceId(req) ?? generateTraceId();

  return { requestId, traceId };
}

function getFhirRateLimiter(authState: AuthState, logger?: Logger): FhirRateLimiter | undefined {
  if (!getConfig().rateLimitsEnabled) {
    return undefined;
  }

  const { userLimit, projectLimit } = getFhirQuotaConfig(authState);
  return authState.membership
    ? new FhirRateLimiter(getRateLimitRedis(), authState, userLimit, projectLimit, logger ?? globalLogger)
    : undefined;
}

function getResourceCap(authState: AuthState, logger?: Logger): ResourceCap | undefined {
  if (!getConfig().rateLimitsEnabled) {
    return undefined;
  }

  const projectLimit = authState.project?.systemSetting?.find((s) => s.name === 'resourceCap')?.valueInteger;
  return authState.membership && projectLimit
    ? new ResourceCap(getRateLimitRedis(), authState, projectLimit, logger ?? globalLogger)
    : undefined;
}

type SuperAdminRequestContext = AuthenticatedRequestContext & {
  readonly repo: SuperAdminRepository;
};

function isSuperAdminContext(ctx: AuthenticatedRequestContext): ctx is SuperAdminRequestContext {
  return ctx.repo.isSuperAdmin();
}

export function requireSuperAdmin(): SuperAdminRequestContext {
  const ctx = getAuthenticatedContext();
  if (!isSuperAdminContext(ctx)) {
    throw new OperationOutcomeError(forbidden);
  }
  return ctx;
}
