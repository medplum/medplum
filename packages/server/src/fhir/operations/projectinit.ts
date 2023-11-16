import { ClientApplication, Project, ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import { getAuthenticatedContext, getRequestContext } from '../../context';
import { systemRepo } from '../repo';
import { OperationOutcomeError, ProfileResource, badRequest, createReference, created, forbidden } from '@medplum/core';
import { parseParameters } from './utils/parameters';
import { Request, Response } from 'express';
import { sendOutcome } from '../outcomes';
import { sendResponse } from '../routes';
import { createClient } from '../../admin/client';
import { createProfile, createProjectMembership } from '../../auth/utils';

interface ProjectInitParameters {
  name: string;
  owner?: string;
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
  if (!login.superAdmin) {
    sendOutcome(res, forbidden);
    return;
  }
  const params = parseParameters<ProjectInitParameters>(req.body);
  if (!params.name) {
    sendOutcome(res, badRequest('Project name is required', 'Parameters.parameter'));
    return;
  }

  let ownerRef: Reference;
  if (params.owner) {
    ownerRef = { reference: params.owner };
  } else {
    ownerRef = login.user as Reference;
  }
  const owner = await systemRepo.readReference(ownerRef);
  if (owner.resourceType !== 'User') {
    throw new OperationOutcomeError(badRequest('Only Users are permitted to be the owner of a new Project'));
  }

  const { project } = await createProject(params.name, owner);
  await sendResponse(res, created, project);
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
