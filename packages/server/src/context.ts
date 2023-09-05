import { Login, Project, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { Repository } from './fhir/repo';
import { ProfileResource, isUUID } from '@medplum/core';
import { Logger } from './logger';
import { Request } from 'express';
import { randomUUID } from 'crypto';

export class RequestContext {
  readonly repo: Repository;
  readonly project: Project;
  readonly membership: ProjectMembership;
  readonly login: Login;
  readonly profile: Reference<ProfileResource>;

  readonly requestId: string;
  readonly traceId: string;
  readonly logger: Logger;

  constructor(req: Request, login: Login, project: Project, membership: ProjectMembership, repo: Repository) {
    const { requestId, traceId } = requestIds(req);

    this.repo = repo;
    this.project = project;
    this.membership = membership;
    this.login = login;
    this.profile = membership.profile as Reference<ProfileResource>;

    this.requestId = requestId;
    this.traceId = traceId;
    this.logger = new Logger(process.stdout, { requestId, traceId });
  }
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
