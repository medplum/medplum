import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { globalSchema, indexSearchParameterBundle } from '../types';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import { SearchParameterType, getSearchParameterDetails } from './details';

const searchParams: SearchParameter[] = [];
const searchParameterBundles: Bundle<SearchParameter>[] = [];

for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
  const bundle = readJson(filename) as Bundle<SearchParameter>;
  searchParameterBundles.push(bundle);
  for (const entry of bundle.entry as BundleEntry[]) {
    searchParams.push(entry.resource as SearchParameter);
  }
}

describe('SearchParameterDetails', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    for (const bundle of searchParameterBundles) {
      indexSearchParameterBundle(bundle);
    }
  });

  test('Get details', () => {
    // expression: 'Patient.name | Person.name | Practitioner.name | RelatedPerson.name'
    const individualPhoneticParam = searchParams.find((e) => e.id === 'individual-phonetic') as SearchParameter;
    const details = getSearchParameterDetails('Patient', individualPhoneticParam);
    expect(details).toBeDefined();
    expect(details.columnName).toEqual('phonetic');
    expect(details.array).toEqual(true);
  });

  test('Boolean param', () => {
    // expression: 'Patient.active'
    const activeParam = searchParams.find((e) => e.id === 'Patient-active') as SearchParameter;
    const details = getSearchParameterDetails('Patient', activeParam);
    expect(details).toBeDefined();
    expect(details.columnName).toEqual('active');
    expect(details.type).toEqual(SearchParameterType.BOOLEAN);
    expect(details.array).toEqual(false);
  });

  test('Date param', () => {
    // expression: 'Patient.birthDate'
    const birthDateParam = searchParams.find((e) => e.id === 'individual-birthdate') as SearchParameter;
    const details = getSearchParameterDetails('Patient', birthDateParam);
    expect(details).toBeDefined();
    expect(details.columnName).toEqual('birthdate');
    expect(details.type).toEqual(SearchParameterType.DATE);
    expect(details.array).toEqual(false);
  });

  test('Date/Time param', () => {
    // expression: 'ServiceRequest.authoredOn'
    const authoredParam = searchParams.find((e) => e.id === 'ServiceRequest-authored') as SearchParameter;
    const details = getSearchParameterDetails('ServiceRequest', authoredParam);
    expect(details).toBeDefined();
    expect(details.columnName).toEqual('authored');
    expect(details.type).toEqual(SearchParameterType.DATETIME);
    expect(details.array).toEqual(false);
  });

  test('Get nested details', () => {
    // expression: 'Patient.link.other'
    const missingExpressionParam = searchParams.find((e) => e.id === 'Patient-link') as SearchParameter;
    const details = getSearchParameterDetails('Patient', missingExpressionParam);
    expect(details).toBeDefined();
    expect(details.columnName).toEqual('link');
    expect(details.type).toEqual(SearchParameterType.REFERENCE);
  });

  test('Missing expression for resource type', () => {
    const missingExpressionParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'test',
      type: 'string',
      expression: 'OtherType.test',
    } as SearchParameter;

    const details = getSearchParameterDetails('Patient', missingExpressionParam);
    expect(details).toBeDefined();
    expect(details.columnName).toEqual('test');
  });

  test('Property not found', () => {
    const missingExpressionParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'unknown',
      type: 'string',
      expression: 'Patient.unknown',
    } as SearchParameter;

    expect(() => getSearchParameterDetails('Patient', missingExpressionParam)).toThrow();
  });

  test('Subtype not found', () => {
    const missingExpressionParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'name-unknown',
      type: 'string',
      expression: 'Patient.name.select()',
    } as SearchParameter;

    expect(() => getSearchParameterDetails('Patient', missingExpressionParam)).toThrow();
  });

  test('Unhandled function', () => {
    const missingExpressionParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'unhandled-function',
      type: 'string',
      expression: 'Patient.name.unknown',
    } as SearchParameter;

    expect(() => getSearchParameterDetails('Patient', missingExpressionParam)).toThrow();
  });

  test('Observation-value-date', () => {
    // expression: '(Observation.value as dateTime) | (Observation.value as Period)',
    const valueDateParam = searchParams.find((e) => e.id === 'Observation-value-date') as SearchParameter;
    const details = getSearchParameterDetails('Observation', valueDateParam);
    expect(details).toBeDefined();
    expect(details.type).toEqual(SearchParameterType.DATETIME);
    expect(details.columnName).toEqual('valueDate');
    expect(details.elementDefinitions).toBeDefined();
  });

  test('Observation-value-quantity', () => {
    // expression: '(Observation.value as Quantity) | (Observation.value as SampledData)',
    const valueQuantityParam = searchParams.find((e) => e.id === 'Observation-value-quantity') as SearchParameter;
    const details = getSearchParameterDetails('Observation', valueQuantityParam);
    expect(details).toBeDefined();
    expect(details.type).toEqual(SearchParameterType.QUANTITY);
    expect(details.columnName).toEqual('valueQuantity');
    expect(details.elementDefinitions).toBeDefined();
  });

  test('Encounter-date', () => {
    // expression: 'AllergyIntolerance.recordedDate | CarePlan.period | CareTeam.period | ClinicalImpression.date | Composition.date | Consent.dateTime | DiagnosticReport.effective | Encounter.period | EpisodeOfCare.period | FamilyMemberHistory.date | Flag.period | Immunization.occurrence | List.date | Observation.effective | Procedure.performed | (RiskAssessment.occurrence as dateTime) | SupplyRequest.authoredOn',
    const clinicalDateParam = searchParams.find((e) => e.id === 'clinical-date') as SearchParameter;
    const details = getSearchParameterDetails('Encounter', clinicalDateParam);
    expect(details).toBeDefined();
    expect(details.type).toEqual(SearchParameterType.DATETIME);
    expect(details.columnName).toEqual('date');
    expect(details.elementDefinitions).toBeDefined();
  });

  test('Bundle-composition', () => {
    // expression: 'Bundle.entry[0].resource',
    const searchParam = searchParams.find((e) => e.id === 'Bundle-composition') as SearchParameter;
    const details = getSearchParameterDetails('Bundle', searchParam);
    expect(details).toBeDefined();
    expect(details.array).toBe(false);
  });

  test('ProjectMembership-profile-type', () => {
    // expression: 'ProjectMembership.profile.resolve().resourceType',
    const searchParam = searchParams.find((e) => e.id === 'ProjectMembership-profile-type') as SearchParameter;
    const details = getSearchParameterDetails('ProjectMembership', searchParam);
    expect(details).toBeDefined();
    expect(details.array).toBe(false);
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
    const details = getSearchParameterDetails('ProjectMembership', searchParam);
    expect(details).toBeDefined();
    expect(details.array).toBe(true);
  });

  test('Account-patient', () => {
    // expression: 'Account.subject.where(resolve() is Patient)',
    const searchParam = searchParams.find((e) => e.id === 'Account-patient') as SearchParameter;
    const details = getSearchParameterDetails('Account', searchParam);
    expect(details).toBeDefined();
    expect(details.array).toBe(true);
  });

  test('ActivityDefinition-composed-of', () => {
    // expression: 'Account.subject.where(resolve() is Patient)',
    const searchParam = searchParams.find((e) => e.id === 'ActivityDefinition-composed-of') as SearchParameter;
    const details = getSearchParameterDetails('ActivityDefinition', searchParam);
    expect(details).toBeDefined();
    expect(details.array).toBe(true);
  });

  test('Patient-deceased', () => {
    // expression: 'Patient.deceased.exists() and Patient.deceased != false',
    const searchParam = searchParams.find((e) => e.id === 'Patient-deceased') as SearchParameter;
    const details = getSearchParameterDetails('Patient', searchParam);
    expect(details).toBeDefined();
    expect(details.array).toBe(false);
  });

  test('us-core-condition-asserted-date', () => {
    const searchParam = searchParams.find((e) => e.id === 'us-core-condition-asserted-date') as SearchParameter;
    const details = getSearchParameterDetails('Condition', searchParam);
    expect(details).toBeDefined();
    expect(details.array).toBe(false);
  });

  test('us-core-ethnicity', () => {
    const searchParam = searchParams.find((e) => e.id === 'us-core-ethnicity') as SearchParameter;
    const details = getSearchParameterDetails('Patient', searchParam);
    expect(details).toBeDefined();
    expect(details.array).toBe(true);
    expect(details.type).toEqual(SearchParameterType.TEXT);
    expect(details.elementDefinitions).toEqual([]);
  });

  test('us-core-patient-gender-identity', () => {
    const searchParam = searchParams.find((e) => e.id === 'us-core-patient-gender-identity') as SearchParameter;
    const details = getSearchParameterDetails('Patient', searchParam);
    expect(details).toBeDefined();
    expect(details.array).toBe(true);
    expect(details.type).toEqual(SearchParameterType.TEXT);
    expect(details.elementDefinitions).toEqual([]);
  });

  test('Everything', () => {
    // Make sure that getSearchParameterDetails returns successfully for all known parameters.
    for (const resourceType of Object.keys(globalSchema.types)) {
      if (resourceType === 'Resource' || resourceType === 'DomainResource') {
        continue;
      }
      for (const searchParam of searchParams) {
        if (searchParam.base?.includes(resourceType as ResourceType)) {
          const details = getSearchParameterDetails(resourceType, searchParam);
          expect(details).toBeDefined();
        }
      }
    }
  });
});
