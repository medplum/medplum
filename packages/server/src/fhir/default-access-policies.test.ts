// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  AccessPolicyInteraction,
  accessPolicySupportsInteraction,
  getResourceTypes,
  indexStructureDefinitionBundle,
  projectAdminResourceTypes,
  protectedResourceTypes,
  satisfiedAccessPolicy,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import type { AccessPolicy, Bundle, Resource, ResourceType } from '@medplum/fhirtypes';
import type { DefaultAccessPolicyProfileType } from './default-access-policies';
import { DEFAULT_ACCESS_POLICIES } from './default-access-policies';

type Access = 'write' | 'read' | 'none';

function buildPolicy(profileType: DefaultAccessPolicyProfileType): AccessPolicy {
  return { resourceType: 'AccessPolicy', ...DEFAULT_ACCESS_POLICIES[profileType]() };
}

function getAccess(policy: AccessPolicy, resourceType: ResourceType): Access {
  if (accessPolicySupportsInteraction(policy, AccessPolicyInteraction.UPDATE, resourceType)) {
    return 'write';
  }
  return accessPolicySupportsInteraction(policy, AccessPolicyInteraction.READ, resourceType) ? 'read' : 'none';
}

function getHiddenFields(
  policy: AccessPolicy,
  resourceType: ResourceType,
  interaction: AccessPolicyInteraction
): string[] | undefined {
  return satisfiedAccessPolicy({ resourceType } as Resource, interaction, policy)?.hiddenFields;
}

// Project admin and protected resource types are governed by server rules, not these policies
function getNonAdminResourceTypes(): ResourceType[] {
  return getResourceTypes().filter(
    (resourceType) =>
      !projectAdminResourceTypes.includes(resourceType) && !protectedResourceTypes.includes(resourceType)
  );
}

describe('Default access policies', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
  });

  // Patient-compartment types: writable in the patient compartment, subject to each entry's criteria
  const patientCompartmentAccess: Partial<Record<ResourceType, Access>> = Object.fromEntries(
    (
      [
        'AllergyIntolerance',
        'Appointment',
        'CarePlan',
        'CareTeam',
        'Communication',
        'Condition',
        'Coverage',
        'DiagnosticReport',
        'DocumentReference',
        'Encounter',
        'Goal',
        'Immunization',
        'MedicationRequest',
        'MedicationStatement',
        'Observation',
        'Patient',
        'Procedure',
        'QuestionnaireResponse',
        'RelatedPerson',
        'ServiceRequest',
        'Task',
      ] satisfies ResourceType[]
    ).map((resourceType) => [resourceType, 'write'])
  );

  // Access to each non-admin resource type: `others` applies to every type not in `except`
  const expectedAccess: Record<
    DefaultAccessPolicyProfileType,
    { others: Access; except: Partial<Record<ResourceType, Access>> }
  > = {
    Patient: { others: 'none', except: patientCompartmentAccess },
    RelatedPerson: { others: 'none', except: patientCompartmentAccess },
    Admin: { others: 'write', except: {} },
    Practitioner: {
      others: 'write',
      except: {
        ActivityDefinition: 'read',
        CodeSystem: 'read',
        MedicationKnowledge: 'read',
        ObservationDefinition: 'read',
        PlanDefinition: 'read',
        StructureDefinition: 'read',
        ValueSet: 'read',
      },
    },
    Bot: { others: 'write', except: {} },
    ClientApplication: { others: 'write', except: { Bot: 'read', ClientApplication: 'read' } },
  };

  test.each(Object.entries(expectedAccess))('%s default resource type access', (profileType, { others, except }) => {
    const policy = buildPolicy(profileType as DefaultAccessPolicyProfileType);
    for (const resourceType of getNonAdminResourceTypes()) {
      expect([resourceType, getAccess(policy, resourceType)]).toStrictEqual([
        resourceType,
        except[resourceType] ?? others,
      ]);
    }
  });

  // Every hidden field in every default. Adding or removing one must be a deliberate change here.
  const expectedHiddenFields: Record<DefaultAccessPolicyProfileType, Partial<Record<ResourceType, string[]>>> = {
    Patient: {},
    RelatedPerson: {},
    Admin: {},
    Practitioner: {},
    Bot: { ClientApplication: ['secret', 'retiringSecret'] },
    ClientApplication: { ClientApplication: ['secret', 'retiringSecret'] },
  };

  test.each(Object.entries(expectedHiddenFields))('%s default hidden fields', (profileType, expected) => {
    const policy = buildPolicy(profileType as DefaultAccessPolicyProfileType);
    const declared = Object.fromEntries(
      (policy.resource ?? [])
        .filter((entry) => entry.hiddenFields)
        .map((entry) => [entry.resourceType, entry.hiddenFields])
    );
    expect(declared).toStrictEqual(expected);

    // The server applies hidden fields from the first entry matching the interaction. Reads must hide them, and
    // updates must match an entry that has them too, so the server restores them instead of saving new values.
    for (const [resourceType, fields] of Object.entries(declared)) {
      for (const interaction of [AccessPolicyInteraction.READ, AccessPolicyInteraction.UPDATE]) {
        if (accessPolicySupportsInteraction(policy, interaction, resourceType as ResourceType)) {
          expect([
            resourceType,
            interaction,
            getHiddenFields(policy, resourceType as ResourceType, interaction),
          ]).toStrictEqual([resourceType, interaction, fields]);
        }
      }
    }
  });

  test.each<DefaultAccessPolicyProfileType>(['Patient', 'RelatedPerson'])(
    '%s default is limited to the patient compartment',
    (profileType) => {
      const policy = buildPolicy(profileType);
      expect(policy.compartment).toStrictEqual({ reference: '%patient' });
      // Access to a patient's resources depends on the compartment criteria, so an unrelated resource doesn't match
      expect(
        satisfiedAccessPolicy({ resourceType: 'Observation' } as Resource, AccessPolicyInteraction.READ, policy)
      ).toBeUndefined();
    }
  );
});
