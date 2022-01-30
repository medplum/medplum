import { assertOk, ProfileResource } from '@medplum/core';
import { ProjectMembership, Reference, UserConfiguration } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { systemRepo } from '../fhir';
import { rewriteAttachments, RewriteMode } from '../fhir/rewrite';

export async function meHandler(req: Request, res: Response): Promise<void> {
  const membership = res.locals.membership as ProjectMembership;
  if (!membership) {
    res.status(401);
    return;
  }

  const [profileOutcome, profile] = await systemRepo.readReference<ProfileResource>(
    membership.profile as Reference<ProfileResource>
  );
  assertOk(profileOutcome, profile);

  // const [configOutcome, config] = await systemRepo.readReference<UserConfiguration>(
  //   membership.userConfiguration as Reference<UserConfiguration>
  // );
  // assertOk(configOutcome, config);
  const config = await getUserConfiguration(membership);

  const result = {
    profile,
    config,
  };

  res.status(200).json(await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, result));
}

async function getUserConfiguration(membership: ProjectMembership): Promise<UserConfiguration> {
  if (membership.userConfiguration) {
    const [configOutcome, config] = await systemRepo.readReference<UserConfiguration>(
      membership.userConfiguration as Reference<UserConfiguration>
    );
    assertOk(configOutcome, config);
    return config;
  }

  return {
    resourceType: 'UserConfiguration',
    menu: [
      {
        title: 'Favorites',
        link: [
          { name: 'Patients', target: '/Patient' },
          { name: 'Practitioners', target: '/Practitioner' },
          { name: 'Observations', target: '/Observation' },
          { name: 'Organizations', target: '/Organization' },
          { name: 'Service Requests', target: '/ServiceRequest' },
          { name: 'Encounters', target: '/Encounter' },
          { name: 'Diagnostic Reports', target: '/DiagnosticReport' },
          { name: 'Questionnaires', target: '/Questionnaire' },
        ],
      },
      {
        title: 'Admin',
        link: [
          { name: 'Project', target: '/admin/project' },
          { name: 'AccessPolicy', target: '/AccessPolicy' },
        ],
      },
      {
        title: 'Developer',
        link: [
          { name: 'Client Applications', target: '/ClientApplication' },
          { name: 'Subscriptions', target: '/Subscription' },
          { name: 'Bots', target: '/Bot' },
          { name: 'Batch', target: '/batch' },
        ],
      },
      {
        title: 'Settings',
        link: [
          {
            name: 'Profile',
            target: `/${membership.profile?.reference}`,
          },
          { name: 'Change Password', target: '/changepassword' },
        ],
      },
    ],
  };
}
