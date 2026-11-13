// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getResourceTypes, projectAdminResourceTypes, protectedResourceTypes } from '@medplum/core';
import type {
  AccessPolicy,
  AccessPolicyResource,
  Project,
  ProjectDefaultAccessPolicies,
  Reference,
  ResourceType,
} from '@medplum/fhirtypes';

export type DefaultAccessPolicyProfileType = ProjectDefaultAccessPolicies['profileType'];

/** Content of a default access policy, before it is saved to a project. */
export type DefaultAccessPolicy = Pick<AccessPolicy, 'name' | 'compartment' | 'resource'>;

const CLIENT_SECRET_FIELDS = ['secret', 'retiringSecret'];

/** Knowledge, terminology, and conformance resources managed by admins rather than front-line users. */
const PRACTITIONER_READONLY_RESOURCE_TYPES: ResourceType[] = [
  'MedicationKnowledge',
  'PlanDefinition',
  'ActivityDefinition',
  'ObservationDefinition',
  'ValueSet',
  'StructureDefinition',
  'CodeSystem',
];

/** The default access policy for each profile type, in the order they are listed on `Project.defaultAccessPolicies`. */
export const DEFAULT_ACCESS_POLICIES: Readonly<Record<DefaultAccessPolicyProfileType, () => DefaultAccessPolicy>> = {
  Patient: () => ({
    name: 'Default Patient Access Policy',
    // Criteria below limit reads to the patient compartment, which the server assigns from
    // patient references on the resource. A top-level compartment would only tag meta.accounts on create.
    resource: patientCompartmentResources(),
  }),
  RelatedPerson: () => ({
    name: 'Default RelatedPerson Access Policy',
    // Same criteria as the patient policy. %patient is the associated Patient, supplied by
    // ProjectMembership.access.parameter on invite. The profile is the RelatedPerson, so it
    // cannot fill %patient.
    resource: patientCompartmentResources(),
  }),
  Admin: () => ({
    name: 'Default Admin Access Policy',
    resource: writableExcept({}),
  }),
  Practitioner: () => ({
    name: 'Default Practitioner Access Policy',
    resource: writableExcept({
      readonly: [...PRACTITIONER_READONLY_RESOURCE_TYPES, 'Bot', 'ClientApplication'],
      hiddenFields: { ClientApplication: CLIENT_SECRET_FIELDS },
    }),
  }),
  Bot: () => ({
    name: 'Default Bot Access Policy',
    resource: writableExcept({
      readonly: ['AccessPolicy', 'Bot', 'ClientApplication'],
      hiddenFields: { ClientApplication: CLIENT_SECRET_FIELDS },
    }),
  }),
  ClientApplication: () => ({
    name: 'Default ClientApplication Access Policy',
    resource: writableExcept({
      readonly: ['AccessPolicy', 'Bot', 'ClientApplication'],
      hiddenFields: { ClientApplication: CLIENT_SECRET_FIELDS },
    }),
  }),
};

/**
 * Returns the project's default access policy for a profile type.
 * @param project - The project.
 * @param profileType - The member profile type.
 * @returns The default access policy reference, if the project defines one.
 */
export function getDefaultAccessPolicy(
  project: Project,
  profileType: DefaultAccessPolicyProfileType
): Reference<AccessPolicy> | undefined {
  return project.defaultAccessPolicies?.find((p) => p.profileType === profileType)?.accessPolicy;
}

/**
 * Patient access policy used when none is chosen explicitly.
 * Prefers the Patient entry in `defaultAccessPolicies`, then the deprecated `defaultPatientAccessPolicy`.
 * @param project - The project.
 * @returns The access policy reference, if the project defines one.
 */
export function getDefaultPatientAccessPolicy(project: Project): Reference<AccessPolicy> | undefined {
  return getDefaultAccessPolicy(project, 'Patient') ?? project.defaultPatientAccessPolicy;
}

/**
 * Compiles "read/write everything, except these restrictions" into access policy entries.
 *
 * - Permissions are additive, so a write wildcard would override any read-only entry. When a non-admin type must be
 *   read-only, read comes from a readonly wildcard and each writable type is listed, so the policy only covers types
 *   that exist when it is created.
 * - The server takes `hiddenFields` from the first entry matching the resource and interaction (read or update).
 *   Entries with hidden fields go before the wildcard, or the wildcard would match first and expose the fields.
 *   Those types also get no `{ resourceType }` entry, the writable entry with no hidden fields that other types get:
 *   if the hidden-fields entry is read-only, updates skip it, match that entry instead, and could overwrite the
 *   hidden fields.
 * - `'*'` never matches project admin types, so read-only ones get their own entry. Project admin and protected types
 *   are never listed as writable: the server replaces project admin entries at login and allows protected types only
 *   for super admins.
 * @param options - The restrictions.
 * @param options.readonly - Resource types that can be read but not written.
 * @param options.hiddenFields - Fields hidden from reads (and preserved on writes), by resource type.
 * @returns The access policy entries.
 */
function writableExcept(options: {
  readonly?: ResourceType[];
  hiddenFields?: Partial<Record<ResourceType, string[]>>;
}): AccessPolicyResource[] {
  const readonly = options.readonly ?? [];
  const hiddenFields = options.hiddenFields ?? {};

  const fieldEntries = Object.entries(hiddenFields).map(([resourceType, fields]) => ({
    resourceType,
    ...(readonly.includes(resourceType as ResourceType) && { readonly: true }),
    hiddenFields: fields,
  }));
  const projectAdminReadonlyEntries = readonly
    .filter((resourceType) => projectAdminResourceTypes.includes(resourceType))
    .map((resourceType) => ({ resourceType, readonly: true }));

  // With no non-admin read-only types, a write wildcard is safe ('*' never matches project admin types), and unlike a
  // list of writable types it also covers resource types added later.
  if (readonly.every((resourceType) => projectAdminResourceTypes.includes(resourceType))) {
    return [...fieldEntries, ...projectAdminReadonlyEntries, { resourceType: '*' }];
  }

  const writableEntries = getResourceTypes()
    .filter(
      (resourceType) =>
        !readonly.includes(resourceType) &&
        !(resourceType in hiddenFields) &&
        !projectAdminResourceTypes.includes(resourceType) &&
        !protectedResourceTypes.includes(resourceType)
    )
    .map((resourceType) => ({ resourceType }));
  return [
    ...fieldEntries,
    { resourceType: '*', readonly: true },
    ...projectAdminReadonlyEntries, // not overshadowed by the '*' entry above since '*' doesn't match `projectAdminResourceTypes`
    ...writableEntries,
  ];
}

function patientCompartmentResources(): AccessPolicyResource[] {
  return [
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
  ];
}
