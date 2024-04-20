import { LogLevel, Logger, ProfileResource, isUUID, parseLogLevel } from '@medplum/core';
import { Extension, Login, Project, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { getConfig } from './config';
import { getRepoForLogin } from './fhir/accesspolicy';
import { Repository, getSystemRepo } from './fhir/repo';
import { authenticateTokenImpl, isExtendedMode } from './oauth/middleware';
import { parseTraceparent } from './traceparent';

export class RequestContext {
  readonly requestId: string;
  readonly traceId: string;
  readonly logger: Logger;

  constructor(requestId: string, traceId: string, logger?: Logger) {
    this.requestId = requestId;
    this.traceId = traceId;
    this.logger = logger ?? new Logger(write, { requestId, traceId }, parseLogLevel(getConfig().logLevel ?? 'info'));
  }

  close(): void {
    // No-op, descendants may override
  }

  static empty(): RequestContext {
    return new RequestContext('', '');
  }
}

const systemLogger = new Logger(write, undefined, LogLevel.ERROR);

export class AuthenticatedRequestContext extends RequestContext {
  readonly repo: Repository;
  readonly project: Project;
  readonly membership: ProjectMembership;
  readonly login: Login;
  readonly profile: Reference<ProfileResource>;
  readonly accessToken?: string;

  constructor(
    ctx: RequestContext,
    login: Login,
    project: Project,
    membership: ProjectMembership,
    repo: Repository,
    accessToken?: string
  ) {
    super(ctx.requestId, ctx.traceId, ctx.logger);

    this.repo = repo;
    this.project = project;
    this.membership = membership;
    this.login = login;
    this.profile = membership.profile as Reference<ProfileResource>;
    this.accessToken = accessToken;
  }

  close(): void {
    this.repo.close();
  }

  static system(ctx?: { requestId?: string; traceId?: string }): AuthenticatedRequestContext {
    return new AuthenticatedRequestContext(
      new RequestContext(ctx?.requestId ?? '', ctx?.traceId ?? '', systemLogger),
      {} as unknown as Login,
      {} as unknown as Project,
      {} as unknown as ProjectMembership,
      getSystemRepo()
    );
  }
}

export const requestContextStore = new AsyncLocalStorage<RequestContext>();

export function tryGetRequestContext(): RequestContext | undefined {
  return requestContextStore.getStore();
}

export function getRequestContext(): RequestContext {
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

  let ctx = new RequestContext(requestId, traceId);

  const authState = await authenticateTokenImpl(req);
  if (authState) {
    const { login, membership, project, accessToken } = authState;
    const repo = await getRepoForLogin(login, membership, project, isExtendedMode(req));
    ctx = new AuthenticatedRequestContext(ctx, login, project, membership, repo, accessToken);
  }

  requestContextStore.run(ctx, () => next());
}

export function closeRequestContext(): void {
  const ctx = requestContextStore.getStore();
  if (ctx) {
    ctx.close();
  }
}

export function getLogger(): Logger {
  const ctx = requestContextStore.getStore();
  return ctx ? ctx.logger : systemLogger;
}

export function tryRunInRequestContext<T>(requestId: string | undefined, traceId: string | undefined, fn: () => T): T {
  if (requestId && traceId) {
    return requestContextStore.run(new RequestContext(requestId, traceId), fn);
  } else {
    return fn();
  }
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

  return undefined;
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
