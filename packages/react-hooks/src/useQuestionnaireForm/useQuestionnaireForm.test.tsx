import { Questionnaire, QuestionnaireItem, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, renderHook } from '@testing-library/react';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import {
  QuestionnaireFormLoadedState,
  QuestionnaireFormPaginationState,
  useQuestionnaireForm,
} from './useQuestionnaireForm';

describe('useQuestionnaireForm', () => {
  const medplum = new MockClient();
  const wrapper: React.JSXElementConstructor<{
    children: React.ReactNode;
  }> = ({ children }) => <MedplumProvider medplum={medplum}>{children}</MedplumProvider>;

  test('Pass by value', async () => {
    const questionnaire = {
      resourceType: 'Questionnaire',
      id: 'test',
      status: 'active',
      item: [
        {
          type: 'string',
          linkId: 'test-item',
          text: 'Test Item',
        },
      ],
    } as const;
    const { result } = renderHook(() => useQuestionnaireForm({ questionnaire }), { wrapper });
    expect(result.current).toMatchObject({
      loading: false,
      questionnaire,
      questionnaireResponse: expect.objectContaining({
        resourceType: 'QuestionnaireResponse',
        status: 'in-progress',
        questionnaire: 'Questionnaire/test',
        item: [
          expect.objectContaining({
            linkId: 'test-item',
            text: 'Test Item',
            answer: [{}],
          }),
        ],
      }),
    });

    const formState = result.current as QuestionnaireFormLoadedState;
    await act(async () => {
      formState.onChangeAnswer([], questionnaire.item[0], [{ valueString: 'Test Answer' }]);
    });

    const updatedState = result.current as QuestionnaireFormLoadedState;
    expect(updatedState.questionnaireResponse.item?.[0]).toMatchObject({
      linkId: 'test-item',
      text: 'Test Item',
      answer: [{ valueString: 'Test Answer' }],
    });
  });

  test('Start with existing response', () => {
    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      id: 'test',
      status: 'active',
      item: [
        {
          type: 'string',
          linkId: 'test-item',
          text: 'Test Item',
        },
      ],
    };
    const defaultValue: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      status: 'in-progress',
      questionnaire: 'Questionnaire/test',
      item: [
        {
          linkId: 'test-item',
          text: 'Test Item',
          answer: [{ valueString: 'Existing Answer' }],
        },
      ],
    };
    const { result } = renderHook(() => useQuestionnaireForm({ questionnaire, defaultValue }), { wrapper });
    expect(result.current).toMatchObject({
      loading: false,
      questionnaire,
      questionnaireResponse: expect.objectContaining(defaultValue),
    });
  });

  test('Pagination', async () => {
    const questionnaire = {
      resourceType: 'Questionnaire',
      id: 'pages-example',
      title: 'Pages Example',
      item: [
        {
          linkId: 'group1',
          text: 'Group 1',
          type: 'group',
          item: [
            {
              linkId: 'question1',
              text: 'Question 1',
              type: 'string',
            },
          ],
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
              valueCodeableConcept: {
                coding: [
                  {
                    system: 'http://hl7.org/fhir/questionnaire-item-control',
                    code: 'page',
                  },
                ],
              },
            },
          ],
        },
        {
          linkId: 'group2',
          text: 'Group 2',
          type: 'group',
          item: [
            {
              linkId: 'question2',
              text: 'Question 2',
              type: 'reference',
            },
          ],
        },
      ],
    } as const;

    const { result } = renderHook(() => useQuestionnaireForm({ questionnaire }), { wrapper });
    expect(result.current).toMatchObject({ loading: false, pagination: true });

    // Should be on the first page
    const formState = result.current as QuestionnaireFormPaginationState;
    expect(formState.items[0].linkId).toBe('group1');

    // Move to the next page
    await act(async () => {
      formState.onNextPage();
    });

    // Should now be on the second page
    const updatedState = result.current as QuestionnaireFormLoadedState;
    expect(updatedState.items[0].linkId).toBe('group2');

    // Move back to the first page
    await act(async () => {
      formState.onPrevPage();
    });

    // Should be back on the first page
    const backToFirstPageState = result.current as QuestionnaireFormLoadedState;
    expect(backToFirstPageState.items[0].linkId).toBe('group1');
  });

  test('Repeatable group', async () => {
    const questionnaire = {
      resourceType: 'Questionnaire',
      id: 'test',
      status: 'active',
      item: [
        {
          type: 'group',
          linkId: 'test-group',
          text: 'Test Group',
          item: [
            {
              type: 'string',
              linkId: 'test-item',
              text: 'Test Item',
            },
          ],
        },
      ],
    };

    const { result } = renderHook(() => useQuestionnaireForm({ questionnaire }), { wrapper });
    expect(result.current).toMatchObject({ loading: false });

    const formState = result.current as QuestionnaireFormLoadedState;
    expect(formState.items).toHaveLength(1);
    expect(formState.questionnaireResponse.item).toHaveLength(1);

    await act(async () => {
      formState.onAddGroup([], questionnaire.item[0] as QuestionnaireItem);
    });

    const updatedState = result.current as QuestionnaireFormLoadedState;
    expect(updatedState.items).toHaveLength(1);
    expect(updatedState.questionnaireResponse.item).toHaveLength(2);
  });

  test('Repeatable answer', async () => {
    const questionnaire = {
      resourceType: 'Questionnaire',
      id: 'test',
      status: 'active',
      item: [
        {
          type: 'string',
          linkId: 'test-item',
          text: 'Test Item',
          repeats: true,
        },
      ],
    };

    const { result } = renderHook(() => useQuestionnaireForm({ questionnaire }), { wrapper });
    expect(result.current).toMatchObject({ loading: false });

    const formState = result.current as QuestionnaireFormLoadedState;
    expect(formState.items).toHaveLength(1);
    expect(formState.questionnaireResponse.item).toHaveLength(1);
    expect(formState.questionnaireResponse.item?.[0]?.answer).toHaveLength(1);

    await act(async () => {
      formState.onAddAnswer([], questionnaire.item[0] as QuestionnaireItem);
    });

    const updatedState = result.current as QuestionnaireFormLoadedState;
    expect(updatedState.items).toHaveLength(1);
    expect(updatedState.questionnaireResponse.item).toHaveLength(1);
    expect(updatedState.questionnaireResponse.item?.[0]?.answer).toHaveLength(2);
  });
});
