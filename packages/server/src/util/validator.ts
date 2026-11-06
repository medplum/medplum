// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ContextRunner } from 'express-validator';
import { validationResult } from 'express-validator';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';

export function makeValidationMiddleware(runners: ContextRunner[]): RequestHandler {
  return async function (req: Request, res: Response, next: NextFunction) {
    await Promise.all(runners.map((runner) => runner.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    next();
  };
}

/**
 * Validates the request and sends an error response if there are validation errors.
 * @param req - The Express request object.
 * @param res - The Express response object.
 * @returns True if there were validation errors and a response was sent.
 */
export function sendValidationErrors(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return true;
  }
  return false;
}
