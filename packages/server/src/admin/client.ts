import { assertOk, createReference } from '@medplum/core';
import { AccessPolicy, ClientApplication, Project, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, sendOutcome, systemRepo } from '../fhir';
import { generateSecret } from '../oauth';
import { verifyProjectAdmin } from './utils';

export const createClientValidators = [body('name').notEmpty().withMessage('Client name is required')];

export async function createClientHandler(req: Request, res: Response): Promise<void> {
  const project = await verifyProjectAdmin(req, res);
  if (!project) {
    res.sendStatus(404);
    return;
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  const client = await createClient({
    ...req.body,
    project: project,
  });

  res.status(201).json(client);
}

export interface CreateClientRequest {
  readonly project: Project;
  readonly name: string;
  readonly description?: string;
  readonly redirectUri?: string;
  readonly accessPolicy?: Reference<AccessPolicy>;
}

export async function createClient(request: CreateClientRequest): Promise<ClientApplication> {
  const [clientOutcome, client] = await systemRepo.createResource<ClientApplication>({
    meta: {
      project: request.project.id,
    },
    resourceType: 'ClientApplication',
    name: request.name,
    secret: generateSecret(48),
    description: request.description,
    redirectUri: request.redirectUri,
  });
  assertOk(clientOutcome, client);

  const [membershipOutcome, membership] = await systemRepo.createResource<ProjectMembership>({
    meta: {
      project: request.project.id,
    },
    resourceType: 'ProjectMembership',
    project: createReference(request.project),
    user: createReference(client),
    profile: createReference(client),
    accessPolicy: request.accessPolicy,
  });
  assertOk(membershipOutcome, membership);
  return client;
}
