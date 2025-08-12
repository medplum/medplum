// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ContextRunner, validationResult } from 'express-validator';
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
