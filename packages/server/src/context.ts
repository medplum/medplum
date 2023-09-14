import { Login, Project, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { Repository, systemRepo } from './fhir/repo';
import { ProfileResource } from '@medplum/core';
import { Logger } from './logger';
import { AsyncLocalStorage } from 'async_hooks';

export class RequestContext {
  readonly requestId: string;
  readonly traceId: string;
  readonly logger: Logger;

  constructor(requestId: string, traceId: string) {
    this.requestId = requestId;
    this.traceId = traceId;
    this.logger = new Logger(process.stdout, { requestId, traceId });
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

  constructor(ctx: RequestContext, login: Login, project: Project, membership: ProjectMembership, repo: Repository) {
    super(ctx.requestId, ctx.traceId);

    this.repo = repo;
    this.project = project;
    this.membership = membership;
    this.login = login;
    this.profile = membership.profile as Reference<ProfileResource>;
  }

  static system(): AuthenticatedRequestContext {
    return new AuthenticatedRequestContext(
      new RequestContext('', ''),
      {} as unknown as Login,
      {} as unknown as Project,
      {} as unknown as ProjectMembership,
      systemRepo
    );
  }
}

export const requestContextStore = new AsyncLocalStorage<RequestContext>();
export function getRequestContext(): RequestContext {
  const ctx = requestContextStore.getStore();
  if (!ctx) {
    console.trace('OH NO!');
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
