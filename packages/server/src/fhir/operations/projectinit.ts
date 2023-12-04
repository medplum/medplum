import {
  ClientApplication,
  OperationDefinition,
  Project,
  ProjectMembership,
  Reference,
  User,
} from '@medplum/fhirtypes';
import { getAuthenticatedContext, getRequestContext } from '../../context';
import { systemRepo } from '../repo';
import { ProfileResource, badRequest, createReference, created } from '@medplum/core';
import { parseInputParameters, sendOutputParameters } from './utils/parameters';
import { Request, Response } from 'express';
import { sendOutcome } from '../outcomes';
import { createClient } from '../../admin/client';
import { createProfile, createProjectMembership } from '../../auth/utils';
import { getUserByEmailWithoutProject } from '../../oauth/utils';
import { createUser } from '../../auth/newuser';
import { randomUUID } from 'crypto';

const projectInitOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'project-init',
  status: 'active',
  kind: 'operation',
  code: 'init',
  resource: ['Project'],
  system: false,
  type: true,
  instance: false,
  parameter: [
    {
      use: 'in',
      name: 'name',
      type: 'string',
      min: 1,
      max: '1',
    },
    {
      use: 'in',
      name: 'owner',
      type: 'Reference',
      min: 0,
      max: '1',
    },
    {
      use: 'in',
      name: 'ownerEmail',
      type: 'string',
      min: 0,
      max: '1',
    },
    {
      use: 'out',
      name: 'return',
      type: 'Project',
      min: 1,
      max: '1',
    },
  ],
};

interface ProjectInitParameters {
  name: string;
  owner?: Reference;
  ownerEmail?: string;
}

/**
 * Handles a request to create a new Project.
 *
 * Endpoint - Project resource type
 *   [fhir base]/Project/$init
 *
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 */
export async function projectInitHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
  const login = ctx.login;

  const params = parseInputParameters<ProjectInitParameters>(projectInitOperation, req);

  let ownerRef: Reference;
  if (params.owner) {
    ownerRef = params.owner;
  } else if (params.ownerEmail) {
    let user = await getUserByEmailWithoutProject(params.ownerEmail);
    if (!user) {
      user = await createUser({
        email: params.ownerEmail,
        password: randomUUID(),
        firstName: params.name,
        lastName: 'Admin',
      });
    }
    ownerRef = createReference(user);
  } else {
    ownerRef = login.user as Reference;
  }
  const owner = await systemRepo.readReference(ownerRef);

  if (owner.resourceType !== 'User') {
    sendOutcome(res, badRequest('Only Users are permitted to be the owner of a new Project'));
    return;
  } else if (owner.project) {
    sendOutcome(res, badRequest('Project owner must not belong to another Project'));
    return;
  }

  const { project } = await createProject(params.name, owner);
  await sendOutputParameters(projectInitOperation, res, created, project);
}

/**
 * Creates a new project.
 * @param projectName - The new project name.
 * @param admin - The Project admin user.
 * @returns The new project, admin, membership and associated data.
 */
export async function createProject(
  projectName: string,
  admin: User
): Promise<{
  project: Project;
  profile: ProfileResource;
  membership: ProjectMembership;
  client: ClientApplication;
}> {
  const ctx = getRequestContext();

  ctx.logger.info('Project creation request received', { name: projectName });
  const project = await systemRepo.createResource<Project>({
    resourceType: 'Project',
    name: projectName,
    owner: createReference(admin),
    strictMode: true,
  });

  ctx.logger.info('Project created', {
    id: project.id,
    name: projectName,
  });
  const client = await createClient(systemRepo, {
    project,
    name: project.name + ' Default Client',
    description: 'Default client for ' + project.name,
  });

  const profile = await createProfile(
    project,
    'Practitioner',
    admin.firstName as string,
    admin.lastName as string,
    admin.email as string
  );
  const membership = await createProjectMembership(admin, project, profile, { admin: true });

  return { project, profile, membership, client };
}
