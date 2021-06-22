import { ClientApplication, createReference, getReferenceString, Login, ProfileResource, User } from '@medplum/core';
import { Request, Response, Router } from 'express';
import { body, validationResult } from 'express-validator';
import { asyncWrap } from '../async';
import { badRequest, invalidRequest, isOk, repo, sendOutcome } from '../fhir';
import { generateAccessToken, generateRefreshToken } from '../oauth';
import { createLogin } from '../oauth/utils';

export const authRouter = Router();

authRouter.post(
  '/login',
  body('clientId').exists().withMessage('Missing clientId'),
  body('email').isEmail().withMessage('Valid email address is required'),
  body('password').isLength({ min: 5 }).withMessage('Invalid password, must be at least 5 characters'),
  body('scope').notEmpty().withMessage('Missing scope'),
  body('role').notEmpty().withMessage('Missing role'),
  asyncWrap(async (req: Request, res: Response) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendOutcome(res, invalidRequest(errors));
    }

    const client: ClientApplication = {
      resourceType: 'ClientApplication'
    };

    const [loginOutcome, login] = await createLogin(
      client,
      req.body.email,
      req.body.password,
      req.body.remember);

    if (!isOk(loginOutcome)) {
      return sendOutcome(res, loginOutcome);
    }

    if (!login?.user) {
      return sendOutcome(res, badRequest('Invalid login'));
    }

    const [userOutcome, user] = await repo.readReference<User>(login?.user);
    if (!isOk(userOutcome)) {
      return sendOutcome(res, userOutcome);
    }

    if (!user) {
      return sendOutcome(res, badRequest('User not found', 'email'));
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
        return sendOutcome(res, badRequest('Unrecognized role', 'role'));
    }

    if (!roleReference) {
      return sendOutcome(res, badRequest('User does not have role', 'role'));
    }

    const [profileOutcome, profile] = await repo.readReference<ProfileResource>(roleReference);
    if (!isOk(profileOutcome) || !profile) {
      return sendOutcome(res, profileOutcome);
    }

    await repo.updateResource<Login>({
      ...login,
      scope: req.body.scope,
      profile: createReference(profile),
    });

    const accessToken = await generateAccessToken({
      sub: user.id as string,
      username: user.id as string,
      scope: req.body.scope,
      client_id: client.id as string,
      profile: getReferenceString(profile)
    });

    const refreshToken = req.body.remember ? await generateRefreshToken({
      client_id: client.id as string,
      login_id: login.id as string,
      refresh_secret: login.refreshSecret as string
    }) : undefined;

    res.status(200).json({
      user,
      profile,
      accessToken,
      refreshToken
    });
  }));
