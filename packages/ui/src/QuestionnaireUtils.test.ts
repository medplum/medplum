import { Questionnaire } from '@medplum/core';
import { addQuestionnaireInitialValues } from './QuestionnaireUtils';

describe('QuestionnaireUtils', () => {

  test('Rewrite empty resource', () => {
    const input: Questionnaire = {
      resourceType: 'Questionnaire'
    };

    const output = addQuestionnaireInitialValues(input, {});

    expect(output).toMatchObject(input);
  });

  test('Ignores missing linkId', () => {
    const input: Questionnaire = {
      resourceType: 'Questionnaire',
      item: [{
        type: 'string'
      }]
    };

    const output = addQuestionnaireInitialValues(input, {});

    expect(output).toMatchObject(input);
  });

  test('Ignores missing type', () => {
    const input: Questionnaire = {
      resourceType: 'Questionnaire',
      item: [{
        linkId: '123'
      }]
    };

    const values: Record<string, string> = {
      '123': '456'
    };

    const output = addQuestionnaireInitialValues(input, values);

    expect(output).toMatchObject(input);
  });

  test('Ignores unrecognized type', () => {
    const input: Questionnaire = {
      resourceType: 'Questionnaire',
      item: [{
        linkId: '123',
        type: 'unknown'
      }]
    };

    const values: Record<string, string> = {
      '123': '456'
    };

    const output = addQuestionnaireInitialValues(input, values);

    expect(output).toMatchObject(input);
  });

  test('Ignores items without values', () => {
    const input: Questionnaire = {
      resourceType: 'Questionnaire',
      item: [{
        linkId: '123',
        type: 'string'
      }]
    };

    const values: Record<string, string> = {
      'abc': 'xyz'
    };

    const output = addQuestionnaireInitialValues(input, values);

    expect(output).toMatchObject(input);
  });

  test('Add initial values', () => {
    const input: Questionnaire = {
      resourceType: 'Questionnaire',
      item: [{
        linkId: 'q1',
        type: 'group',
        item: [{
          linkId: 'q1.1',
          type: 'string'
        }]
      },
      {
        linkId: 'q2',
        type: 'string'
      },
      {
        linkId: 'q3',
        type: 'decimal'
      },
      {
        linkId: 'q4',
        type: 'boolean'
      },
      {
        linkId: 'q5',
        type: 'code'
      },
      {
        linkId: 'q6',
        type: 'date'
      },
      {
        linkId: 'q7',
        type: 'dateTime'
      },
      {
        linkId: 'q8',
        type: 'integer'
      },
      {
        linkId: 'q9',
        type: 'time'
      },
      {
        linkId: 'q10',
        type: 'url'
      },
      {
        linkId: 'q11',
        type: 'Reference'
      }]
    };

    const values: Record<string, string> = {
      'q1.1': 'a1.1',
      'q2': 'a2',
      'q3': '3.0',
      'q4': 'true',
      'q5': 'code5',
      'q6': '2021-01-01',
      'q7': '2021-01-01T12:00:00Z',
      'q8': '1001',
      'q9': '12:00:00',
      'q10': 'https://example.com/',
      'q11': 'Patient/123'
    };

    const output = addQuestionnaireInitialValues(input, values);

    expect(output).toMatchObject({
      resourceType: 'Questionnaire',
      item: [{
        linkId: 'q1',
        type: 'group',
        item: [{
          linkId: 'q1.1',
          type: 'string',
          initial: [{ valueString: 'a1.1' }]
        }]
      },
      {
        linkId: 'q2',
        type: 'string',
        initial: [{ valueString: 'a2' }]
      },
      {
        linkId: 'q3',
        type: 'decimal',
        initial: [{ valueDecimal: 3.0 }]
      },
      {
        linkId: 'q4',
        type: 'boolean',
        initial: [{ valueBoolean: true }]
      },
      {
        linkId: 'q5',
        type: 'code',
        initial: [{ valueCoding: { code: 'code5' } }]
      },
      {
        linkId: 'q6',
        type: 'date',
        initial: [{ valueDate: '2021-01-01' }]
      },
      {
        linkId: 'q7',
        type: 'dateTime',
        initial: [{ valueDateTime: '2021-01-01T12:00:00Z' }]
      },
      {
        linkId: 'q8',
        type: 'integer',
        initial: [{ valueInteger: 1001 }]
      },
      {
        linkId: 'q9',
        type: 'time',
        initial: [{ valueTime: '12:00:00' }]
      },
      {
        linkId: 'q10',
        type: 'url',
        initial: [{ valueUri: 'https://example.com/' }]
      },
      {
        linkId: 'q11',
        type: 'Reference',
        initial: [{ valueReference: { reference: 'Patient/123' } }]
      }]
    });
  });

});
