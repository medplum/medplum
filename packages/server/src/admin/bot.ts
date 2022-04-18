import { assertOk, createReference } from '@medplum/core';
import { AccessPolicy, Bot, Project, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, Repository, sendOutcome, systemRepo } from '../fhir';
import { verifyProjectAdmin } from './utils';

export const createBotValidators = [body('name').notEmpty().withMessage('Bot name is required')];

export async function createBotHandler(req: Request, res: Response): Promise<void> {
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

  const bot = await createBot(res.locals.repo as Repository, {
    ...req.body,
    project: project,
  });

  res.status(201).json(bot);
}

export interface CreateBotRequest {
  readonly project: Project;
  readonly name: string;
  readonly description?: string;
  readonly accessPolicy?: Reference<AccessPolicy>;
}

export async function createBot(repo: Repository, request: CreateBotRequest): Promise<Bot> {
  const [clientOutcome, bot] = await repo.createResource<Bot>({
    meta: {
      project: request.project.id,
    },
    resourceType: 'Bot',
    name: request.name,
    description: request.description,
    runtimeVersion: 'awslambda',
  });
  assertOk(clientOutcome, bot);

  const [membershipOutcome, membership] = await systemRepo.createResource<ProjectMembership>({
    meta: {
      project: request.project.id,
    },
    resourceType: 'ProjectMembership',
    project: createReference(request.project),
    user: createReference(bot),
    profile: createReference(bot),
    accessPolicy: request.accessPolicy,
  });
  assertOk(membershipOutcome, membership);
  return bot;
}
