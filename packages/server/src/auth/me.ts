import { ProfileResource } from '@medplum/core';
import { ProjectMembership, Reference, UserConfiguration } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { systemRepo } from '../fhir';
import { rewriteAttachments, RewriteMode } from '../fhir/rewrite';

export async function meHandler(req: Request, res: Response): Promise<void> {
  const membership = res.locals.membership as ProjectMembership;

  const profile = await systemRepo.readReference<ProfileResource>(membership.profile as Reference<ProfileResource>);

  const config = await getUserConfiguration(membership);

  const result = {
    profile,
    config,
  };

  res.status(200).json(await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, result));
}

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
