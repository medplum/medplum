import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { Request, Response, Router } from 'express';
import { body, Result, ValidationError, validationResult } from 'express-validator';
import { ClientApplication, OperationOutcome, User } from '@medplum/core';
import { badRequest, repo } from '../fhir';
import { createLogin } from '../oauth/utils';

export const authRouter = Router();

authRouter.post(
  '/login',
  body('clientId').exists().withMessage('Missing clientId'),
  body('email').isEmail().withMessage('Valid email address is required'),
  body('password').isLength({ min: 8 }).withMessage('Invalid password, must be at least 8 characters'),
  body('scope').notEmpty().withMessage('Missing scope'),
  body('role').notEmpty().withMessage('Missing role'),
  async (req: Request, res: Response) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(toOutcome(errors));
    }

    const client: ClientApplication = {
      resourceType: 'ClientApplication'
    };

    const [loginOutcome, login] = await createLogin(client, req.body.email, req.body.password);
    if (loginOutcome.id !== 'allok') {
      return res.status(400).json(loginOutcome);
    }

    if (!login?.user) {
      return res.status(400).json(badRequest('Invalid login'));
    }

    const [userOutcome, user] = await repo.readReference<User>(login?.user);
    if (userOutcome.id !== 'allok') {
      return res.status(400).json(userOutcome);
    }

    if (!user) {
      return res.status(400).json(badRequest('User not found'));
    }

    let roleReference;
    switch (req.body.role) {
      case 'patient':
        roleReference = user.patient;
        break;

      case 'practitioner':
        roleReference = user.practitioner;
        break;

      default:
        return res.status(400).json(badRequest('Unrecognized role: ' + req.body.role));
    }

    if (!roleReference) {
      return res.status(400).json(badRequest('User odes not have role: ' + req.body.role));
    }

    const [profileOutcome, profile] = await repo.readReference(roleReference);
    if (profileOutcome.id !== 'allok' || !profile) {
      return res.status(400).json(profileOutcome);
    }

    await repo.updateResource({
      ...login,
      scope: req.body.scope,
      profile: {
        reference: profile.resourceType + '/' + profile.id
      }
    });

    const secret = 'secret';

    const accessToken = jwt.sign({
      token_user: 'access',
      exp: 0,
      sub: profile.id,
      scope: req.body.scope,
      client_id: client.id,
      username: profile.id,
      profile: profile.resourceType + '/' + profile.id
    }, secret);

    const refreshToken = jwt.sign({
      token_user: 'refresh',
      exp: 0,
      sub: profile.id,
      scope: req.body.scope,
      client_id: client.id,
      username: profile.id,
      profile: profile.resourceType + '/' + profile.id
    }, secret);

    res.status(200).json({
      user,
      profile,
      accessToken,
      refreshToken
    });
  });


function toOutcome(errors: Result<ValidationError>): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    id: randomUUID(),
    issue: errors.array().map(error => ({
      severity: 'error',
      code: 'invalid',
      expression: [error.param],
      details: { text: error.msg }
    }))
  };
}
