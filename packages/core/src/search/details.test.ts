import { readJson } from '@medplum/definitions';
import { Bundle, SearchParameter } from '@medplum/fhirtypes';
import { globalSchema, indexStructureDefinitionBundle } from '../types';
import { getSearchParameterDetails, SearchParameterType } from './details';

const searchParams = readJson('fhir/r4/search-parameters.json');

describe('SearchParameterDetails', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
  });

  test('Get details', () => {
    const individualPhoneticParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'phonetic',
      type: 'string',
      expression: 'Patient.name | Person.name | Practitioner.name | RelatedPerson.name',
    };

    const details = getSearchParameterDetails('Patient', individualPhoneticParam);
    expect(details).toBeDefined();
    expect(details.columnName).toEqual('phonetic');
    expect(details.array).toEqual(true);
  });

  test('Boolean param', () => {
    const activeParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'active',
      type: 'token',
      expression: 'Patient.active',
    };

    const details = getSearchParameterDetails('Patient', activeParam);
    expect(details).toBeDefined();
    expect(details.columnName).toEqual('active');
    expect(details.type).toEqual(SearchParameterType.BOOLEAN);
    expect(details.array).toEqual(false);
  });

  test('Date param', () => {
    const birthDateParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'birthdate',
      type: 'date',
      expression: 'Patient.birthDate',
    };

    const details = getSearchParameterDetails('Patient', birthDateParam);
    expect(details).toBeDefined();
    expect(details.columnName).toEqual('birthdate');
    expect(details.type).toEqual(SearchParameterType.DATE);
    expect(details.array).toEqual(false);
  });

  test('Date/Time param', () => {
    const authoredParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'authored',
      type: 'date',
      expression: 'ServiceRequest.authoredOn',
    };

    const details = getSearchParameterDetails('ServiceRequest', authoredParam);
    expect(details).toBeDefined();
    expect(details.columnName).toEqual('authored');
    expect(details.type).toEqual(SearchParameterType.DATETIME);
    expect(details.array).toEqual(false);
  });

  test('Get nested details', () => {
    const missingExpressionParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'link',
      type: 'reference',
      expression: 'Patient.link.other',
    };

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
    };

    const details = getSearchParameterDetails('Patient', missingExpressionParam);
    expect(details).toBeDefined();
    expect(details.columnName).toEqual('test');
  });

  test('Property not found', () => {
    const missingExpressionParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'test',
      type: 'string',
      expression: 'Patient.unknown',
    };

    expect(() => getSearchParameterDetails('Patient', missingExpressionParam)).toThrow();
  });

  test('Subtype not found', () => {
    const missingExpressionParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'test',
      type: 'string',
      expression: 'Patient.name.unknown',
    };

    expect(() => getSearchParameterDetails('Patient', missingExpressionParam)).toThrow();
  });

  test('Observation-value-quantity', () => {
    const valueQuantityParam: SearchParameter = {
      resourceType: 'SearchParameter',
      id: 'Observation-value-quantity',
      code: 'value-quantity',
      type: 'quantity',
      expression: '(Observation.value as Quantity) | (Observation.value as SampledData)',
    };

    const details = getSearchParameterDetails('Observation', valueQuantityParam);
    expect(details).toBeDefined();
    expect(details.type).toEqual(SearchParameterType.QUANTITY);
    expect(details.columnName).toEqual('valueQuantity');
    expect(details.elementDefinition).toBeDefined();
  });

  test('Encounter-date', () => {
    const clinicalDateParam: SearchParameter = {
      resourceType: 'SearchParameter',
      id: 'clinical-date',
      url: 'http://hl7.org/fhir/SearchParameter/clinical-date',
      name: 'date',
      code: 'date',
      base: [
        'AllergyIntolerance',
        'CarePlan',
        'CareTeam',
        'ClinicalImpression',
        'Composition',
        'Consent',
        'DiagnosticReport',
        'Encounter',
        'EpisodeOfCare',
        'FamilyMemberHistory',
        'Flag',
        'Immunization',
        'List',
        'Observation',
        'Procedure',
        'RiskAssessment',
        'SupplyRequest',
      ],
      type: 'date',
      expression:
        'AllergyIntolerance.recordedDate | CarePlan.period | CareTeam.period | ClinicalImpression.date | Composition.date | Consent.dateTime | DiagnosticReport.effective | Encounter.period | EpisodeOfCare.period | FamilyMemberHistory.date | Flag.period | Immunization.occurrence | List.date | Observation.effective | Procedure.performed | (RiskAssessment.occurrence as dateTime) | SupplyRequest.authoredOn',
      comparator: ['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'sa', 'eb', 'ap'],
    };

    const details = getSearchParameterDetails('Encounter', clinicalDateParam);
    expect(details).toBeDefined();
    expect(details.type).toEqual(SearchParameterType.DATETIME);
    expect(details.columnName).toEqual('date');
    expect(details.elementDefinition).toBeDefined();
  });

  test('Everything', () => {
    // Make sure that getSearchParameterDetails returns successfully for all known parameters.
    for (const resourceType of Object.keys(globalSchema.types)) {
      if (resourceType === 'Resource' || resourceType === 'DomainResource') {
        continue;
      }
      for (const entry of searchParams.entry) {
        const searchParam = entry.resource;
        if (searchParam.base?.includes(resourceType)) {
          const details = getSearchParameterDetails(resourceType, searchParam);
          expect(details).toBeDefined();
        }
      }
    }
  });
});
