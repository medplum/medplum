import { createReference } from '@medplum/core';
import { AccessPolicy, Bot, Project, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { Repository, systemRepo } from '../fhir/repo';

export const createBotValidators = [body('name').notEmpty().withMessage('Bot name is required')];

const defaultBotCode = `import { BotEvent, MedplumClient } from '@medplum/core';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // Your code here
}
`;

export async function createBotHandler(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  const bot = await createBot(res.locals.repo as Repository, {
    ...req.body,
    project: res.locals.project,
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
  const bot = await repo.createResource<Bot>({
    meta: {
      project: request.project.id,
    },
    resourceType: 'Bot',
    name: request.name,
    description: request.description,
    runtimeVersion: 'awslambda',
    code: defaultBotCode,
  });

  await systemRepo.createResource<ProjectMembership>({
    meta: {
      project: request.project.id,
    },
    resourceType: 'ProjectMembership',
    project: createReference(request.project),
    user: createReference(bot),
    profile: createReference(bot),
    accessPolicy: request.accessPolicy,
  });

  return bot;
}
