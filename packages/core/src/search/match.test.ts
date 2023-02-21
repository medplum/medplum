import { readJson } from '@medplum/definitions';
import { Bundle, Observation, Patient, Practitioner, SearchParameter } from '@medplum/fhirtypes';
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '../types';
import { matchesSearchRequest } from './match';
import { Operator, parseSearchDefinition, SearchRequest } from './search';

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
    expect(matchesSearchRequest(resource, search as SearchRequest)).toBe(true);

    search.filters[0].value = 'Patient/456';
    expect(matchesSearchRequest(resource, search as SearchRequest)).toBe(false);

    search.filters[0].operator = Operator.NOT_EQUALS;
    search.filters[0].value = 'Patient/123';
    expect(matchesSearchRequest(resource, search as SearchRequest)).toBe(false);

    search.filters[0].value = 'Patient/456';
    expect(matchesSearchRequest(resource, search as SearchRequest)).toBe(true);
  });

  test('Empty reference filter', () => {
    const resource: Observation = { resourceType: 'Observation' };
    const search = {
      resourceType: 'Observation',
      filters: [{ code: 'subject', operator: Operator.EQUALS, value: '' }],
    };

    search.filters[0].operator = Operator.EQUALS;
    search.filters[0].value = '';
    expect(matchesSearchRequest(resource, search as SearchRequest)).toBe(true);

    search.filters[0].value = 'Patient/456';
    expect(matchesSearchRequest(resource, search as SearchRequest)).toBe(false);

    search.filters[0].operator = Operator.NOT_EQUALS;
    search.filters[0].value = '';
    expect(matchesSearchRequest(resource, search as SearchRequest)).toBe(false);

    search.filters[0].value = 'Patient/456';
    expect(matchesSearchRequest(resource, search as SearchRequest)).toBe(true);
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

  describe('Token', () => {
    test('equals', () => {
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
    });

    test('not equals', () => {
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

    test('not', () => {
      // "DiagnosticReport?status:not=cancelled"
      // "DiagnosticReport?status=cancelled"
      expect(
        matchesSearchRequest(
          { resourceType: 'DiagnosticReport', status: 'preliminary' },
          parseSearchDefinition('DiagnosticReport?status=cancelled')
        )
      ).toBe(false);
      expect(
        matchesSearchRequest(
          { resourceType: 'DiagnosticReport', status: 'preliminary' },
          parseSearchDefinition('DiagnosticReport?status:not=cancelled')
        )
      ).toBe(true);
      expect(
        matchesSearchRequest(
          { resourceType: 'DiagnosticReport', status: 'cancelled' },
          parseSearchDefinition('DiagnosticReport?status=cancelled')
        )
      ).toBe(true);
      expect(
        matchesSearchRequest(
          { resourceType: 'DiagnosticReport', status: 'cancelled' },
          parseSearchDefinition('DiagnosticReport?status:not=cancelled')
        )
      ).toBe(false);

      // "ServiceRequest?order-detail:not=VOIDED,CANCELLED"
      // "ServiceRequest?order-detail=VOIDED,CANCELLED"
      expect(
        matchesSearchRequest(
          { resourceType: 'ServiceRequest', orderDetail: [{ text: 'ORDERED' }] },
          parseSearchDefinition('ServiceRequest?order-detail=VOIDED,CANCELLED')
        )
      ).toBe(false);
      expect(
        matchesSearchRequest(
          { resourceType: 'ServiceRequest', orderDetail: [{ text: 'ORDERED' }] },
          parseSearchDefinition('ServiceRequest?order-detail:not=VOIDED,CANCELLED')
        )
      ).toBe(true);
      expect(
        matchesSearchRequest(
          { resourceType: 'ServiceRequest', orderDetail: [{ text: 'VOIDED' }] },
          parseSearchDefinition('ServiceRequest?order-detail=VOIDED,CANCELLED')
        )
      ).toBe(true);
      expect(
        matchesSearchRequest(
          { resourceType: 'ServiceRequest', orderDetail: [{ text: 'VOIDED' }] },
          parseSearchDefinition('ServiceRequest?order-detail:not=VOIDED,CANCELLED')
        )
      ).toBe(false);
    });
  });

  describe('Date', () => {
    describe('equals', () => {
      test('true', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search: SearchRequest = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.EQUALS, value: '1990-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(true);
      });

      test('false', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search: SearchRequest = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.EQUALS, value: '1990-01-02' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(false);
      });
    });

    describe('not equals', () => {
      test('true', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search: SearchRequest = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.NOT_EQUALS, value: '1990-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(false);
      });

      test('false', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search: SearchRequest = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.NOT_EQUALS, value: '1990-01-02' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(true);
      });
    });

    describe('greater than', () => {
      test('true', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search: SearchRequest = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.GREATER_THAN, value: '1980-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(true);
      });

      test('false', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search: SearchRequest = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.GREATER_THAN, value: '2000-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(false);
      });

      test('same value', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search: SearchRequest = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.GREATER_THAN, value: '1990-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(false);
      });
    });

    describe('greater than or equals', () => {
      test('true', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search: SearchRequest = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.GREATER_THAN_OR_EQUALS, value: '1980-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(true);
      });

      test('false', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search: SearchRequest = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.GREATER_THAN_OR_EQUALS, value: '2000-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(false);
      });

      test('same value', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search: SearchRequest = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.GREATER_THAN_OR_EQUALS, value: '1990-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(true);
      });
    });

    describe('less than', () => {
      test('true', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search: SearchRequest = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.LESS_THAN, value: '1980-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(false);
      });

      test('false', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search: SearchRequest = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.LESS_THAN, value: '2000-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(true);
      });

      test('same value', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search: SearchRequest = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.LESS_THAN, value: '1990-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(false);
      });
    });

    describe('less than or equals', () => {
      test('true', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search: SearchRequest = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.LESS_THAN_OR_EQUALS, value: '1980-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(false);
      });

      test('false', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search: SearchRequest = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.LESS_THAN_OR_EQUALS, value: '2000-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(true);
      });

      test('same value', () => {
        const patient: Patient = { resourceType: 'Patient', birthDate: '1990-01-01' };
        const search: SearchRequest = {
          resourceType: 'Patient',
          filters: [{ code: 'birthdate', operator: Operator.LESS_THAN_OR_EQUALS, value: '1990-01-01' }],
        };
        expect(matchesSearchRequest(patient, search)).toBe(true);
      });
    });
  });

  test('Compartments', () => {
    const resource1: Patient = {
      resourceType: 'Patient',
      meta: { compartment: [{ reference: 'Organization/123' }] },
    };

    const resource2: Patient = {
      resourceType: 'Patient',
      meta: { compartment: [{ reference: 'Organization/456' }] },
    };

    const search1: SearchRequest = {
      resourceType: 'Patient',
      filters: [{ code: '_compartment', operator: Operator.EQUALS, value: 'Organization/123' }],
    };

    const search2: SearchRequest = {
      resourceType: 'Patient',
      filters: [{ code: '_compartment', operator: Operator.EQUALS, value: 'Organization/456' }],
    };

    // Backwards compatibility
    // Support matching values without the resourceType prefix
    const search3: SearchRequest = {
      resourceType: 'Patient',
      filters: [{ code: '_compartment', operator: Operator.EQUALS, value: '123' }],
    };

    expect(matchesSearchRequest(resource1, search1)).toBe(true);
    expect(matchesSearchRequest(resource1, search2)).toBe(false);
    expect(matchesSearchRequest(resource1, search3)).toBe(true);
    expect(matchesSearchRequest(resource2, search1)).toBe(false);
    expect(matchesSearchRequest(resource2, search2)).toBe(true);
    expect(matchesSearchRequest(resource2, search3)).toBe(false);
  });

  test('Identifier', () => {
    const identifier = '1234567890';

    const resource: Patient = {
      resourceType: 'Patient',
      identifier: [
        {
          system: 'test',
          value: identifier,
        },
      ],
    };

    const search1: SearchRequest = {
      resourceType: 'Patient',
      filters: [{ code: 'identifier', operator: Operator.EQUALS, value: identifier }],
    };
    expect(matchesSearchRequest(resource, search1)).toBe(true);

    const search2: SearchRequest = {
      resourceType: 'Patient',
      filters: [{ code: 'identifier', operator: Operator.EQUALS, value: 'foo' }],
    };
    expect(matchesSearchRequest(resource, search2)).toBe(false);
  });

  test('Identifier with system', () => {
    const identifier = '1234567890';

    const resource: Practitioner = {
      resourceType: 'Practitioner',
      identifier: [
        {
          system: 'https://example.com',
          value: identifier,
        },
      ],
    };

    const search1: SearchRequest = {
      resourceType: 'Practitioner',
      filters: [{ code: 'identifier', operator: Operator.EQUALS, value: 'https://example.com|' + identifier }],
    };
    expect(matchesSearchRequest(resource, search1)).toBe(true);
  });
});
