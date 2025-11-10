// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource, WithId } from '@medplum/core';
import { Logger, isUUID, parseLogLevel } from '@medplum/core';
import type {
  Bot,
  ClientApplication,
  Extension,
  Login,
  Project,
  ProjectMembership,
  Reference,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { getConfig } from './config/loader';
import { getRepoForLogin } from './fhir/accesspolicy';
import { FhirRateLimiter } from './fhir/fhirquota';
import type { Repository } from './fhir/repo';
import { ResourceCap } from './fhir/resource-cap';
import { globalLogger } from './logger';
import type { AuthState } from './oauth/middleware';
import { authenticateTokenImpl, isExtendedMode } from './oauth/middleware';
import { getRedis } from './redis';
import type { IRequestContext } from './request-context-store';
import { requestContextStore } from './request-context-store';
import { parseTraceparent } from './traceparent';

export class RequestContext implements IRequestContext {
  readonly requestId: string;
  readonly traceId: string;
  readonly logger: Logger;

  constructor(requestId: string, traceId: string, logger?: Logger, loggerMetadata?: Record<string, any>) {
    this.requestId = requestId;
    this.traceId = traceId;
    this.logger =
      logger ??
      new Logger(write, { ...loggerMetadata, requestId, traceId }, parseLogLevel(getConfig().logLevel ?? 'info'));
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
};

export class AuthenticatedRequestContext extends RequestContext {
  readonly authState: Readonly<AuthState>;
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
    let loggerMetadata: Record<string, any> | undefined;
    const projectId = repo.currentProject()?.id;
    if (projectId) {
      let profile = authState.membership.profile.reference;
      const asUserProfile = authState.onBehalfOfMembership?.profile.reference;
      if (asUserProfile && asUserProfile !== profile) {
        profile += ` (as ${asUserProfile})`;
      }
      loggerMetadata = { projectId, profile };
    }
    super(requestId, traceId, options?.logger, loggerMetadata);

    this.fhirRateLimiter = getFhirRateLimiter(authState, this.logger, options?.async);
    this.resourceCap = getResourceCap(authState, this.logger);

    this.authState = authState;
    this.repo = repo;
    this.isAsync = options?.async ?? false;
  }

  get project(): WithId<Project> {
    return this.authState.project;
  }

  get membership(): WithId<ProjectMembership> {
    return this.authState.onBehalfOfMembership ?? this.authState.membership;
  }

  get login(): Login {
    return this.authState.login;
  }

  get profile(): Reference<ProfileResource | Bot | ClientApplication> {
    return this.membership.profile;
  }

  get authentication(): Readonly<AuthState> {
    return this.authState;
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
  try {
    let ctx: RequestContext;
    const { requestId, traceId } = requestIds(req);
    const authState = await authenticateTokenImpl(req);
    if (authState) {
      const repo = await getRepoForLogin(authState, isExtendedMode(req));
      ctx = new AuthenticatedRequestContext(requestId, traceId, authState, repo);
    } else {
      ctx = new RequestContext(requestId, traceId);
    }
    requestContextStore.run(ctx, () => next());
  } catch (err) {
    next(err);
  }
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

export async function runInAsyncContext<T>(
  authState: Readonly<AuthState>,
  requestId: string | undefined,
  traceId: string | undefined,
  fn: () => T
): Promise<T> {
  const repo = await getRepoForLogin(authState, true);
  requestId ??= randomUUID();
  traceId ??= randomUUID();

  return requestContextStore.run(
    new AuthenticatedRequestContext(requestId, traceId, authState, repo, { async: true }),
    fn
  );
}

export function getTraceId(req: Request): string | undefined {
  const xTraceId = req.header('x-trace-id');
  if (xTraceId && isUUID(xTraceId)) {
    return xTraceId;
  }

  const traceparent = req.header('traceparent');
  if (traceparent && parseTraceparent(traceparent)) {
    return traceparent;
  }

  const amznTraceId = req.header('x-amzn-trace-id');
  if (amznTraceId) {
    return extractAmazonTraceId(amznTraceId);
  }

  return undefined;
}

export function extractAmazonTraceId(amznTraceId: string): string | undefined {
  // https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-request-tracing.html
  // Definition: Field=version-time-id
  // Example header: X-Amzn-Trace-Id: Root=1-67891233-abcdef012345678912345678
  // Example header: X-Amzn-Trace-Id: Self=1-67891233-12456789abcdef012345678;Root=1-67891233-abcdef012345678912345678
  // Example in Athena: "TID_e0fbe3c75b3c5a45ab84fb156906649b"
  const regex = /(?:Root|Self)=([^;]+)/;
  const match = regex.exec(amznTraceId);
  return match ? match[1] : undefined;
}

export function buildTracingExtension(): Extension[] | undefined {
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

  return [
    {
      url: 'https://medplum.com/fhir/StructureDefinition/tracing',
      extension: subExtensions,
    },
  ];
}

function requestIds(req: Request): { requestId: string; traceId: string } {
  const requestId = randomUUID();
  const traceId = getTraceId(req) ?? randomUUID();

  return { requestId, traceId };
}

function write(msg: string): void {
  process.stdout.write(msg + '\n');
}

function getFhirRateLimiter(authState: AuthState, logger?: Logger, async?: boolean): FhirRateLimiter | undefined {
  const defaultUserLimit = authState.project?.systemSetting?.find((s) => s.name === 'userFhirQuota')?.valueInteger;
  const userSpecificLimit = authState.userConfig.option?.find((o) => o.id === 'fhirQuota')?.valueInteger;
  const userLimit = userSpecificLimit ?? defaultUserLimit ?? getConfig().defaultFhirQuota;

  const perProjectLimit = authState.project?.systemSetting?.find((s) => s.name === 'totalFhirQuota')?.valueInteger;
  const projectLimit = perProjectLimit ?? userLimit * 10;

  return authState.membership
    ? new FhirRateLimiter(getRedis(), authState, userLimit, projectLimit, logger ?? globalLogger, async)
    : undefined;
}

function getResourceCap(authState: AuthState, logger?: Logger): ResourceCap | undefined {
  const projectLimit = authState.project?.systemSetting?.find((s) => s.name === 'resourceCap')?.valueInteger;
  return authState.membership && projectLimit
    ? new ResourceCap(getRedis(), authState, projectLimit, logger ?? globalLogger)
    : undefined;
}
