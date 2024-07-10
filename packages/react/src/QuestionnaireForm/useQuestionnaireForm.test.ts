import { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { act, renderHook } from '@testing-library/react';
import { useQuestionnaireForm } from './useQuestionnaireForm';

// Mock the useMedplum hook
jest.mock('@medplum/react-hooks', () => ({
  useMedplum: jest.fn(() => ({
    getProfile: jest.fn(() => ({ resourceType: 'Practitioner', id: 'test-practitioner' })),
    requestSchema: jest.fn(() => Promise.resolve()),
  })),
  useResource: jest.fn((resource) => resource),
}));

describe('useQuestionnaireForm', () => {
  describe('Initialization', () => {
    test('initializes with a basic questionnaire', () => {
      const questionnaire: Questionnaire = {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'name',
            type: 'string',
            text: 'What is your name?',
            initial: [{ valueString: 'John' }],
          },
        ],
      };

      const { result } = renderHook(() => useQuestionnaireForm({ questionnaire }));

      expect(result.current.getItemValue('name')).toBe('John');
    });

    test('initializes with null values when no initial value is provided', () => {
      const questionnaire: Questionnaire = {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'name',
            type: 'string',
            text: 'What is your name?',
          },
        ],
      };

      const { result } = renderHook(() => useQuestionnaireForm({ questionnaire }));

      expect(result.current.getItemValue('name')).toBeUndefined();
    });

    test('initializes with different value types', () => {
      const questionnaire: Questionnaire = {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'name',
            type: 'string',
            text: 'What is your name?',
            initial: [{ valueString: 'John Doe' }],
          },
          {
            linkId: 'age',
            type: 'integer',
            text: 'What is your age?',
            initial: [{ valueInteger: 30 }],
          },
          {
            linkId: 'isStudent',
            type: 'boolean',
            text: 'Are you a student?',
            initial: [{ valueBoolean: true }],
          },
        ],
      };

      const { result } = renderHook(() => useQuestionnaireForm({ questionnaire }));

      expect(result.current.getItemValue('name')).toBe('John Doe');
      expect(result.current.getItemValue('age')).toBe(30);
      expect(result.current.getItemValue('isStudent')).toBe(true);
    });

    test('initializes with group items', () => {
      const questionnaire: Questionnaire = {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'personalInfo',
            type: 'group',
            text: 'Personal Information',
            item: [
              {
                linkId: 'name',
                type: 'string',
                text: 'What is your name?',
                initial: [{ valueString: 'John' }],
              },
              {
                linkId: 'age',
                type: 'integer',
                text: 'What is your age?',
                initial: [{ valueInteger: 23 }],
              },
            ],
          },
        ],
      };

      const { result } = renderHook(() => useQuestionnaireForm({ questionnaire }));

      expect(result.current.getItemValue('personalInfo.name')).toBe('John');
      expect(result.current.getItemValue('personalInfo.age')).toBe(23);
    });

    test('initializes with repeated group items', () => {
      const questionnaire: Questionnaire = {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'education',
            type: 'group',
            text: 'Education',
            repeats: true,
            item: [
              {
                linkId: 'degree',
                type: 'string',
                text: 'Degree',
                initial: [{ valueString: 'English' }],
              },
              {
                linkId: 'year',
                type: 'integer',
                text: 'Year',
                initial: [{ valueInteger: 1995 }],
              },
            ],
          },
        ],
      };

      const { result } = renderHook(() => useQuestionnaireForm({ questionnaire }));

      expect(result.current.getItemValue('education.0.degree')).toBe('English');
      expect(result.current.getItemValue('education.0.year')).toBe(1995);
    });

    test('initializes with questions with nested items', () => {
      const questionnaire: Questionnaire = {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'favoriteColor',
            type: 'choice',
            text: 'What is your favorite color?',
            initial: [{ valueCoding: { code: 'red', display: 'Red' } }],
            item: [
              {
                linkId: 'favoriteColor.specify',
                type: 'string',
                text: 'Please specify',
                initial: [{ valueString: 'Crimson' }],
                enableWhen: [
                  {
                    question: 'favoriteColor',
                    operator: '=',
                    answerCoding: {
                      code: 'other',
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const { result } = renderHook(() => useQuestionnaireForm({ questionnaire }));

      expect(result.current.getItemValue('favoriteColor')).toEqual({ code: 'red', display: 'Red' });
      expect(result.current.getItemValue('favoriteColor.favoriteColor\\.specify')).toBe('Crimson');
    });

    test('initializes with repeated questions with nested sub items', () => {
      const questionnaire: Questionnaire = {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'medications',
            type: 'string',
            text: 'List your medications',
            repeats: true,
            initial: [{ valueString: 'Tylenol' }, { valueString: 'Advil' }],
            item: [
              {
                linkId: 'medications.dosage',
                type: 'quantity',
                text: 'Dosage',
                initial: [{ valueQuantity: { value: 500, unit: 'mg' } }],
              },
              {
                linkId: 'medications.frequency',
                type: 'string',
                text: 'Frequency',
                initial: [{ valueString: 'Once daily' }],
              },
            ],
          },
        ],
      };

      const { result } = renderHook(() => useQuestionnaireForm({ questionnaire }));

      expect(result.current.getItemValue('medications')).toEqual(['Tylenol', 'Advil']);
      expect(result.current.getItemValue('medications.0.medications\\.dosage')).toEqual({ value: 500, unit: 'mg' });
      expect(result.current.getItemValue('medications.0.medications\\.frequency')).toBe('Once daily');
      expect(result.current.getItemValue('medications.1.medications\\.dosage')).toEqual({ value: 500, unit: 'mg' });
      expect(result.current.getItemValue('medications.1.medications\\.frequency')).toBe('Once daily');
    });
  });

  // describe('forEachAnswer', () => {
  //   // ... (update existing forEachAnswer tests to match the new structure)
  // });

  describe('onSubmit', () => {
    test('returns correct QuestionnaireResponse for a simple questionnaire', async () => {
      const questionnaire: Questionnaire = {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'name',
            type: 'string',
            text: 'What is your name?',
          },
          {
            linkId: 'age',
            type: 'integer',
            text: 'What is your age?',
          },
        ],
      };

      const { result } = renderHook(useQuestionnaireForm, { initialProps: { questionnaire } });

      act(() => {
        result.current.setItemValue('name', 'John Doe');
        result.current.setItemValue('age', 30);
      });

      const response = {};
      await result.current.onSubmit((r) => Object.assign(response, r))();

      expect(response).toMatchObject<QuestionnaireResponse>({
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        item: [
          {
            linkId: 'name',
            answer: [{ valueString: 'John Doe' }],
          },
          {
            linkId: 'age',
            answer: [{ valueInteger: 30 }],
          },
        ],
      });
    });

    test('returns correct QuestionnaireResponse for a questionnaire with groups', async () => {
      const questionnaire: Questionnaire = {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'personalInfo',
            type: 'group',
            text: 'Personal Information',
            item: [
              {
                linkId: 'name',
                type: 'string',
                text: 'What is your name?',
              },
              {
                linkId: 'age',
                type: 'integer',
                text: 'What is your age?',
              },
            ],
          },
        ],
      };

      const { result } = renderHook(() => useQuestionnaireForm({ questionnaire }));

      act(() => {
        result.current.setItemValue('personalInfo.name', 'Jane Doe');
        result.current.setItemValue('personalInfo.age', 25);
      });

      const response = {};
      result.current.onSubmit((r) => Object.assign(response, r))();

      expect(response).toMatchObject<QuestionnaireResponse>({
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        item: [
          {
            linkId: 'personalInfo',
            item: [
              {
                linkId: 'name',
                answer: [{ valueString: 'Jane Doe' }],
              },
              {
                linkId: 'age',
                answer: [{ valueInteger: 25 }],
              },
            ],
          },
        ],
      });
    });

    test('returns correct QuestionnaireResponse for a questionnaire with repeating items', async () => {
      const questionnaire: Questionnaire = {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'medications',
            type: 'string',
            text: 'List your medications',
            repeats: true,
          },
        ],
      };

      const { result } = renderHook(useQuestionnaireForm, { initialProps: { questionnaire } });

      act(() => {
        result.current.setItemValue('medications', ['Aspirin', 'Ibuprofen']);
      });

      const response = {};
      result.current.onSubmit((r) => Object.assign(response, r))();

      expect(response).toMatchObject<QuestionnaireResponse>({
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        item: [
          {
            linkId: 'medications',
            answer: [{ valueString: 'Aspirin' }, { valueString: 'Ibuprofen' }],
          },
        ],
      });
    });

    test('returns correct QuestionnaireResponse for a complex questionnaire', async () => {
      const questionnaire: Questionnaire = {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'patientInfo',
            type: 'group',
            text: 'Patient Information',
            item: [
              {
                linkId: 'name',
                type: 'string',
                text: 'Full Name',
              },
              {
                linkId: 'conditions',
                type: 'choice',
                text: 'Do you have any medical conditions?',
                answerValueSet: 'http://example.com/conditions',
                repeats: true,
                item: [
                  {
                    linkId: 'conditions.details',
                    type: 'string',
                    text: 'Provide details',
                  },
                ],
              },
            ],
          },
        ],
      };

      const { result } = renderHook(useQuestionnaireForm, { initialProps: { questionnaire } });

      act(() => {
        // result.current.setItemValue('patientInfo.name', 'Jane Doe');
        result.current.setItemValue('patientInfo.conditions', [
          { code: 'diabetes', system: 'http://example.com/conditions' },
          { code: 'hypertension', system: 'http://example.com/conditions' },
        ]);
        result.current.setItemValue('patientInfo.conditions.0.conditions\\.details', 'Type 2, diagnosed 2 years ago');
        result.current.setItemValue('patientInfo.conditions.1.conditions\\.details', 'Controlled with medication');
      });

      const response = {};
      act(() => result.current.onSubmit((r) => Object.assign(response, r))());

      expect(response).toMatchObject<QuestionnaireResponse>({
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        item: [
          {
            linkId: 'patientInfo',
            item: [
              {
                linkId: 'name',
                answer: undefined,
              },
              {
                linkId: 'conditions',
                answer: [
                  {
                    valueCoding: { code: 'diabetes', system: 'http://example.com/conditions' },
                    item: [
                      {
                        linkId: 'conditions.details',
                        answer: [{ valueString: 'Type 2, diagnosed 2 years ago' }],
                      },
                    ],
                  },
                  {
                    valueCoding: { code: 'hypertension', system: 'http://example.com/conditions' },
                    item: [
                      {
                        linkId: 'conditions.details',
                        answer: [{ valueString: 'Controlled with medication' }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
    });
  });
});
