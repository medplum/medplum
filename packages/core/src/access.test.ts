import { readJson } from '@medplum/definitions';
import { AccessPolicy, Bundle, SearchParameter } from '@medplum/fhirtypes';
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from './types';
import { canReadResourceType, canWriteResource, canWriteResourceType, matchesAccessPolicy } from './access';

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
    expect(canReadResourceType(wildcardPolicy, 'Patient')).toBe(true);
    expect(canReadResourceType(restrictedPolicy, 'Patient')).toBe(true);
    expect(canReadResourceType(restrictedPolicy, 'Observation')).toBe(true);
    expect(canReadResourceType(restrictedPolicy, 'Practitioner')).toBe(false);
  });

  test('canWriteResourceType', () => {
    expect(canWriteResourceType(wildcardPolicy, 'CapabilityStatement')).toBe(false);
    expect(canWriteResourceType(wildcardPolicy, 'Login')).toBe(false);
    expect(canWriteResourceType(wildcardPolicy, 'Patient')).toBe(true);

    expect(canWriteResourceType(restrictedPolicy, 'CapabilityStatement')).toBe(false);
    expect(canWriteResourceType(restrictedPolicy, 'Login')).toBe(false);
    expect(canWriteResourceType(restrictedPolicy, 'Patient')).toBe(false);
    expect(canWriteResourceType(restrictedPolicy, 'Observation')).toBe(true);
    expect(canWriteResourceType(restrictedPolicy, 'Practitioner')).toBe(false);
    expect(canWriteResourceType(restrictedPolicy, 'Communication')).toBe(true);
  });

  test('canWriteResource', () => {
    expect(canWriteResource(wildcardPolicy, { resourceType: 'Patient' })).toBe(true);
    expect(canWriteResource(restrictedPolicy, { resourceType: 'Patient' })).toBe(false);
    expect(canWriteResource(restrictedPolicy, { resourceType: 'Observation' })).toBe(true);
    expect(canWriteResource(restrictedPolicy, { resourceType: 'Communication' })).toBe(false);
    expect(canWriteResource(restrictedPolicy, { resourceType: 'Communication', status: 'in-progress' })).toBe(true);
    expect(canWriteResource(restrictedPolicy, { resourceType: 'Communication', status: 'completed' })).toBe(false);
  });

  test('Legacy compartment case', () => {
    // Once upon a time, the recommended way to restrict access to a resource was AccessPolicy.compartment
    // That is now obsolete, becaues you can always use criteria with "_compartment=x"
    // We still hold onto this for backwards compatibility.
    const ap: AccessPolicy = { resourceType: 'AccessPolicy', compartment: { reference: '1' } };
    expect(matchesAccessPolicy(ap, { resourceType: 'Patient', meta: { compartment: [{ reference: '1' }] } }, true));
    expect(matchesAccessPolicy(ap, { resourceType: 'Patient', meta: { compartment: [{ reference: '2' }] } }, false));
  });
});
