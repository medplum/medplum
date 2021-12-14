import { assertOk, createReference, Login, Practitioner, Project, ProjectMembership, Reference, User } from '@medplum/core';
import { Response } from 'express';
import { repo } from '../fhir';
import { rewriteAttachments, RewriteMode } from '../fhir/rewrite';
import { logger } from '../logger';
import { getUserMemberships } from '../oauth';

export interface NewAccountRequest {
  firstName: string;
  lastName: string;
  email: string;
}

export async function createPractitioner(request: NewAccountRequest, project: Project): Promise<Practitioner> {
  logger.info(`Create practitioner: ${request.firstName} ${request.lastName}`);
  const [outcome, result] = await repo.createResource<Practitioner>({
    resourceType: 'Practitioner',
    meta: {
      project: project.id
    },
    name: [{
      given: [request.firstName],
      family: request.lastName
    }],
    telecom: [
      {
        system: 'email',
        use: 'work',
        value: request.email
      }
    ]
  });
  assertOk(outcome);
  logger.info('Created: ' + (result as Practitioner).id);
  return result as Practitioner;
}

export async function createProjectMembership(
  user: User,
  project: Project,
  practitioner: Practitioner,
  admin: boolean): Promise<ProjectMembership> {

  logger.info('Create project membership: ' + project.name);
  const [outcome, result] = await repo.createResource<ProjectMembership>({
    resourceType: 'ProjectMembership',
    project: createReference(project),
    user: createReference(user),
    profile: createReference(practitioner),
    admin
  });
  assertOk(outcome);
  logger.info('Created: ' + (result as ProjectMembership).id);
  return result as ProjectMembership;
}

/**
 * Sends a login response to the client.
 * If the user has multiple profiles, sends the list of profiles to choose from.
 * Otherwise, sends the authorization code.
 * @param res The response object.
 * @param login The login details.
 */
export async function sendLoginResult(res: Response, login: Login): Promise<void> {
  if (!login?.profile) {
    // User has multiple profiles, so the user needs to select
    // Safe to rewrite attachments,
    // because we know that these are all resources that the user has access to
    // const profiles = await getUserProfiles(login?.user as Reference<User>);
    const memberships = await getUserMemberships(login?.user as Reference<User>);
    const redactedMemberships = memberships.map(m => ({
      id: m.id,
      project: m.project,
      profile: m.profile,
    }));
    res.status(200).json(await rewriteAttachments(RewriteMode.PRESIGNED_URL, repo, {
      login: login?.id,
      memberships: redactedMemberships
    }));

  } else {
    // User only has one profile, so proceed
    res.status(200).json({
      login: login?.id,
      code: login?.code
    });
  }
}
