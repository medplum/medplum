import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import {
  ColumnSearchParameterImplementation,
  getSearchParameterImplementation,
  globalSearchParameterRegistry,
  LookupTableSearchParameterImplementation,
  SearchParameterImplementation,
  SearchStrategies,
  TokenColumnSearchParameterImplementation,
} from './searchparameter';
import { AddressTable } from './lookups/address';
import { HumanNameTable } from './lookups/humanname';

describe('SearchParameterImplementation', () => {
  const indexedSearchParams: SearchParameter[] = [];

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      const bundle = readJson(filename) as Bundle<SearchParameter>;
      indexSearchParameterBundle(bundle);
      for (const entry of bundle.entry as BundleEntry[]) {
        indexedSearchParams.push(entry.resource as SearchParameter);
      }
    }
  });

  test('Get impl', () => {
    // expression: 'Patient.name | Person.name | Practitioner.name | RelatedPerson.name'
    const individualPhoneticParam = indexedSearchParams.find((e) => e.id === 'individual-phonetic') as SearchParameter;
    const impl = getSearchParameterImplementation('Patient', individualPhoneticParam);
    assertColumnImplementation(impl);
    expect(impl.columnName).toStrictEqual('phonetic');
  });

  test('Boolean param', () => {
    // expression: 'Patient.active'
    const activeParam = indexedSearchParams.find((e) => e.id === 'Patient-active') as SearchParameter;
    const impl = getSearchParameterImplementation('Patient', activeParam);
    assertColumnImplementation(impl);
    expect(impl.columnName).toStrictEqual('active');
  });

  test('Date param', () => {
    // expression: 'Patient.birthDate'
    const birthDateParam = indexedSearchParams.find((e) => e.id === 'individual-birthdate') as SearchParameter;
    const impl = getSearchParameterImplementation('Patient', birthDateParam);
    assertColumnImplementation(impl);
    expect(impl.columnName).toStrictEqual('birthdate');
  });

  test('Date/Time param', () => {
    // expression: 'ServiceRequest.authoredOn'
    const authoredParam = indexedSearchParams.find((e) => e.id === 'ServiceRequest-authored') as SearchParameter;
    const impl = getSearchParameterImplementation('ServiceRequest', authoredParam);
    assertColumnImplementation(impl);
    expect(impl.columnName).toStrictEqual('authored');
  });

  test('Get nested impl', () => {
    // expression: 'Patient.link.other'
    const missingExpressionParam = indexedSearchParams.find((e) => e.id === 'Patient-link') as SearchParameter;
    const impl = getSearchParameterImplementation('Patient', missingExpressionParam);
    assertColumnImplementation(impl);
    expect(impl.columnName).toStrictEqual('link');
  });

  test('Missing expression for resource type', () => {
    const missingExpressionParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'test',
      type: 'string',
      expression: 'OtherType.test',
      base: ['Patient'],
    } as SearchParameter;

    const impl = getSearchParameterImplementation('Patient', missingExpressionParam);
    assertColumnImplementation(impl);
    expect(impl.columnName).toStrictEqual('test');
  });

  test('Property not found', () => {
    const missingExpressionParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'unknown',
      type: 'string',
      expression: 'Patient.unknown',
    } as SearchParameter;

    expect(() => getSearchParameterImplementation('Patient', missingExpressionParam)).toThrow();
  });

  test('Subtype not found', () => {
    const missingExpressionParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'name-unknown',
      type: 'string',
      expression: 'Patient.name.select()',
    } as SearchParameter;

    expect(() => getSearchParameterImplementation('Patient', missingExpressionParam)).toThrow();
  });

  test('Unhandled function', () => {
    const missingExpressionParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'unhandled-function',
      type: 'string',
      expression: 'Patient.name.unknown',
    } as SearchParameter;

    expect(() => getSearchParameterImplementation('Patient', missingExpressionParam)).toThrow();
  });

  test('Observation-value-date', () => {
    // expression: '(Observation.value as dateTime) | (Observation.value as Period)',
    const valueDateParam = indexedSearchParams.find((e) => e.id === 'Observation-value-date') as SearchParameter;
    const impl = getSearchParameterImplementation('Observation', valueDateParam);
    assertColumnImplementation(impl);
    expect(impl.columnName).toStrictEqual('valueDate');
  });

  test('Observation-value-quantity', () => {
    // expression: '(Observation.value as Quantity) | (Observation.value as SampledData)',
    const valueQuantityParam = indexedSearchParams.find(
      (e) => e.id === 'Observation-value-quantity'
    ) as SearchParameter;
    const impl = getSearchParameterImplementation('Observation', valueQuantityParam);
    assertColumnImplementation(impl);
    expect(impl.columnName).toStrictEqual('valueQuantity');
  });

  test('Encounter-date', () => {
    // expression: 'AllergyIntolerance.recordedDate | CarePlan.period | CareTeam.period | ClinicalImpression.date | Composition.date | Consent.dateTime | DiagnosticReport.effective | Encounter.period | EpisodeOfCare.period | FamilyMemberHistory.date | Flag.period | Immunization.occurrence | List.date | Observation.effective | Procedure.performed | (RiskAssessment.occurrence as dateTime) | SupplyRequest.authoredOn',
    const clinicalDateParam = indexedSearchParams.find((e) => e.id === 'clinical-date') as SearchParameter;
    const impl = getSearchParameterImplementation('Encounter', clinicalDateParam);
    assertColumnImplementation(impl);
    expect(impl.columnName).toStrictEqual('date');
  });

  test('Bundle-composition', () => {
    // expression: 'Bundle.entry[0].resource',
    const searchParam = indexedSearchParams.find((e) => e.id === 'Bundle-composition') as SearchParameter;
    const impl = getSearchParameterImplementation('Bundle', searchParam);
    assertColumnImplementation(impl);
    expect(impl.columnName).toStrictEqual('composition');
  });

  test('ProjectMembership-profile-type', () => {
    // expression: 'ProjectMembership.profile.resolve().resourceType',
    const searchParam = indexedSearchParams.find((e) => e.id === 'ProjectMembership-profile-type') as SearchParameter;
    const impl = getSearchParameterImplementation('ProjectMembership', searchParam);
    assertColumnImplementation(impl);
    expect(impl.columnName).toStrictEqual('profileType');
  });

  test('ProjectMembership-access-policy', () => {
    const searchParam: SearchParameter = {
      resourceType: 'SearchParameter',
      id: 'ProjectMembership-access-policy',
      url: 'https://medplum.com/fhir/SearchParameter/ProjectMembership-access-policy',
      version: '4.0.1',
      name: 'access-policy',
      status: 'draft',
      publisher: 'Medplum',
      description: 'The access policy of the user',
      code: 'access-policy',
      base: ['ProjectMembership'],
      type: 'reference',
      expression: 'ProjectMembership.accessPolicy | ProjectMembership.access.policy',
      target: ['AccessPolicy'],
    };
    const impl = getSearchParameterImplementation('ProjectMembership', searchParam);
    assertColumnImplementation(impl);
    expect(impl.columnName).toStrictEqual('accessPolicy');
  });

  test('Account-patient', () => {
    // expression: 'Account.subject.where(resolve() is Patient)',
    const searchParam = indexedSearchParams.find((e) => e.id === 'Account-patient') as SearchParameter;
    const impl = getSearchParameterImplementation('Account', searchParam);
    assertColumnImplementation(impl);
    expect(impl.columnName).toStrictEqual('patient');
  });

  test('ActivityDefinition-composed-of', () => {
    // expression: 'Account.subject.where(resolve() is Patient)',
    const searchParam = indexedSearchParams.find((e) => e.id === 'ActivityDefinition-composed-of') as SearchParameter;
    const impl = getSearchParameterImplementation('ActivityDefinition', searchParam);
    assertColumnImplementation(impl);
    expect(impl.columnName).toStrictEqual('composedOf');
  });

  test('Patient-deceased', () => {
    // expression: 'Patient.deceased.exists() and Patient.deceased != false',
    const searchParam = indexedSearchParams.find((e) => e.id === 'Patient-deceased') as SearchParameter;
    const impl = getSearchParameterImplementation('Patient', searchParam);
    assertColumnImplementation(impl);
    expect(impl.columnName).toStrictEqual('deceased');
  });

  test('us-core-condition-asserted-date', () => {
    const searchParam = indexedSearchParams.find((e) => e.id === 'us-core-condition-asserted-date') as SearchParameter;
    const impl = getSearchParameterImplementation('Condition', searchParam);
    assertColumnImplementation(impl);
    expect(impl.columnName).toStrictEqual('assertedDate');
  });

  test('us-core-ethnicity', () => {
    const searchParam = indexedSearchParams.find((e) => e.id === 'us-core-ethnicity') as SearchParameter;
    const impl = getSearchParameterImplementation('Patient', searchParam);
    assertColumnImplementation(impl);
    expect(impl.columnName).toStrictEqual('ethnicity');
  });

  test('us-core-patient-gender-identity', () => {
    const searchParam = indexedSearchParams.find((e) => e.id === 'us-core-patient-gender-identity') as SearchParameter;
    const impl = getSearchParameterImplementation('Patient', searchParam);
    assertColumnImplementation(impl);
    expect(impl.columnName).toStrictEqual('genderIdentity');
  });

  test('EvidenceVariable-characteristic-type', () => {
    const searchParam = indexedSearchParams.find(
      (e) => e.id === 'EvidenceVariable-characteristic-type'
    ) as SearchParameter;
    const impl = getSearchParameterImplementation('EvidenceVariable', searchParam);
    expectTokenColumnImplementation(impl);
  });

  test.each([['Patient-identifier'], ['Patient-language']])(
    'token column for SearchParameter %s on Patient',
    (searchParamId) => {
      const resourceType = 'Patient';
      const searchParam = indexedSearchParams.find((e) => e.id === searchParamId) as SearchParameter;
      const impl = getSearchParameterImplementation(resourceType, searchParam);
      expectTokenColumnImplementation(impl);
    }
  );

  test.each([
    ['individual-address-country', AddressTable],
    ['Patient-name', HumanNameTable],
  ])('lookup table for SearchParameter %s on Patient', (searchParamId, lookupTableClass) => {
    const resourceType = 'Patient';
    const searchParam = indexedSearchParams.find((e) => e.id === searchParamId) as SearchParameter;
    const impl = getSearchParameterImplementation(resourceType, searchParam);
    expectLookupTableImplementation(impl);
    expect(impl.lookupTable instanceof lookupTableClass).toBeTruthy();
  });

  test('Everything', () => {
    // Make sure that getSearchParameterImplementation returns successfully for all known parameters.
    for (const resourceType of Object.keys(globalSearchParameterRegistry.types)) {
      for (const searchParam of indexedSearchParams) {
        if (searchParam.base?.includes(resourceType as ResourceType)) {
          const impl = getSearchParameterImplementation(resourceType, searchParam);
          expect(impl).toBeDefined();
        }
      }
    }
  });
});

function assertColumnImplementation(
  impl: SearchParameterImplementation | undefined
): asserts impl is ColumnSearchParameterImplementation {
  expect(impl).toBeDefined();
  expect(impl?.searchStrategy).toBe(SearchStrategies.COLUMN);
}

function expectLookupTableImplementation(
  impl: SearchParameterImplementation | undefined
): asserts impl is LookupTableSearchParameterImplementation {
  expect(impl).toBeDefined();
  expect(impl?.searchStrategy).toBe(SearchStrategies.LOOKUP_TABLE);
}

function expectTokenColumnImplementation(
  impl: SearchParameterImplementation | undefined
): asserts impl is TokenColumnSearchParameterImplementation {
  expect(impl).toBeDefined();
  expect(impl?.searchStrategy).toBe(SearchStrategies.TOKEN_COLUMN);
}
