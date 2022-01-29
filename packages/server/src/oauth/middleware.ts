import { assertOk, createReference, getReferenceString, isOk, ProfileResource } from '@medplum/core';
import { ClientApplication, Login, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { NextFunction, Request, Response } from 'express';
import { getRepoForLogin, systemRepo } from '../fhir';
import { logger } from '../logger';
import { MedplumAccessTokenClaims, verifyJwt } from './keys';

export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const [tokenType, token] = req.headers.authorization?.split(' ') ?? [];
  if (!tokenType || !token) {
    res.sendStatus(401);
    return;
  }

  if (tokenType === 'Bearer') {
    await authenticateBearerToken(req, res, next, token);
  } else if (tokenType === 'Basic') {
    await authenticateBasicAuth(req, res, next, token);
  } else {
    res.sendStatus(401);
    return;
  }
}

async function authenticateBearerToken(req: Request, res: Response, next: NextFunction, token: string): Promise<void> {
  try {
    const verifyResult = await verifyJwt(token);
    const claims = verifyResult.payload as MedplumAccessTokenClaims;
    const [loginOutcome, login] = await systemRepo.readResource<Login>('Login', claims.login_id);
    if (!isOk(loginOutcome) || !login || login.revoked) {
      res.sendStatus(401);
      return;
    }

    let membership: ProjectMembership | undefined = undefined;

    // TODO: Make login.membership a required field
    if (login.membership) {
      const [membershipOutcome, membership2] = await systemRepo.readReference<ProjectMembership>(
        login.membership as Reference<ProjectMembership>
      );
      assertOk(membershipOutcome, membership2);
      membership = membership2;
    } else {
      const [profileOutcome, profile] = await systemRepo.readReference<ProfileResource>({
        reference: claims.profile,
      } as Reference<ProfileResource>);
      assertOk(profileOutcome, profile);
      membership = {
        resourceType: 'ProjectMembership',
        project: {
          reference: 'Project/' + profile.meta?.project,
        },
        profile: createReference(profile),
      };
    }

    if (!membership) {
      res.sendStatus(500);
      return;
    }

    res.locals.login = login;
    res.locals.user = claims.username;
    res.locals.profile = claims.profile;
    res.locals.scope = claims.scope;
    res.locals.repo = await getRepoForLogin(membership);
    next();
  } catch (err) {
    logger.error('verify error', err);
    res.sendStatus(401);
    return;
  }
}

async function authenticateBasicAuth(req: Request, res: Response, next: NextFunction, token: string): Promise<void> {
  const credentials = Buffer.from(token, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');
  if (!username || !password) {
    res.sendStatus(401);
    return;
  }

  const [outcome, client] = await systemRepo.readResource<ClientApplication>('ClientApplication', username);
  if (!isOk(outcome) || !client) {
    res.sendStatus(401);
    return;
  }

  if (client.secret !== password) {
    res.sendStatus(401);
    return;
  }

  // TODO: Lookup project membership for client.
  const membership: ProjectMembership = {
    resourceType: 'ProjectMembership',
    project: {
      reference: `Project/${client.meta?.project}`,
    },
    profile: createReference(client),
  };

  res.locals.user = client.id;
  res.locals.profile = getReferenceString(client);
  res.locals.scope = 'openid';
  res.locals.repo = await getRepoForLogin(membership);
  next();
}
