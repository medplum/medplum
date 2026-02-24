// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
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
  const bot = await createBot(ctx.repo, ctx.project, req.body);
  res.status(201).json(bot);
}
