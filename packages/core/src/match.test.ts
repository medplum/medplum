import { readJson } from '@medplum/definitions';
import { Bundle, Observation, Patient, SearchParameter } from '@medplum/fhirtypes';
import { matchesSearchRequest } from './match';
import { Operator } from './search';
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from './types';

// Dimensions:
// 1. Search parameter type
// 2. Underlying data type
// 3. Modifiers
// 4. Prefixes
// 5. Success or failure

describe('Search matching', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  });

  test('Matches resource type', () => {
    expect(matchesSearchRequest({ resourceType: 'Observation' }, { resourceType: 'Observation' })).toBe(true);
    expect(matchesSearchRequest({ resourceType: 'Patient' }, { resourceType: 'Patient' })).toBe(true);
    expect(matchesSearchRequest({ resourceType: 'Observation' }, { resourceType: 'Patient' })).toBe(false);
    expect(matchesSearchRequest({ resourceType: 'Patient' }, { resourceType: 'Observation' })).toBe(false);
  });

  test('Unknown filter', () => {
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient' },
        { resourceType: 'Patient', filters: [{ code: 'unknown', operator: Operator.EQUALS, value: 'xyz' }] }
      )
    ).toBe(false);
  });

  test('Boolean filter', () => {
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient', active: true },
        { resourceType: 'Patient', filters: [{ code: 'active', operator: Operator.EQUALS, value: 'true' }] }
      )
    ).toBe(true);
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient', active: false },
        { resourceType: 'Patient', filters: [{ code: 'active', operator: Operator.EQUALS, value: 'false' }] }
      )
    ).toBe(true);
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient', active: true },
        { resourceType: 'Patient', filters: [{ code: 'active', operator: Operator.EQUALS, value: 'false' }] }
      )
    ).toBe(false);
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient', active: false },
        { resourceType: 'Patient', filters: [{ code: 'active', operator: Operator.EQUALS, value: 'true' }] }
      )
    ).toBe(false);
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient', active: true },
        { resourceType: 'Patient', filters: [{ code: 'active', operator: Operator.NOT_EQUALS, value: 'true' }] }
      )
    ).toBe(false);
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient', active: false },
        { resourceType: 'Patient', filters: [{ code: 'active', operator: Operator.NOT_EQUALS, value: 'false' }] }
      )
    ).toBe(false);
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient', active: true },
        { resourceType: 'Patient', filters: [{ code: 'active', operator: Operator.NOT_EQUALS, value: 'false' }] }
      )
    ).toBe(true);
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient', active: false },
        { resourceType: 'Patient', filters: [{ code: 'active', operator: Operator.NOT_EQUALS, value: 'true' }] }
      )
    ).toBe(true);
  });

  test('Reference filter', () => {
    const resource: Observation = { resourceType: 'Observation', subject: { reference: 'Patient/123' } };
    const search = {
      resourceType: 'Observation',
      filters: [{ code: 'subject', operator: Operator.EQUALS, value: 'Patient/123' }],
    };

    search.filters[0].operator = Operator.EQUALS;
    search.filters[0].value = 'Patient/123';
    expect(matchesSearchRequest(resource, search)).toBe(true);

    search.filters[0].value = 'Patient/456';
    expect(matchesSearchRequest(resource, search)).toBe(false);

    search.filters[0].operator = Operator.NOT_EQUALS;
    search.filters[0].value = 'Patient/123';
    expect(matchesSearchRequest(resource, search)).toBe(false);

    search.filters[0].value = 'Patient/456';
    expect(matchesSearchRequest(resource, search)).toBe(true);
  });

  test('Empty reference filter', () => {
    const resource: Observation = { resourceType: 'Observation' };
    const search = {
      resourceType: 'Observation',
      filters: [{ code: 'subject', operator: Operator.EQUALS, value: '' }],
    };

    search.filters[0].operator = Operator.EQUALS;
    search.filters[0].value = '';
    expect(matchesSearchRequest(resource, search)).toBe(true);

    search.filters[0].value = 'Patient/456';
    expect(matchesSearchRequest(resource, search)).toBe(false);

    search.filters[0].operator = Operator.NOT_EQUALS;
    search.filters[0].value = '';
    expect(matchesSearchRequest(resource, search)).toBe(false);

    search.filters[0].value = 'Patient/456';
    expect(matchesSearchRequest(resource, search)).toBe(true);
  });

  test('Canonical reference filter', () => {
    expect(
      matchesSearchRequest(
        { resourceType: 'QuestionnaireResponse', questionnaire: 'Questionnaire/123' },
        {
          resourceType: 'QuestionnaireResponse',
          filters: [{ code: 'questionnaire', operator: Operator.EQUALS, value: 'Questionnaire/123' }],
        }
      )
    ).toBe(true);
    expect(
      matchesSearchRequest(
        { resourceType: 'QuestionnaireResponse' },
        {
          resourceType: 'QuestionnaireResponse',
          filters: [{ code: 'questionnaire', operator: Operator.EQUALS, value: 'Questionnaire/123' }],
        }
      )
    ).toBe(false);
    expect(
      matchesSearchRequest(
        { resourceType: 'QuestionnaireResponse', questionnaire: 'Questionnaire/123' },
        {
          resourceType: 'QuestionnaireResponse',
          filters: [{ code: 'questionnaire', operator: Operator.EQUALS, value: 'Questionnaire/456' }],
        }
      )
    ).toBe(false);
    expect(
      matchesSearchRequest(
        { resourceType: 'QuestionnaireResponse', questionnaire: 'Questionnaire/123' },
        {
          resourceType: 'QuestionnaireResponse',
          filters: [{ code: 'questionnaire', operator: Operator.NOT_EQUALS, value: 'Questionnaire/123' }],
        }
      )
    ).toBe(false);
    expect(
      matchesSearchRequest(
        { resourceType: 'QuestionnaireResponse' },
        {
          resourceType: 'QuestionnaireResponse',
          filters: [{ code: 'questionnaire', operator: Operator.NOT_EQUALS, value: 'Questionnaire/123' }],
        }
      )
    ).toBe(true);
    expect(
      matchesSearchRequest(
        { resourceType: 'QuestionnaireResponse', questionnaire: 'Questionnaire/123' },
        {
          resourceType: 'QuestionnaireResponse',
          filters: [{ code: 'questionnaire', operator: Operator.NOT_EQUALS, value: 'Questionnaire/456' }],
        }
      )
    ).toBe(true);
  });

  test('String filter', () => {
    const patient: Patient = { resourceType: 'Patient', name: [{ given: ['Homer'], family: 'Simpson' }] };

    expect(
      matchesSearchRequest(patient, {
        resourceType: 'Patient',
        filters: [{ code: 'name', operator: Operator.EQUALS, value: 'Simpson' }],
      })
    ).toBe(true);
    expect(
      matchesSearchRequest(patient, {
        resourceType: 'Patient',
        filters: [{ code: 'name', operator: Operator.EQUALS, value: 'George' }],
      })
    ).toBe(false);
    expect(
      matchesSearchRequest(patient, {
        resourceType: 'Patient',
        filters: [{ code: 'name', operator: Operator.NOT_EQUALS, value: 'Simpson' }],
      })
    ).toBe(false);
    expect(
      matchesSearchRequest(patient, {
        resourceType: 'Patient',
        filters: [{ code: 'name', operator: Operator.NOT_EQUALS, value: 'George' }],
      })
    ).toBe(true);
    expect(
      matchesSearchRequest(
        { resourceType: 'Bot', name: 'Test Bot' },
        {
          resourceType: 'Bot',
          filters: [{ code: 'name', operator: Operator.EQUALS, value: 'Test' }],
        }
      )
    ).toBe(true);
  });

  test('Token filter', () => {
    expect(
      matchesSearchRequest(
        { resourceType: 'Observation', code: { text: 'foo' } },
        { resourceType: 'Observation', filters: [{ code: 'code', operator: Operator.EQUALS, value: 'foo' }] }
      )
    ).toBe(true);
    expect(
      matchesSearchRequest(
        { resourceType: 'Observation', code: { text: 'foo' } },
        { resourceType: 'Observation', filters: [{ code: 'code', operator: Operator.EQUALS, value: 'George' }] }
      )
    ).toBe(false);
    expect(
      matchesSearchRequest(
        { resourceType: 'Observation', code: { text: 'foo' } },
        {
          resourceType: 'Observation',
          filters: [{ code: 'code', operator: Operator.NOT_EQUALS, value: 'foo' }],
        }
      )
    ).toBe(false);
    expect(
      matchesSearchRequest(
        { resourceType: 'Observation', code: { text: 'foo' } },
        {
          resourceType: 'Observation',
          filters: [{ code: 'code', operator: Operator.NOT_EQUALS, value: 'George' }],
        }
      )
    ).toBe(true);
  });

  describe('Date', () => {
    describe('equals', () => {
      test('true', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.EQUALS, value: '1990-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(true);
      });

      test('false', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.EQUALS, value: '1990-01-02' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(false);
      });
    });

    describe('not equals', () => {
      test('true', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.NOT_EQUALS, value: '1990-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(false);
      });

      test('false', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.NOT_EQUALS, value: '1990-01-02' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(true);
      });
    });

    describe('greater than', () => {
      test('true', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.GREATER_THAN, value: '1980-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(true);
      });

      test('false', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.GREATER_THAN, value: '2000-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(false);
      });

      test('same value', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.GREATER_THAN, value: '1990-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(false);
      });
    });

    describe('greater than or equals', () => {
      test('true', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.GREATER_THAN_OR_EQUALS, value: '1980-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(true);
      });

      test('false', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.GREATER_THAN_OR_EQUALS, value: '2000-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(false);
      });

      test('same value', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.GREATER_THAN_OR_EQUALS, value: '1990-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(true);
      });
    });

    describe('less than', () => {
      test('true', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.LESS_THAN, value: '1980-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(false);
      });

      test('false', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.LESS_THAN, value: '2000-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(true);
      });

      test('same value', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.LESS_THAN, value: '1990-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(false);
      });
    });

    describe('less than or equals', () => {
      test('true', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.LESS_THAN_OR_EQUALS, value: '1980-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(false);
      });

      test('false', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.LESS_THAN_OR_EQUALS, value: '2000-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(true);
      });

      test('same value', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.LESS_THAN_OR_EQUALS, value: '1990-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(true);
      });
    });
  });
});
