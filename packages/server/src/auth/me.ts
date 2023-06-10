import { getReferenceString, Operator, ProfileResource } from '@medplum/core';
import { Login, ProjectMembership, Reference, User, UserConfiguration } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { UAParser } from 'ua-parser-js';
import { systemRepo } from '../fhir/repo';
import { rewriteAttachments, RewriteMode } from '../fhir/rewrite';

interface UserSession {
  id: string;
  lastUpdated: string;
  authMethod: string;
  remoteAddress: string;
  browser?: string;
  os?: string;
}

interface UserSecurity {
  mfaEnrolled: boolean;
  sessions: UserSession[];
  userId: string | undefined;
}

export async function meHandler(_: Request, res: Response): Promise<void> {
  const membership = res.locals.membership as ProjectMembership;

  const profile = await getUserProfile(membership);
  const config = await getUserConfiguration(membership);
  const security = await getUserSecurity(membership);

  const result = {
    profile,
    config,
    security,
  };

  res.status(200).json(await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, result));
}

async function getUserProfile(membership: ProjectMembership): Promise<ProfileResource> {
  return await systemRepo.readReference<ProfileResource>(membership.profile as Reference<ProfileResource>);
}

async function getUserSecurity(membership: ProjectMembership): Promise<UserSecurity | undefined> {
  let security: UserSecurity | undefined = undefined;

  if (membership.user?.reference?.startsWith('User/')) {
    const user = await systemRepo.readReference<User>(membership.user as Reference<User>);
    const sessions = await getSessions(user);

    security = {
      mfaEnrolled: !!user.mfaEnrolled,
      sessions,
      userId: user.id,
    };
  }

  return security;
};

async function getUserConfiguration(membership: ProjectMembership): Promise<UserConfiguration> {
  if (membership.userConfiguration) {
    return systemRepo.readReference<UserConfiguration>(membership.userConfiguration);
  }

  const favorites = ['Patient', 'Practitioner', 'Organization', 'ServiceRequest', 'DiagnosticReport', 'Questionnaire'];

  return {
    resourceType: 'UserConfiguration',
    menu: [
      {
        title: 'Favorites',
        link: favorites.map((resourceType) => ({ name: resourceType, target: '/' + resourceType })),
      },
      {
        title: 'Admin',
        link: [
          { name: 'Project', target: '/admin/project' },
          { name: 'AccessPolicy', target: '/AccessPolicy' },
          { name: 'Subscriptions', target: '/Subscription' },
          { name: 'Batch', target: '/batch' },
        ],
      },
    ],
  };
}

async function getSessions(user: User): Promise<UserSession[]> {
  const logins = await systemRepo.searchResources<Login>({
    resourceType: 'Login',
    filters: [
      {
        code: 'user',
        operator: Operator.EQUALS,
        value: getReferenceString(user),
      },
      {
        code: '_lastUpdated',
        operator: Operator.GREATER_THAN,
        value: new Date(Date.now() - 3600 * 1000).toISOString(),
      },
    ],
  });

  const result = [];
  for (const login of logins) {
    if (!login.membership || login.revoked) {
      continue;
    }

    let uaParser = undefined;
    if (login.userAgent) {
      uaParser = new UAParser(login.userAgent);
    }

    result.push({
      id: login.id as string,
      lastUpdated: login.meta?.lastUpdated as string,
      authMethod: login.authMethod as string,
      remoteAddress: login.remoteAddress as string,
      browser: uaParser?.getBrowser()?.name,
      os: uaParser?.getOS()?.name,
    });
  }
  return result;
}
