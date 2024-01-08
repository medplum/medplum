import { readJson } from '@medplum/definitions';
import { Bundle, OperationOutcomeIssue } from '@medplum/fhirtypes';
import { checkForNull, validateResourceType } from './schema';
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

  test('checkForNull', () => {
    function helper(input: unknown): void {
      const issues = [] as OperationOutcomeIssue[];
      checkForNull(input, '', issues);
      if (issues.length > 0) {
        throw new Error();
      }
    }

    expect(() => helper(undefined)).not.toThrow();
    expect(() => helper(null)).toThrow();
    expect(() => helper('')).not.toThrow();
    expect(() => helper('test')).not.toThrow();
    expect(() => helper({ foo: 'bar' })).not.toThrow();
    expect(() => helper({ foo: null })).toThrow();
    expect(() => helper({ foo: { bar: null } })).toThrow();
    expect(() => helper(['x', 'y'])).not.toThrow();
    expect(() => helper(['x', 'y', null])).toThrow();
    expect(() => helper(['x', 'y', undefined])).toThrow();
  });
});
