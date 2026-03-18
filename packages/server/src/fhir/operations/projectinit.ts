// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource, WithId } from '@medplum/core';
import { badRequest, createReference, created } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type {
  ClientApplication,
  OperationDefinition,
  Project,
  ProjectMembership,
  Reference,
  User,
} from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { createClient } from '../../admin/client';
import { createUser } from '../../auth/newuser';
import { createProfile, createProjectMembership } from '../../auth/utils';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import { getUserByEmailWithoutProject } from '../../oauth/utils';
import { setProjectShard } from '../../sharding/sharding-utils';
import type { SystemRepository } from '../repo';
import { getGlobalSystemRepo, getShardSystemRepo } from '../repo';
import { GLOBAL_SHARD_ID } from '../sharding';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

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
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function projectInitHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const login = ctx.login;

  const params = parseInputParameters<ProjectInitParameters>(projectInitOperation, req);

  let ownerRef: Reference | undefined;
  if (params.owner) {
    ownerRef = params.owner;
  } else if (params.ownerEmail) {
    let user = await getUserByEmailWithoutProject(params.ownerEmail);
    user ??= await createUser({
      email: params.ownerEmail,
      password: randomUUID(),
      firstName: params.name,
      lastName: 'Admin',
    });
    ownerRef = createReference(user);
  } else if (login.user.reference?.startsWith('User/')) {
    ownerRef = login.user as Reference;
  }

  const owner = ownerRef ? await ctx.systemRepo.readReference(ownerRef) : undefined;
  if (owner) {
    if (owner.resourceType !== 'User') {
      return [badRequest('Only Users are permitted to be the owner of a new Project')];
    } else if (owner.project) {
      return [badRequest('Project owner must not belong to another Project')];
    }
  }
  const { project } = await createProject(params.name, owner);
  return [created, buildOutputParameters(projectInitOperation, project)];
}

/**
 * Creates a Project resource with shard-aware logic.
 * Handles creating a global stub for non-global shards.
 * @param systemRepo - The system repository determining which shard to write to.
 * @param project - The project properties to create.
 * @returns The created project and its shard ID.
 */
export async function createProjectResource(
  systemRepo: SystemRepository,
  project: Project
): Promise<{ project: WithId<Project>; shardId: string }> {
  const shardId = systemRepo.shardId;
  setProjectShard(shardId, project);
  // SHARDING SYNC SYNC

  if (shardId !== GLOBAL_SHARD_ID) {
    const globalSystemRepo = getGlobalSystemRepo();
    // A minimal representation of the project for the global shard
    const globalProject: WithId<Project> = {
      resourceType: 'Project',
      id: globalSystemRepo.generateId(),
      meta: {
        lastUpdated: new Date().toISOString(),
        versionId: globalSystemRepo.generateId(),
      },
      strictMode: true,
    };
    setProjectShard(shardId, globalProject);
    // Utilize syncResourceFromShard to bootstrap the project on the global shard.
    // This keeps getProjectAndProjectShardId and other Repository/sharing helpers happy
    // during project initialization since shard-syncing will not have had a chance to run yet.
    await globalSystemRepo.syncResourceFromShard(globalProject);
    project.id = globalProject.id;
  }

  const created = await systemRepo.createResource<Project>(project, {
    assignedId: Boolean(project.id),
  });

  return { project: created, shardId };
}

/**
 * Creates a new project with a default client, and optionally an admin profile and membership.
 * @param projectName - The new project name.
 * @param admin - The Project admin user.
 * @returns The new project, and associated data.  Profile and membership are returned if and only if an admin user is specified.
 */
export async function createProject(
  projectName: string,
  admin: User
): Promise<{
  project: WithId<Project>;
  shardId: string;
  client: WithId<ClientApplication>;
  profile: WithId<ProfileResource>;
  membership: WithId<ProjectMembership>;
}>;
export async function createProject(
  projectName: string,
  admin?: User
): Promise<{
  project: WithId<Project>;
  shardId: string;
  client: WithId<ClientApplication>;
  profile?: WithId<ProfileResource>;
  membership?: WithId<ProjectMembership>;
}>;
export async function createProject(
  projectName: string,
  admin?: User
): Promise<{
  project: WithId<Project>;
  shardId: string;
  client: WithId<ClientApplication>;
  profile?: WithId<ProfileResource>;
  membership?: WithId<ProjectMembership>;
}> {
  const log = getLogger();
  const config = getConfig();
  const shardSystemRepo = getShardSystemRepo(config.defaultShardId ?? GLOBAL_SHARD_ID);

  log.info('Project creation request received', { shardId: shardSystemRepo.shardId, name: projectName });

  const { project, shardId } = await createProjectResource(shardSystemRepo, {
    resourceType: 'Project',
    name: projectName,
    owner: admin ? createReference(admin) : undefined,
    strictMode: true,
    features: config.defaultProjectFeatures,
    systemSetting: config.defaultProjectSystemSetting,
  });

  log.info('Project created', {
    id: project.id,
    name: projectName,
    shardId,
  });
  const client = await createClient(shardSystemRepo, {
    project,
    name: project.name + ' Default Client',
    description: 'Default client for ' + project.name,
  });

  if (admin) {
    const profile = await createProfile(
      shardSystemRepo,
      project,
      'Practitioner',
      admin.firstName,
      admin.lastName,
      admin.email as string
    );
    const membership = await createProjectMembership(shardSystemRepo, admin, project, profile, { admin: true });
    return { project, shardId, profile, membership, client };
  }
  return { project, shardId, client };
}
