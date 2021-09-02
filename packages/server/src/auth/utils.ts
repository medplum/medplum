import { assertOk, createReference, Practitioner, Project, ProjectMembership, User } from '@medplum/core';
import { repo } from '../fhir';
import { logger } from '../logger';

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
    meta: {
      project: project.id
    },
    project: createReference(project),
    user: createReference(user),
    profile: createReference(practitioner),
    compartments: [
      createReference(project)
    ],
    admin
  });
  assertOk(outcome);
  logger.info('Created: ' + (result as ProjectMembership).id);
  return result as ProjectMembership;
}
