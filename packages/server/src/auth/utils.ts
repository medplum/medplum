import { assertOk, createReference } from '@medplum/core';
import {
  AccessPolicy,
  Login,
  Patient,
  Practitioner,
  Project,
  ProjectMembership,
  Reference,
  Resource,
  User,
} from '@medplum/fhirtypes';
import { Response } from 'express';
import fetch from 'node-fetch';
import { getConfig } from '../config';
import { systemRepo } from '../fhir';
import { rewriteAttachments, RewriteMode } from '../fhir/rewrite';
import { logger } from '../logger';
import { getUserMemberships } from '../oauth';

export interface NewAccountRequest {
  firstName: string;
  lastName: string;
  email: string;
}

export async function createPractitioner(request: NewAccountRequest, project: Project): Promise<Practitioner> {
  return createProfile(request, project, 'Practitioner') as Promise<Practitioner>;
}

export async function createPatient(request: NewAccountRequest, project: Project): Promise<Patient> {
  return createProfile(request, project, 'Patient') as Promise<Patient>;
}

async function createProfile(
  request: NewAccountRequest,
  project: Project,
  resourceType: 'Patient' | 'Practitioner'
): Promise<Resource> {
  logger.info(`Create ${resourceType}: ${request.firstName} ${request.lastName}`);
  const [outcome, result] = await systemRepo.createResource<Resource>({
    resourceType,
    meta: {
      project: project.id,
    },
    name: [
      {
        given: [request.firstName],
        family: request.lastName,
      },
    ],
    telecom: [
      {
        system: 'email',
        use: 'work',
        value: request.email,
      },
    ],
  });
  assertOk(outcome, result);
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
  const [outcome, result] = await systemRepo.createResource<ProjectMembership>({
    resourceType: 'ProjectMembership',
    project: createReference(project),
    user: createReference(user),
    profile: createReference(profile),
    accessPolicy,
    admin,
  });
  assertOk(outcome, result);
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
export async function sendLoginResult(res: Response, login: Login): Promise<void> {
  if (!login?.membership) {
    // User has multiple profiles, so the user needs to select
    // Safe to rewrite attachments,
    // because we know that these are all resources that the user has access to
    const memberships = await getUserMemberships(login?.user as Reference<User>);
    const redactedMemberships = memberships.map((m) => ({
      id: m.id,
      project: m.project,
      profile: m.profile,
    }));
    res.status(200).json(
      await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, {
        login: login?.id,
        memberships: redactedMemberships,
      })
    );
  } else {
    // User only has one profile, so proceed
    res.status(200).json({
      login: login?.id,
      code: login?.code,
    });
  }
}

/**
 * Verifies the recaptcha response from the client.
 * @param recaptchaToken The Recaptcha response from the client.
 * @returns True on success, false on failure.
 */
export async function verifyRecaptcha(recaptchaToken: string): Promise<boolean> {
  const secretKey = getConfig().recaptchaSecretKey as string;

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
