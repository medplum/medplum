// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource, WithId } from '@medplum/core';
import { badRequest, createReference, created } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { AccessPolicy, ClientApplication, Project, ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { createClient } from '../../admin/client';
import { createUser } from '../../auth/newuser';
import { createProfile, createProjectMembership } from '../../auth/utils';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import { getUserByEmailWithoutProject } from '../../oauth/utils';
import type { SystemRepository } from '../repo';
import { getShardSystemRepo } from '../repo';
import { PLACEHOLDER_SHARD_ID } from '../sharding';
import { makeOperationDefinition } from './definitions';
import {
  buildOutputParameters,
  makeOperationDefinitionParameter as param,
  parseInputParameters,
} from './utils/parameters';

const projectInitOperation = makeOperationDefinition(
  { scope: 'type', resource: 'Project' },
  {
    name: 'project-init',
    code: 'init',
    parameter: [
      param('in', 'name', 'string', 1, '1'),
      param('in', 'owner', 'Reference', 0, '1'),
      param('in', 'ownerEmail', 'string', 0, '1'),
      param('out', 'return', 'Project', 1, '1'),
    ],
  }
);

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
    ownerRef = login.user;
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
 * Creates a new project.
 * @param projectName - The new project name.
 * @param admin - The Project admin user.
 * @returns The new project, and associated data.  Profile and membership are returned if and only if an admin user is specified.
 */
export async function createProject(
  projectName: string,
  admin: User
): Promise<{
  project: WithId<Project>;
  client: WithId<ClientApplication>;
  profile: WithId<ProfileResource>;
  membership: WithId<ProjectMembership>;
}>;
export async function createProject(
  projectName: string,
  admin?: User
): Promise<{
  project: WithId<Project>;
  client: WithId<ClientApplication>;
  profile?: WithId<ProfileResource>;
  membership?: WithId<ProjectMembership>;
}>;
export async function createProject(
  projectName: string,
  admin?: User
): Promise<{
  project: WithId<Project>;
  client: WithId<ClientApplication>;
  profile?: WithId<ProfileResource>;
  membership?: WithId<ProjectMembership>;
}> {
  const log = getLogger();
  const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID); // shardId will be a parameter of this function
  const config = getConfig();

  log.info('Project creation request received', { name: projectName });
  let project = await systemRepo.createResource<Project>({
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
  });
  const client = await createClient(systemRepo, {
    project,
    name: project.name + ' Default Client',
    description: 'Default client for ' + project.name,
  });

  const accessPolicy = await createDefaultPatientAccessPolicy(systemRepo, project);
  project = await systemRepo.patchResource<Project>('Project', project.id, [
    { op: 'add', path: '/defaultPatientAccessPolicy', value: createReference(accessPolicy) },
  ]);

  if (admin) {
    const profile = await createProfile(
      systemRepo,
      project,
      'Practitioner',
      admin.firstName,
      admin.lastName,
      admin.email
    );
    const membership = await createProjectMembership(systemRepo, admin, project, profile, { admin: true });
    return { project, profile, membership, client };
  }
  return { project, client };
}

async function createDefaultPatientAccessPolicy(
  systemRepo: SystemRepository,
  project: WithId<Project>
): Promise<WithId<AccessPolicy>> {
  return systemRepo.createResource<AccessPolicy>({
    resourceType: 'AccessPolicy',
    meta: { project: project.id },
    name: 'Default Patient Access Policy',
    compartment: { reference: '%patient' },
    resource: [
      { resourceType: 'Patient', criteria: 'Patient?_id=%patient.id' },
      { resourceType: 'AllergyIntolerance', criteria: 'AllergyIntolerance?_compartment=%patient' },
      { resourceType: 'Appointment', criteria: 'Appointment?_compartment=%patient' },
      { resourceType: 'CarePlan', criteria: 'CarePlan?_compartment=%patient' },
      { resourceType: 'CareTeam', criteria: 'CareTeam?_compartment=%patient' },
      { resourceType: 'Communication', criteria: 'Communication?sender=%patient' },
      { resourceType: 'Communication', criteria: 'Communication?recipient=%patient' },
      { resourceType: 'Condition', criteria: 'Condition?_compartment=%patient' },
      { resourceType: 'Coverage', criteria: 'Coverage?_compartment=%patient' },
      { resourceType: 'DiagnosticReport', criteria: 'DiagnosticReport?_compartment=%patient' },
      { resourceType: 'DocumentReference', criteria: 'DocumentReference?_compartment=%patient' },
      { resourceType: 'Encounter', criteria: 'Encounter?_compartment=%patient' },
      { resourceType: 'Goal', criteria: 'Goal?_compartment=%patient' },
      { resourceType: 'Immunization', criteria: 'Immunization?_compartment=%patient' },
      { resourceType: 'MedicationRequest', criteria: 'MedicationRequest?_compartment=%patient' },
      { resourceType: 'MedicationStatement', criteria: 'MedicationStatement?_compartment=%patient' },
      { resourceType: 'Observation', criteria: 'Observation?_compartment=%patient' },
      { resourceType: 'Procedure', criteria: 'Procedure?_compartment=%patient' },
      { resourceType: 'QuestionnaireResponse', criteria: 'QuestionnaireResponse?_compartment=%patient' },
      { resourceType: 'RelatedPerson', criteria: 'RelatedPerson?_compartment=%patient' },
      { resourceType: 'ServiceRequest', criteria: 'ServiceRequest?_compartment=%patient' },
      { resourceType: 'Task', criteria: 'Task?_compartment=%patient' },
    ],
  });
}
