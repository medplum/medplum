import { LogLevel, Logger, ProfileResource, isUUID } from '@medplum/core';
import { Login, Project, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { Repository, getSystemRepo } from './fhir/repo';
import { parseTraceparent } from './traceparent';

export class RequestContext {
  readonly requestId: string;
  readonly traceId: string;
  readonly logger: Logger;

  constructor(requestId: string, traceId: string, logger?: Logger) {
    this.requestId = requestId;
    this.traceId = traceId;
    this.logger =
      logger ??
      new Logger(write, { requestId, traceId }, process.env.NODE_ENV === 'test' ? LogLevel.ERROR : LogLevel.INFO);
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
    logger?: Logger,
    accessToken?: string
  ) {
    super(ctx.requestId, ctx.traceId, logger);

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
      new RequestContext(ctx?.requestId ?? '', ctx?.traceId ?? ''),
      {} as unknown as Login,
      {} as unknown as Project,
      {} as unknown as ProjectMembership,
      getSystemRepo(),
      systemLogger
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
  requestContextStore.run(new RequestContext(requestId, traceId), () => next());
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

export function tryRunInContext<T>(requestId: string | undefined, traceId: string | undefined, fn: () => T): T {
  if (requestId && traceId) {
    return requestContextStore.run(new RequestContext(requestId, traceId), fn);
  } else {
    return fn();
  }
}

const traceIdHeaderMap: {
  [key: string]: (traceId: string) => boolean;
} = {
  'x-trace-id': (value) => isUUID(value),
  traceparent: (value) => !!parseTraceparent(value),
} as const;
const traceIdHeaders = Object.entries(traceIdHeaderMap);

const getTraceId = (req: Request): string | undefined => {
  for (const [headerKey, isTraceId] of traceIdHeaders) {
    const value = req.header(headerKey);
    if (value && isTraceId(value)) {
      return value;
    }
  }
  return undefined;
};

function requestIds(req: Request): { requestId: string; traceId: string } {
  const requestId = randomUUID();
  const traceId = getTraceId(req) ?? randomUUID();

  return { requestId, traceId };
}

function write(msg: string): void {
  process.stdout.write(msg + '\n');
}
