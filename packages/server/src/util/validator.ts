import { RequestHandler, Request, Response, NextFunction } from 'express';
import { ContextRunner, ValidationChain, validationResult } from 'express-validator';
import { Middleware } from 'express-validator/src/base';
import { sendOutcome, invalidRequest } from '../fhir/outcomes';

type ExpressValidator = ValidationChain | (Middleware & ContextRunner);

export function makeValidationMiddleware(expressValidators: ExpressValidator[]): RequestHandler {
  return async function (req: Request, res: Response, next: NextFunction) {
    await Promise.all(expressValidators.map(ev => ev.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    next();
  };
}
