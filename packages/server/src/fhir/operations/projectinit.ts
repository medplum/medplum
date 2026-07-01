// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource, WithId } from '@medplum/core';
import {
  badRequest,
  createReference,
  created,
  getResourceTypes,
  projectAdminResourceTypes,
  protectedResourceTypes,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type {
  AccessPolicy,
  ClientApplication,
  Project,
  ProjectMembership,
  Reference,
  ResourceType,
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

  const accessPolicy = await createPatientCompartmentAccessPolicy(systemRepo, project, 'Default Patient Access Policy');
  const relatedPersonAccessPolicy = await createPatientCompartmentAccessPolicy(
    systemRepo,
    project,
    'Default RelatedPerson Access Policy'
  );
  const adminAccessPolicy = await createAdminAccessPolicy(systemRepo, project, 'Default Admin Access Policy');
  const practitionerAccessPolicy = await createPractitionerAccessPolicy(
    systemRepo,
    project,
    'Default Practitioner Access Policy'
  );
  project = await systemRepo.patchResource<Project>('Project', project.id, [
    { op: 'add', path: '/defaultPatientAccessPolicy', value: createReference(accessPolicy) },
    {
      op: 'add',
      path: '/defaultAccessPolicies',
      value: [
        { profileType: 'Patient', accessPolicy: createReference(accessPolicy) },
        { profileType: 'RelatedPerson', accessPolicy: createReference(relatedPersonAccessPolicy) },
        { profileType: 'Admin', accessPolicy: createReference(adminAccessPolicy) },
        { profileType: 'Practitioner', accessPolicy: createReference(practitionerAccessPolicy) },
      ],
    },
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

async function createPatientCompartmentAccessPolicy(
  systemRepo: SystemRepository,
  project: WithId<Project>,
  name: string
): Promise<WithId<AccessPolicy>> {
  return systemRepo.createResource<AccessPolicy>({
    resourceType: 'AccessPolicy',
    meta: { project: project.id },
    name,
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

async function createAdminAccessPolicy(
  systemRepo: SystemRepository,
  project: WithId<Project>,
  name: string
): Promise<WithId<AccessPolicy>> {
  return systemRepo.createResource<AccessPolicy>({
    resourceType: 'AccessPolicy',
    meta: { project: project.id },
    name,
    // Full read/write access to all resource types (essentially no policy).
    resource: [{ resourceType: '*' }],
  });
}

/**
 * Knowledge resource types that non-admin Practitioners can read but not edit.
 * These are typically curated at the project/admin level rather than by front-line users.
 */
export const KNOWLEDGE_RESOURCE_TYPES: ResourceType[] = [
  'MedicationKnowledge',
  'PlanDefinition',
  'ActivityDefinition',
  'ObservationDefinition',
];

async function createPractitionerAccessPolicy(
  systemRepo: SystemRepository,
  project: WithId<Project>,
  name: string
): Promise<WithId<AccessPolicy>> {
  // Access policies are additive (a resource is writable if *any* entry grants it), so a
  // "write everything except the knowledge resources" policy cannot use a wildcard write entry.
  // Instead, grant read to everything via a readonly wildcard, then grant full access to every
  // writable resource type explicitly. The knowledge resource types are omitted from the writable
  // set, leaving them read-only. Project admin and protected resource types are excluded as well,
  // since non-admins cannot write those.
  const writableResourceTypes = getResourceTypes().filter(
    (resourceType) =>
      !KNOWLEDGE_RESOURCE_TYPES.includes(resourceType) &&
      !projectAdminResourceTypes.includes(resourceType) &&
      !protectedResourceTypes.includes(resourceType)
  );
  return systemRepo.createResource<AccessPolicy>({
    resourceType: 'AccessPolicy',
    meta: { project: project.id },
    name,
    resource: [
      { resourceType: '*', readonly: true },
      ...writableResourceTypes.map((resourceType) => ({ resourceType })),
    ],
  });
}
