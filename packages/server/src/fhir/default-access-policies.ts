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

/**
 * Curated knowledge, terminology, and conformance resources that non-admin Practitioners can read but not edit.
 * These are typically managed at the project/admin level rather than by front-line users.
 */
const PRACTITIONER_READONLY_RESOURCE_TYPES: ResourceType[] = [
  'MedicationKnowledge',
  'PlanDefinition',
  'ActivityDefinition',
  'ObservationDefinition',
  'ValueSet',
  'StructureDefinition',
  'CodeSystem',
];

/**
 * The default access policy for each profile type, in the order they are listed on `Project.defaultAccessPolicies`.
 * Typed as a complete record so that adding a profile type code requires adding its default here.
 */
export const DEFAULT_ACCESS_POLICIES: Readonly<Record<DefaultAccessPolicyProfileType, () => DefaultAccessPolicy>> = {
  Patient: () => ({
    name: 'Default Patient Access Policy',
    compartment: { reference: '%patient' },
    resource: patientCompartmentResources(),
  }),
  RelatedPerson: () => ({
    name: 'Default RelatedPerson Access Policy',
    compartment: { reference: '%patient' },
    resource: patientCompartmentResources(),
  }),
  Admin: () => ({
    name: 'Default Admin Access Policy',
    resource: writableExcept({}),
  }),
  Practitioner: () => ({
    name: 'Default Practitioner Access Policy',
    resource: writableExcept({ readonly: PRACTITIONER_READONLY_RESOURCE_TYPES }),
  }),
  Bot: () => ({
    name: 'Default Bot Access Policy',
    resource: writableExcept({
      readonly: ['AccessPolicy'],
      hiddenFields: { ClientApplication: CLIENT_SECRET_FIELDS },
    }),
  }),
  ClientApplication: () => ({
    name: 'Default ClientApplication Access Policy',
    // ClientApplication is read-only: credential fields such as jwksUri and identityProvider would otherwise let a
    // client take over another client's identity.
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
 * Compiles "read/write everything, except these restrictions" into access policy entries.
 *
 * This is the only place that should depend on how entries are evaluated:
 * - Permissions are additive: an interaction is allowed if *any* entry grants it. A write wildcard would therefore
 *   override any read-only entry, so when a non-admin type must be read-only, the policy instead grants read via a
 *   readonly wildcard and lists every writable resource type explicitly.
 * - The server applies `hiddenFields` from the first entry matching the resource and interaction (read or update).
 *   Entries with hidden fields go before the wildcard, or the wildcard would match first and expose the fields.
 *   Those types also get no `{ resourceType }` entry, the writable entry with no hidden fields that other types get:
 *   if the hidden-fields entry is read-only, updates skip it, match that entry instead, and could overwrite the
 *   hidden fields.
 * - The wildcard never matches project admin or protected resource types, which non-admins cannot write. Read-only
 *   project admin types get their own readonly entry.
 *
 * Because writable types are listed explicitly, the policy only covers resource types that exist when it is created.
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

  // If every read-only type is a project admin type (or there are none), a write wildcard is safe: '*' never matches
  // project admin types, so it can't make them writable. This skips listing each writable type, so the policy also
  // covers resource types added later. Field entries still come first, so their fields apply on both read and update.
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
