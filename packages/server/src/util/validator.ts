// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ContextRunner, ValidationChain } from 'express-validator';
import { body, validationResult } from 'express-validator';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../constants';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';

/**
 * Starts a request body validation chain that requires the field to be a string.
 *
 * express-validator runs its standard validators (isEmail, isLength, isUUID, notEmpty, etc.) against
 * each element when the value is an array, so `["a@b.com"]` passes `isEmail()`. Use this instead of
 * `body()` for any field the handler treats as a string.
 * @param field - The request body field name.
 * @param message - The default error message for every validator in the chain.
 * @returns The validation chain.
 */
export function stringField(field: string, message: string): ValidationChain {
  return body(field, message).isString().bail();
}

/**
 * Validates that a request body field is a string email address.
 * @param message - The error message if the field is not a valid email address.
 * @returns The validation chain.
 */
export function emailField(message = 'Valid email address is required'): ValidationChain {
  return stringField('email', message).isEmail();
}

/**
 * Validates that a request body field is a string password within the allowed length.
 * @param field - The request body field name. Defaults to "password".
 * @returns The validation chain.
 */
export function passwordField(field = 'password'): ValidationChain {
  return stringField(field, 'Invalid password')
    .isLength({ min: MIN_PASSWORD_LENGTH })
    .withMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .isByteLength({ max: MAX_PASSWORD_LENGTH })
    .withMessage(`Password must be no more than ${MAX_PASSWORD_LENGTH} characters`);
}

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
