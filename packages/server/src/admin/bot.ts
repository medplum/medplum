// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { getAuthenticatedContext } from '../context';
<<<<<<< HEAD
import { createBot } from '../fhir/operations/botinit';
=======
import type { Repository } from '../fhir/repo';
import { getGlobalSystemRepo } from '../fhir/repo';
import { getBinaryStorage } from '../storage/loader';
>>>>>>> 1ce8099b2 (temp)
import { makeValidationMiddleware } from '../util/validator';

export const createBotValidator = makeValidationMiddleware([
  body('name').notEmpty().withMessage('Bot name is required'),
]);

export async function createBotHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
  const bot = await createBot(ctx.repo, ctx.project, req.body);
  res.status(201).json(bot);
}
<<<<<<< HEAD
=======

export interface CreateBotRequest {
  readonly project: Project;
  readonly name: string;
  readonly description?: string;
  readonly accessPolicy?: Reference<AccessPolicy>;
  readonly runtimeVersion?: 'awslambda' | 'vmcontext';
}

export async function createBot(repo: Repository, request: CreateBotRequest): Promise<WithId<Bot>> {
  const filename = 'index.ts';
  const contentType = ContentType.TYPESCRIPT;
  const binary = await repo.createResource<Binary>({
    resourceType: 'Binary',
    contentType,
  });
  await getBinaryStorage().writeBinary(binary, filename, contentType, Readable.from(defaultBotCode));

  const bot = await repo.createResource<Bot>({
    meta: {
      project: request.project.id,
    },
    resourceType: 'Bot',
    name: request.name,
    description: request.description,
    runtimeVersion: request.runtimeVersion ?? getConfig().defaultBotRuntimeVersion,
    sourceCode: {
      contentType,
      title: filename,
      url: getReferenceString(binary),
    },
  });

  const globalSystemRepo = getGlobalSystemRepo();
  await globalSystemRepo.createResource<ProjectMembership>({
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
>>>>>>> 1ce8099b2 (temp)
