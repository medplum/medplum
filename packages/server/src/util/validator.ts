import { RequestHandler, Request, Response, NextFunction } from "express";
import { ContextRunner, ValidationChain, validationResult } from 'express-validator';
import { Middleware } from "express-validator/src/base";
import { sendOutcome, invalidRequest } from "../fhir/outcomes";

type MW = ValidationChain|(Middleware&ContextRunner)

export function makeValidator(validationChains: MW[]): RequestHandler {
  return function(req: Request, res: Response, next: NextFunction) {
    validationChains.forEach(vc => vc(req, res, () => {}));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    next();
  }
}
