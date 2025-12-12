import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { globalSchema, indexSearchParameterBundle } from '../types';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import { deriveIdentifierSearchParameter } from './derived';
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
    expect(details.array).toStrictEqual(true);
  });

  test('Boolean param', () => {
    // expression: 'Patient.active'
    const activeParam = searchParams.find((e) => e.id === 'Patient-active') as SearchParameter;
    const details = getSearchParameterDetails('Patient', activeParam);
    expect(details).toBeDefined();
    expect(details.type).toStrictEqual(SearchParameterType.BOOLEAN);
    expect(details.array).toStrictEqual(false);
  });

  test('Date param', () => {
    // expression: 'Patient.birthDate'
    const birthDateParam = searchParams.find((e) => e.id === 'individual-birthdate') as SearchParameter;
    const details = getSearchParameterDetails('Patient', birthDateParam);
    expect(details).toBeDefined();
    expect(details.type).toStrictEqual(SearchParameterType.DATE);
    expect(details.array).toStrictEqual(false);
  });

  test('Date/Time param', () => {
    // expression: 'ServiceRequest.authoredOn'
    const authoredParam = searchParams.find((e) => e.id === 'ServiceRequest-authored') as SearchParameter;
    const details = getSearchParameterDetails('ServiceRequest', authoredParam);
    expect(details).toBeDefined();
    expect(details.type).toStrictEqual(SearchParameterType.DATETIME);
    expect(details.array).toStrictEqual(false);
  });

  test('Get nested details', () => {
    // expression: 'Patient.link.other'
    const missingExpressionParam = searchParams.find((e) => e.id === 'Patient-link') as SearchParameter;
    const details = getSearchParameterDetails('Patient', missingExpressionParam);
    expect(details).toBeDefined();
    expect(details.type).toStrictEqual(SearchParameterType.REFERENCE);
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

  describe('clinical-code', () => {
    // "AllergyIntolerance.code | AllergyIntolerance.reaction.substance | Condition.code | (DeviceRequest.code as CodeableConcept) | DiagnosticReport.code | FamilyMemberHistory.condition.code | List.code | Medication.code | (MedicationAdministration.medication as CodeableConcept) | (MedicationDispense.medication as CodeableConcept) | (MedicationRequest.medication as CodeableConcept) | (MedicationStatement.medication as CodeableConcept) | Observation.code | Procedure.code | ServiceRequest.code"
    const clinicalCodeParam = searchParams.find((e) => e.id === 'clinical-code') as SearchParameter;

    test('AllergyIntolerance', () => {
      const details = getSearchParameterDetails('AllergyIntolerance', clinicalCodeParam);
      expect(details).toBeDefined();
      expect(details.type).toStrictEqual(SearchParameterType.TEXT);
      expect(details.elementDefinitions).toBeDefined();
      expect(details.parsedExpression.toString()).toStrictEqual(
        '(AllergyIntolerance.code | AllergyIntolerance.reaction.substance)'
      );
    });

    test('Observation', () => {
      const details = getSearchParameterDetails('Observation', clinicalCodeParam);
      expect(details).toBeDefined();
      expect(details.type).toStrictEqual(SearchParameterType.TEXT);
      expect(details.elementDefinitions).toBeDefined();
      expect(details.parsedExpression.toString()).toStrictEqual('Observation.code');
    });
  });

  describe('individual-phone', () => {
    // "Patient.telecom.where(system='phone') | Person.telecom.where(system='phone') | Practitioner.telecom.where(system='phone') | PractitionerRole.telecom.where(system='phone') | RelatedPerson.telecom.where(system='phone')"
    const individualPhoneParam = searchParams.find((e) => e.id === 'individual-phone') as SearchParameter;

    test('Patient', () => {
      const details = getSearchParameterDetails('Patient', individualPhoneParam);
      expect(details).toBeDefined();
      expect(details.type).toStrictEqual(SearchParameterType.TEXT);
      expect(details.elementDefinitions).toBeDefined();
      expect(details.parsedExpression.toString()).toStrictEqual("Patient.telecom.where((system = 'phone'))");
    });

    test('RelatedPerson', () => {
      const details = getSearchParameterDetails('RelatedPerson', individualPhoneParam);
      expect(details).toBeDefined();
      expect(details.type).toStrictEqual(SearchParameterType.TEXT);
      expect(details.elementDefinitions).toBeDefined();
      expect(details.parsedExpression.toString()).toStrictEqual("RelatedPerson.telecom.where((system = 'phone'))");
    });
  });

  test('Observation-value-date', () => {
    // "(Observation.value as dateTime) | (Observation.value as Period)"
    const valueDateParam = searchParams.find((e) => e.id === 'Observation-value-date') as SearchParameter;
    const details = getSearchParameterDetails('Observation', valueDateParam);
    expect(details).toBeDefined();
    expect(details.type).toStrictEqual(SearchParameterType.DATETIME);
    expect(details.elementDefinitions).toBeDefined();
    expect(details.parsedExpression.toString()).toStrictEqual(
      '((Observation.value as dateTime) | (Observation.value as Period))'
    );
  });

  test('Observation-value-quantity', () => {
    // expression: '(Observation.value as Quantity) | (Observation.value as SampledData)',
    const valueQuantityParam = searchParams.find((e) => e.id === 'Observation-value-quantity') as SearchParameter;
    const details = getSearchParameterDetails('Observation', valueQuantityParam);
    expect(details).toBeDefined();
    expect(details.type).toStrictEqual(SearchParameterType.QUANTITY);
    expect(details.elementDefinitions).toBeDefined();
    expect(details.parsedExpression.toString()).toStrictEqual(
      '((Observation.value as Quantity) | (Observation.value as SampledData))'
    );
  });

  test('Encounter-date', () => {
    // expression: 'AllergyIntolerance.recordedDate | CarePlan.period | CareTeam.period | ClinicalImpression.date | Composition.date | Consent.dateTime | DiagnosticReport.effective | Encounter.period | EpisodeOfCare.period | FamilyMemberHistory.date | Flag.period | Immunization.occurrence | List.date | Observation.effective | Procedure.performed | (RiskAssessment.occurrence as dateTime) | SupplyRequest.authoredOn',
    const clinicalDateParam = searchParams.find((e) => e.id === 'clinical-date') as SearchParameter;
    const details = getSearchParameterDetails('Encounter', clinicalDateParam);
    expect(details).toBeDefined();
    expect(details.type).toStrictEqual(SearchParameterType.DATETIME);
    expect(details.elementDefinitions).toBeDefined();
    expect(details.parsedExpression.toString()).toStrictEqual('Encounter.period');
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
    expect(details.type).toStrictEqual(SearchParameterType.TEXT);
    expect(details.elementDefinitions).toStrictEqual([]);
  });

  test('us-core-patient-gender-identity', () => {
    const searchParam = searchParams.find((e) => e.id === 'us-core-patient-gender-identity') as SearchParameter;
    const details = getSearchParameterDetails('Patient', searchParam);
    expect(details).toBeDefined();
    expect(details.array).toBe(true);
    expect(details.type).toStrictEqual(SearchParameterType.TEXT);
    expect(details.elementDefinitions).toStrictEqual([]);
  });

  test('EvidenceVariable-characteristic-type', () => {
    const searchParam = searchParams.find((e) => e.id === 'EvidenceVariable-characteristic-type') as SearchParameter;
    const details = getSearchParameterDetails('EvidenceVariable', searchParam);
    expect(details).toBeDefined();
    expect(details.array).toBe(true);
    expect(details.type).toStrictEqual(SearchParameterType.TEXT);
  });

  test('CodeSystem-context', () => {
    const searchParam = searchParams.find((e) => e.id === 'conformance-context') as SearchParameter;
    const details = getSearchParameterDetails('CodeSystem', searchParam);
    expect(details).toBeDefined();
    expect(details.elementDefinitions).toBeDefined();
    expect(details.elementDefinitions?.length).toBe(1);
  });

  test('Optimized derived reference identifier search parameter', () => {
    const patientRefParam = searchParams.find((e) => e.id === 'clinical-patient') as SearchParameter;
    expect(patientRefParam).toBeDefined();
    expect(
      patientRefParam.expression?.startsWith(
        'AllergyIntolerance.patient | CarePlan.subject.where(resolve() is Patient)'
      )
    ).toBe(true);

    // search parameter details should strip down to the expression only relevant to Observation
    const derivedParam = deriveIdentifierSearchParameter(patientRefParam);
    expect(
      derivedParam.expression?.startsWith('(AllergyIntolerance.patient | CarePlan.subject.where(resolve() is Patient)')
    ).toBe(true);
    const details = getSearchParameterDetails('Observation', derivedParam);
    expect(details).toBeDefined();
    expect(details.type).toStrictEqual(SearchParameterType.TEXT);
    expect(details.elementDefinitions).toBeDefined();
    expect(details.parsedExpression.toString()).toStrictEqual(
      'Observation.subject.where((resolve() is Patient)).identifier'
    );
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
