import { createReference } from '@medplum/core';
import {
  AccessPolicy,
  Login,
  Patient,
  Practitioner,
  Project,
  ProjectMembership,
  Reference,
  User,
} from '@medplum/fhirtypes';
import { Response } from 'express';
import fetch from 'node-fetch';
import { systemRepo } from '../fhir';
import { rewriteAttachments, RewriteMode } from '../fhir/rewrite';
import { logger } from '../logger';
import { getUserMemberships } from '../oauth';

export async function createProfile(
  project: Project,
  resourceType: 'Patient' | 'Practitioner',
  firstName: string,
  lastName: string,
  email: string
): Promise<Patient | Practitioner> {
  logger.info(`Create ${resourceType}: ${firstName} ${lastName}`);
  const result = await systemRepo.createResource<Patient | Practitioner>({
    resourceType,
    meta: {
      project: project.id,
    },
    name: [
      {
        given: [firstName],
        family: lastName,
      },
    ],
    telecom: [
      {
        system: 'email',
        use: 'work',
        value: email,
      },
    ],
  });
  logger.info('Created: ' + result.id);
  return result;
}

export async function createProjectMembership(
  user: User,
  project: Project,
  profile: Patient | Practitioner,
  accessPolicy?: Reference<AccessPolicy>,
  admin?: boolean
): Promise<ProjectMembership> {
  logger.info('Create project membership: ' + project.name);
  const result = await systemRepo.createResource<ProjectMembership>({
    resourceType: 'ProjectMembership',
    project: createReference(project),
    user: createReference(user),
    profile: createReference(profile),
    accessPolicy,
    admin,
  });
  logger.info('Created: ' + result.id);
  return result;
}

/**
 * Sends a login response to the client.
 * If the user has multiple profiles, sends the list of profiles to choose from.
 * Otherwise, sends the authorization code.
 * @param res The response object.
 * @param login The login details.
 */
export async function sendLoginResult(res: Response, login: Login, newProject: boolean): Promise<void> {
  if (newProject) {
    // User is creating a new project.
    res.json({ login: login.id });
    return;
  }

  if (login.membership) {
    // User only has one profile, so proceed
    res.json({
      login: login?.id,
      code: login?.code,
    });
    return;
  }

  // User has multiple profiles, so the user needs to select
  // Safe to rewrite attachments,
  // because we know that these are all resources that the user has access to
  const memberships = await getUserMemberships(login?.user as Reference<User>); //, newProject ? 'new' : undefined);
  const redactedMemberships = memberships.map((m) => ({
    id: m.id,
    project: m.project,
    profile: m.profile,
  }));
  res.json(
    await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, {
      login: login?.id,
      memberships: redactedMemberships,
    })
  );
}

/**
 * Verifies the recaptcha response from the client.
 * @param secretKey The Recaptcha secret key to use for verification.
 * @param recaptchaToken The Recaptcha response from the client.
 * @returns True on success, false on failure.
 */
export async function verifyRecaptcha(secretKey: string, recaptchaToken: string): Promise<boolean> {
  const url =
    'https://www.google.com/recaptcha/api/siteverify' +
    '?secret=' +
    encodeURIComponent(secretKey) +
    '&response=' +
    encodeURIComponent(recaptchaToken);

  const response = await fetch(url, { method: 'POST' });
  const json = (await response.json()) as { success: boolean };
  return json.success;
}
