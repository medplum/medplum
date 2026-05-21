// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource, WithId } from '@medplum/core';
import {
  allOk,
  append,
  badRequest,
  concatUrls,
  forbidden,
  getReferenceString,
  OperationOutcomeError,
  Operator,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Project, ProjectMembership, ResourceType, User } from '@medplum/fhirtypes';
import { verifyEmail } from '../../auth/verifyemail';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { sendEmail } from '../../email/email';
import { getProjectSystemRepo } from '../repo';
import { makeOperationDefinition } from './definitions';
import { parseInputParameters } from './utils/parameters';

const op = makeOperationDefinition(
  { scope: 'instance', resource: 'User' },
  {
    name: 'update-user-email',
    code: 'update-email',
    parameter: [
      {
        use: 'in',
        name: 'email',
        type: 'string',
        min: 1,
        max: '1',
        documentation: 'The new email to be set on the User',
      },
      {
        use: 'in',
        name: 'updateProfileTelecom',
        type: 'boolean',
        min: 0,
        max: '1',
        documentation: 'If true, add the new email to the associated profile resource',
      },
      {
        use: 'in',
        name: 'skipEmailVerification',
        type: 'boolean',
        min: 0,
        max: '1',
        documentation: 'If true, do not send the verification email and mark the email as non-verified',
      },
      {
        use: 'out',
        name: 'return',
        type: 'User',
        min: 1,
        max: '1',
        documentation: 'The updated User resource',
      },
    ],
  }
);

type InputParams = {
  email: string;
  updateProfileTelecom?: boolean;
  skipEmailVerification?: boolean;
};

const profileTypesWithTelecom: ResourceType[] = ['Patient', 'Practitioner', 'RelatedPerson'];

export async function updateUserEmailOperation(req: FhirRequest): Promise<FhirResponse> {
  const { project, membership } = getAuthenticatedContext();
  if (!project.superAdmin && !membership.admin) {
    return [forbidden];
  }

  const params = parseInputParameters<InputParams>(op, req);
  const id = req.params.id;

  const user = await updateUser(id, params, project);
  return [allOk, user];
}

async function updateUser(userId: string, params: InputParams, project: WithId<Project>): Promise<User> {
  const systemRepo = await getProjectSystemRepo(project);
  return systemRepo.withTransaction(async (txRepo) => {
    let user = await txRepo.readResource<User>('User', userId);
    if (!project.superAdmin && user.project?.reference !== getReferenceString(project)) {
      throw new OperationOutcomeError(forbidden);
    }
    if (params.updateProfileTelecom && !user.project) {
      throw new OperationOutcomeError(badRequest('Cannot update profile of server-scoped User'));
    }

    const oldEmail = user.email;
    user.email = params.email;
    user.emailVerified = false;
    user = await txRepo.updateResource(user);

    if (!params.skipEmailVerification) {
      const { id, secret } = await verifyEmail(txRepo, user, undefined);
      const url = concatUrls(getConfig().appBaseUrl, `verifyemail/${id}/${secret}`);

      await sendEmail(txRepo, {
        to: params.email,
        subject: 'Medplum Email Address Updated',
        text: [
          'We received a request to update the email address associated with your Medplum account.',
          '',
          'Please click on the following link to verify your ability to receive emails:',
          '',
          url,
          '',
          'If you received this in error, you can safely ignore it.',
          '',
          'Thank you,',
          'Medplum',
          '',
        ].join('\n'),
      });
    }

    if (params.updateProfileTelecom && user.project?.reference) {
      // Get membership for Project-scoped User
      const membership = await txRepo.searchOne<ProjectMembership>({
        resourceType: 'ProjectMembership',
        filters: [
          { code: 'user', operator: Operator.EQUALS, value: getReferenceString(user) },
          { code: 'project', operator: Operator.EQUALS, value: user.project.reference },
        ],
      });

      if (membership) {
        const profile = await txRepo.readReference(membership.profile);
        if (profileTypesWithTelecom.includes(profile.resourceType)) {
          let telecom = (profile as ProfileResource).telecom;
          // Add new email if not already present
          if (!telecom?.some((contact) => contact.system === 'email' && contact.value === params.email)) {
            telecom = append(telecom, { use: 'work', system: 'email', value: params.email });
          }

          // Mark instances of the previous email as old
          const previous = telecom.find((contact) => contact.value === oldEmail && contact.system === 'email');
          if (previous) {
            previous.use = 'old';
          }
          (profile as ProfileResource).telecom = telecom;

          await txRepo.updateResource(profile);
        }
      }
    }

    return user;
  });
}
