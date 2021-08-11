import { createReference, Login, Operator, Practitioner, User } from '@medplum/core';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { MEDPLUM_CLIENT_APPLICATION_ID } from '../constants';
import { badRequest, invalidRequest, isOk, repo, sendOutcome } from '../fhir';
import { logger } from '../logger';
import { getAuthTokens, tryLogin } from '../oauth';

export const registerValidators = [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email address is required'),
  body('password').isLength({ min: 5 }).withMessage('Invalid password, must be at least 5 characters'),
];

export async function registerHandler(req: Request, res: Response) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendOutcome(res, invalidRequest(errors));
  }

  const { firstName, lastName, email, password } = req.body;
  const scope = req.body.scope ?? 'launch/patient openid fhirUser offline_access user/*.*';
  const role = req.body.role ?? 'practitioner';

  const [existingOutcome, existingBundle] = await repo.search<User>({
    resourceType: 'User',
    filters: [{
      code: 'email',
      operator: Operator.EQUALS,
      value: email
    }]
  });

  if (!isOk(existingOutcome)) {
    return sendOutcome(res, existingOutcome);
  }

  if (existingBundle?.entry && existingBundle.entry?.length > 0) {
    return sendOutcome(res, badRequest('Email already registered', 'email'));
  }

  logger.info('Create new user...');
  const [practitionerOutcome, practitioner] = await repo.createResource<Practitioner>({
    resourceType: 'Practitioner',
    name: [{
      given: [firstName as string],
      family: lastName as string
    }],
    telecom: [
      {
        system: 'email',
        use: 'work',
        value: email as string
      }
    ]
  });

  if (!isOk(practitionerOutcome)) {
    return sendOutcome(res, practitionerOutcome);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [userOutcome, user] = await repo.createResource<User>({
    resourceType: 'User',
    email: email as string,
    passwordHash,
    practitioner: createReference(practitioner as Practitioner)
  });

  if (!isOk(userOutcome)) {
    return sendOutcome(res, userOutcome);
  }

  logger.info('Created: ' + (user as User).id);

  const [loginOutcome, login] = await tryLogin({
    clientId: MEDPLUM_CLIENT_APPLICATION_ID,
    email: email,
    password: password,
    scope: scope,
    role: role,
    nonce: randomUUID(),
    remember: true
  });

  if (!isOk(loginOutcome)) {
    return sendOutcome(res, loginOutcome);
  }

  const [tokenOutcome, token] = await getAuthTokens(login as Login);
  if (!isOk(tokenOutcome)) {
    return sendOutcome(res, tokenOutcome);
  }

  return res.status(200).json({
    ...token,
    user,
    profile: practitioner
  });
}
