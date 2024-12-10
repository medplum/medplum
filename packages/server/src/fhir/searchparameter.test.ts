import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { getSearchParameterImplementation, globalSearchParameterRegistry } from './searchparameter';

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
    expect(impl).toBeDefined();
    expect(impl.columnName).toStrictEqual('phonetic');
  });

  test('Boolean param', () => {
    // expression: 'Patient.active'
    const activeParam = indexedSearchParams.find((e) => e.id === 'Patient-active') as SearchParameter;
    const impl = getSearchParameterImplementation('Patient', activeParam);
    expect(impl).toBeDefined();
    expect(impl.columnName).toStrictEqual('active');
  });

  test('Date param', () => {
    // expression: 'Patient.birthDate'
    const birthDateParam = indexedSearchParams.find((e) => e.id === 'individual-birthdate') as SearchParameter;
    const impl = getSearchParameterImplementation('Patient', birthDateParam);
    expect(impl).toBeDefined();
    expect(impl.columnName).toStrictEqual('birthdate');
  });

  test('Date/Time param', () => {
    // expression: 'ServiceRequest.authoredOn'
    const authoredParam = indexedSearchParams.find((e) => e.id === 'ServiceRequest-authored') as SearchParameter;
    const impl = getSearchParameterImplementation('ServiceRequest', authoredParam);
    expect(impl).toBeDefined();
    expect(impl.columnName).toStrictEqual('authored');
  });

  test('Get nested impl', () => {
    // expression: 'Patient.link.other'
    const missingExpressionParam = indexedSearchParams.find((e) => e.id === 'Patient-link') as SearchParameter;
    const impl = getSearchParameterImplementation('Patient', missingExpressionParam);
    expect(impl).toBeDefined();
    expect(impl.columnName).toStrictEqual('link');
  });

  test('Missing expression for resource type', () => {
    const missingExpressionParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'test',
      type: 'string',
      expression: 'OtherType.test',
    } as SearchParameter;

    const impl = getSearchParameterImplementation('Patient', missingExpressionParam);
    expect(impl).toBeDefined();
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
    expect(impl).toBeDefined();
    expect(impl.columnName).toStrictEqual('valueDate');
  });

  test('Observation-value-quantity', () => {
    // expression: '(Observation.value as Quantity) | (Observation.value as SampledData)',
    const valueQuantityParam = indexedSearchParams.find(
      (e) => e.id === 'Observation-value-quantity'
    ) as SearchParameter;
    const impl = getSearchParameterImplementation('Observation', valueQuantityParam);
    expect(impl).toBeDefined();
    expect(impl.columnName).toStrictEqual('valueQuantity');
  });

  test('Encounter-date', () => {
    // expression: 'AllergyIntolerance.recordedDate | CarePlan.period | CareTeam.period | ClinicalImpression.date | Composition.date | Consent.dateTime | DiagnosticReport.effective | Encounter.period | EpisodeOfCare.period | FamilyMemberHistory.date | Flag.period | Immunization.occurrence | List.date | Observation.effective | Procedure.performed | (RiskAssessment.occurrence as dateTime) | SupplyRequest.authoredOn',
    const clinicalDateParam = indexedSearchParams.find((e) => e.id === 'clinical-date') as SearchParameter;
    const impl = getSearchParameterImplementation('Encounter', clinicalDateParam);
    expect(impl).toBeDefined();
    expect(impl.columnName).toStrictEqual('date');
  });

  test('Bundle-composition', () => {
    // expression: 'Bundle.entry[0].resource',
    const searchParam = indexedSearchParams.find((e) => e.id === 'Bundle-composition') as SearchParameter;
    const impl = getSearchParameterImplementation('Bundle', searchParam);
    expect(impl).toBeDefined();
  });

  test('ProjectMembership-profile-type', () => {
    // expression: 'ProjectMembership.profile.resolve().resourceType',
    const searchParam = indexedSearchParams.find((e) => e.id === 'ProjectMembership-profile-type') as SearchParameter;
    const impl = getSearchParameterImplementation('ProjectMembership', searchParam);
    expect(impl).toBeDefined();
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
    expect(impl).toBeDefined();
  });

  test('Account-patient', () => {
    // expression: 'Account.subject.where(resolve() is Patient)',
    const searchParam = indexedSearchParams.find((e) => e.id === 'Account-patient') as SearchParameter;
    const impl = getSearchParameterImplementation('Account', searchParam);
    expect(impl).toBeDefined();
  });

  test('ActivityDefinition-composed-of', () => {
    // expression: 'Account.subject.where(resolve() is Patient)',
    const searchParam = indexedSearchParams.find((e) => e.id === 'ActivityDefinition-composed-of') as SearchParameter;
    const impl = getSearchParameterImplementation('ActivityDefinition', searchParam);
    expect(impl).toBeDefined();
  });

  test('Patient-deceased', () => {
    // expression: 'Patient.deceased.exists() and Patient.deceased != false',
    const searchParam = indexedSearchParams.find((e) => e.id === 'Patient-deceased') as SearchParameter;
    const impl = getSearchParameterImplementation('Patient', searchParam);
    expect(impl).toBeDefined();
  });

  test('us-core-condition-asserted-date', () => {
    const searchParam = indexedSearchParams.find((e) => e.id === 'us-core-condition-asserted-date') as SearchParameter;
    const impl = getSearchParameterImplementation('Condition', searchParam);
    expect(impl).toBeDefined();
  });

  test('us-core-ethnicity', () => {
    const searchParam = indexedSearchParams.find((e) => e.id === 'us-core-ethnicity') as SearchParameter;
    const impl = getSearchParameterImplementation('Patient', searchParam);
    expect(impl).toBeDefined();
  });

  test('us-core-patient-gender-identity', () => {
    const searchParam = indexedSearchParams.find((e) => e.id === 'us-core-patient-gender-identity') as SearchParameter;
    const impl = getSearchParameterImplementation('Patient', searchParam);
    expect(impl).toBeDefined();
  });

  test('EvidenceVariable-characteristic-type', () => {
    const searchParam = indexedSearchParams.find(
      (e) => e.id === 'EvidenceVariable-characteristic-type'
    ) as SearchParameter;
    const impl = getSearchParameterImplementation('EvidenceVariable', searchParam);
    expect(impl).toBeDefined();
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
