import { Login, Project, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { Repository, systemRepo } from './fhir/repo';
import { ProfileResource, isUUID } from '@medplum/core';
import { LogLevel, Logger } from './logger';
import { AsyncLocalStorage } from 'async_hooks';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

export class RequestContext {
  readonly requestId: string;
  readonly traceId: string;
  readonly logger: Logger;

  constructor(requestId: string, traceId: string, logger?: Logger) {
    this.requestId = requestId;
    this.traceId = traceId;
    this.logger = logger ?? new Logger(process.stdout, { requestId, traceId });
  }

  static empty(): RequestContext {
    return new RequestContext('', '');
  }
}

export class AuthenticatedRequestContext extends RequestContext {
  readonly repo: Repository;
  readonly project: Project;
  readonly membership: ProjectMembership;
  readonly login: Login;
  readonly profile: Reference<ProfileResource>;

  constructor(
    ctx: RequestContext,
    login: Login,
    project: Project,
    membership: ProjectMembership,
    repo: Repository,
    logger?: Logger
  ) {
    super(ctx.requestId, ctx.traceId, logger);

    this.repo = repo;
    this.project = project;
    this.membership = membership;
    this.login = login;
    this.profile = membership.profile as Reference<ProfileResource>;
  }

  static system(): AuthenticatedRequestContext {
    const systemLogger = new Logger(process.stdout, undefined, LogLevel.ERROR);
    return new AuthenticatedRequestContext(
      new RequestContext('', ''),
      {} as unknown as Login,
      {} as unknown as Project,
      {} as unknown as ProjectMembership,
      systemRepo,
      systemLogger
    );
  }
}

export const requestContextStore = new AsyncLocalStorage<RequestContext>();
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

function requestIds(req: Request): { requestId: string; traceId: string } {
  const requestId = randomUUID();
  const traceIdHeader = req.header('x-trace-id');
  const traceParentHeader = req.header('traceparent');
  let traceId: string | undefined;
  if (traceIdHeader && isUUID(traceIdHeader)) {
    traceId = traceIdHeader;
  } else if (traceParentHeader?.startsWith('00-')) {
    const id = traceParentHeader.split('-')[1];
    const uuid = [
      id.substring(0, 8),
      id.substring(8, 12),
      id.substring(12, 16),
      id.substring(16, 20),
      id.substring(20, 32),
    ].join('-');
    if (isUUID(uuid)) {
      traceId = uuid;
    }
  }
  if (!traceId) {
    traceId = randomUUID();
  }
  return { requestId, traceId };
}
