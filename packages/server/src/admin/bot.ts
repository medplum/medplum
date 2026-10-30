// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { forbidden, OperationOutcomeError, singularize } from '@medplum/core';
import type { Project } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { getAuthenticatedContext } from '../context';
import { createBot } from '../fhir/operations/botinit';
import { makeValidationMiddleware } from '../util/validator';

export const createBotValidator = makeValidationMiddleware([
  body('name').notEmpty().withMessage('Bot name is required'),
]);

export async function createBotHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
  const projectId = singularize(req.params.projectId) as string;
  if (!ctx.project.superAdmin && projectId !== ctx.project.id) {
    throw new OperationOutcomeError(forbidden);
  }
  const project =
    projectId === ctx.project.id ? ctx.project : await ctx.repo.readResource<Project>('Project', projectId);
  const bot = await createBot(ctx.repo, project, req.body);
  res.status(201).json(bot);
}
