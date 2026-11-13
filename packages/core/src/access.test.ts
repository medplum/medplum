// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '@medplum/definitions';
import type {
  AccessPolicy,
  Bundle,
  Communication,
  Observation,
  Organization,
  Resource,
  SearchParameter,
} from '@medplum/fhirtypes';
import {
  AccessPolicyInteraction,
  canReadResourceType,
  canWriteResource,
  canWriteResourceType,
  satisfiedAccessPolicy,
} from './access';
import { indexSearchParameterBundle } from './types';
import { indexStructureDefinitionBundle } from './typeschema/types';

const nullPolicy: AccessPolicy = {
  resourceType: 'AccessPolicy',
};

const wildcardPolicy: AccessPolicy = {
  resourceType: 'AccessPolicy',
  resource: [
    {
      resourceType: '*',
    },
  ],
};

const restrictedPolicy: AccessPolicy = {
  resourceType: 'AccessPolicy',
  resource: [
    {
      resourceType: 'Patient',
      readonly: true,
    },
    {
      resourceType: 'Observation',
      readonly: false,
    },
    {
      resourceType: 'Communication',
      criteria: 'Communication?status=in-progress',
    },
    {
      resourceType: 'Communication',
      readonly: true,
      criteria: 'Communication?status=completed',
    },
    {
      resourceType: 'List',
      interaction: ['read', 'search', 'create'],
    },
  ],
};

describe('Access', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  });

  test('canReadResourceType', () => {
    expect(canReadResourceType(nullPolicy, 'Patient')).toBe(false);

    expect(canReadResourceType(wildcardPolicy, 'Patient')).toBe(true);

    expect(canReadResourceType(restrictedPolicy, 'Patient')).toBe(true);
    expect(canReadResourceType(restrictedPolicy, 'Observation')).toBe(true);
    expect(canReadResourceType(restrictedPolicy, 'Practitioner')).toBe(false);
  });

  test('canWriteResourceType', () => {
    expect(canWriteResourceType(nullPolicy, 'Patient')).toBe(false);

    expect(canWriteResourceType(wildcardPolicy, 'CapabilityStatement')).toBe(true);
    expect(canWriteResourceType(wildcardPolicy, 'Enterprise')).toBe(false);
    expect(canWriteResourceType(wildcardPolicy, 'Login')).toBe(false);
    expect(canWriteResourceType(wildcardPolicy, 'Patient')).toBe(true);

    expect(canWriteResourceType(restrictedPolicy, 'CapabilityStatement')).toBe(false);
    expect(canWriteResourceType(restrictedPolicy, 'Enterprise')).toBe(false);
    expect(canWriteResourceType(restrictedPolicy, 'Login')).toBe(false);
    expect(canWriteResourceType(restrictedPolicy, 'Patient')).toBe(false);
    expect(canWriteResourceType(restrictedPolicy, 'Observation')).toBe(true);
    expect(canWriteResourceType(restrictedPolicy, 'Practitioner')).toBe(false);
    expect(canWriteResourceType(restrictedPolicy, 'Communication')).toBe(true);
  });

  test('canWriteResource', () => {
    expect(canWriteResource(nullPolicy, { resourceType: 'Patient' })).toBe(false);

    expect(canWriteResource(wildcardPolicy, { resourceType: 'Patient' })).toBe(true);

    expect(canWriteResource(restrictedPolicy, { resourceType: 'Patient' })).toBe(false);
    expect(canWriteResource(restrictedPolicy, { resourceType: 'Observation' } as Observation)).toBe(true);
    expect(canWriteResource(restrictedPolicy, { resourceType: 'Communication' } as Communication)).toBe(false);
    expect(canWriteResource(restrictedPolicy, { resourceType: 'Communication', status: 'in-progress' })).toBe(true);
    expect(canWriteResource(restrictedPolicy, { resourceType: 'Communication', status: 'completed' })).toBe(false);
  });

  test('satisfiedAccessPolicy()', () => {
    expect(
      satisfiedAccessPolicy({ resourceType: 'Patient' }, AccessPolicyInteraction.UPDATE, nullPolicy)
    ).toBeUndefined();

    expect(
      satisfiedAccessPolicy({ resourceType: 'Patient' }, AccessPolicyInteraction.UPDATE, undefined)?.resourceType
    ).toStrictEqual('*');
    expect(
      satisfiedAccessPolicy({ resourceType: 'Patient' }, AccessPolicyInteraction.UPDATE, wildcardPolicy)?.resourceType
    ).toStrictEqual('*');

    expect(
      satisfiedAccessPolicy({ resourceType: 'Patient' }, AccessPolicyInteraction.UPDATE, restrictedPolicy)
    ).toBeUndefined();
    expect(
      satisfiedAccessPolicy(
        { resourceType: 'Observation' } as Observation,
        AccessPolicyInteraction.UPDATE,
        restrictedPolicy
      )?.resourceType
    ).toStrictEqual('Observation');
    expect(
      satisfiedAccessPolicy(
        { resourceType: 'Communication', status: 'in-progress' },
        AccessPolicyInteraction.UPDATE,
        restrictedPolicy
      )?.criteria
    ).toStrictEqual('Communication?status=in-progress');
    expect(
      satisfiedAccessPolicy(
        { resourceType: 'Communication', status: 'completed' },
        AccessPolicyInteraction.UPDATE,
        restrictedPolicy
      )
    ).toBeUndefined();
    expect(
      satisfiedAccessPolicy(
        { resourceType: 'List', status: 'current', mode: 'working' },
        AccessPolicyInteraction.CREATE,
        restrictedPolicy
      )
    ).toStrictEqual(expect.objectContaining({ resourceType: 'List' }));
    expect(
      satisfiedAccessPolicy(
        { resourceType: 'List', status: 'current', mode: 'working' },
        AccessPolicyInteraction.UPDATE,
        restrictedPolicy
      )
    ).toBeUndefined();
  });

  test('Legacy compartment case', () => {
    // Once upon a time, the recommended way to restrict access to a resource was AccessPolicy.compartment
    // That is now obsolete, becaues you can always use criteria with "_compartment=x"
    // We still hold onto this for backwards compatibility.
    const ap: AccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [
        {
          resourceType: 'Patient',
          compartment: { reference: '1' },
        },
      ],
    };
    expect(
      satisfiedAccessPolicy(
        { resourceType: 'Patient', meta: { compartment: [{ reference: '1' }] } },
        AccessPolicyInteraction.READ,
        ap
      )
    ).toBeDefined();
    expect(
      satisfiedAccessPolicy(
        { resourceType: 'Patient', meta: { compartment: [{ reference: '2' }] } },
        AccessPolicyInteraction.READ,
        ap
      )
    ).toBeUndefined();
  });

  describe('Wildcard criteria', () => {
    function wildcard(criteria: string): AccessPolicy {
      return { resourceType: 'AccessPolicy', resource: [{ resourceType: '*', criteria }] };
    }

    const observationA: Observation = {
      resourceType: 'Observation',
      id: '1b4d3a2e-7c55-4c1f-9e7e-1f2d3c4b5a69',
      status: 'final',
      code: { text: 'test' },
      meta: {
        project: 'project-1',
        compartment: [{ reference: 'Patient/A' }],
        lastUpdated: '2025-06-01T00:00:00.000Z',
        tag: [{ system: 'http://example.com/tag', code: 'shared' }],
        security: [{ system: 'http://example.com/security', code: 'restricted' }],
        profile: ['http://example.com/profile'],
        source: 'http://example.com/source',
      },
    };
    const observationB: Observation = {
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'test' },
      meta: { compartment: [{ reference: 'Patient/B' }], lastUpdated: '2023-06-01T00:00:00.000Z' },
    };
    const organizationA: Organization = {
      resourceType: 'Organization',
      meta: {
        project: 'project-1',
        compartment: [{ reference: 'Patient/A' }],
        lastUpdated: '2025-06-01T00:00:00.000Z',
      },
    };

    test.each([
      '*?_compartment=Patient/A',
      `*?_id=${observationA.id}`,
      '*?_lastUpdated=gt2024-01-01',
      '*?_tag=http://example.com/tag|shared',
      '*?_security=http://example.com/security|restricted',
      '*?_profile=http://example.com/profile',
      '*?_source=http://example.com/source',
      '*?_project=project-1',
    ])('Matches each resource type with %s', (criteria) => {
      const policy = wildcard(criteria);
      for (const interaction of [
        AccessPolicyInteraction.READ,
        AccessPolicyInteraction.CREATE,
        AccessPolicyInteraction.UPDATE,
        AccessPolicyInteraction.DELETE,
      ]) {
        expect(satisfiedAccessPolicy(observationA, interaction, policy)?.criteria).toStrictEqual(criteria);
        expect(satisfiedAccessPolicy(observationB, interaction, policy)).toBeUndefined();
      }
      expect(canWriteResource(policy, observationA)).toBe(true);
      expect(canWriteResource(policy, observationB)).toBe(false);
    });

    test('Compartment criteria', () => {
      const policy = wildcard('*?_compartment=Patient/A');
      expect(canWriteResource(policy, organizationA)).toBe(true);
      expect(canWriteResource(policy, { resourceType: 'Organization' })).toBe(false);
      // Project admin resource types are never covered by a wildcard
      expect(
        canWriteResource(policy, {
          resourceType: 'ProjectMembership',
          meta: { compartment: [{ reference: 'Patient/A' }] },
        } as Resource)
      ).toBe(false);
    });

    test('Parameters the resource type does not define', () => {
      const policy = wildcard('*?status=final');
      expect(canWriteResource(policy, observationA)).toBe(true);
      expect(canWriteResource(policy, organizationA)).toBe(false);

      expect(canWriteResource(wildcard('*?not-a-param=x'), observationA)).toBe(false);
      expect(canWriteResource(wildcard('*?_compartment=Patient/A&not-a-param=x'), observationA)).toBe(false);
    });

    test('Criteria not starting with *? are not rewritten', () => {
      expect(canWriteResource(wildcard('*'), observationA)).toBe(false);
      expect(canWriteResource(wildcard('Organization?_compartment=Patient/A'), observationA)).toBe(false);
    });
  });
});
