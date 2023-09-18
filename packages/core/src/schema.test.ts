import { readJson } from '@medplum/definitions';
import { Bundle } from '@medplum/fhirtypes';
import { validateResourceType } from './schema';
import { indexStructureDefinitionBundle } from './typeschema/types';

describe('FHIR schema', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
  });

  test('validateResourceType', () => {
    // Valid FHIR resource types
    expect(() => validateResourceType('Observation')).not.toThrow();
    expect(() => validateResourceType('Patient')).not.toThrow();
    expect(() => validateResourceType('ServiceRequest')).not.toThrow();

    // Custom Medplum resource types
    expect(() => validateResourceType('Login')).not.toThrow();
    expect(() => validateResourceType('User')).not.toThrow();
    expect(() => validateResourceType('Project')).not.toThrow();

    // Invalid types
    expect(() => validateResourceType('')).toThrow();
    expect(() => validateResourceType('instant')).toThrow();
    expect(() => validateResourceType('FakeResource')).toThrow();
    expect(() => validateResourceType('PatientCommunication')).toThrow();
    expect(() => validateResourceType('Patient_Communication')).toThrow();
  });
});
