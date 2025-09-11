// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Questionnaire, QuestionnaireItem, QuestionnaireResponse, QuestionnaireResponseItem } from '@medplum/fhirtypes';
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
    const onChange = jest.fn();
    const { result } = renderHook(() => useQuestionnaireForm({ questionnaire, onChange }), { wrapper });
    expect(onChange).toHaveBeenCalledTimes(1);
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
          }),
        ],
      }),
    });
    onChange.mockClear();

    const formState = result.current as QuestionnaireFormLoadedState;
    await act(async () => {
      formState.onChangeAnswer([], questionnaire.item[0], [{ valueString: 'Test Answer' }]);
    });
    expect(onChange).toHaveBeenCalledTimes(1);

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
          repeats: true,
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

  test('Repeatable groups should maintain separate answers for each group instance', async () => {
    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      id: 'test',
      status: 'active',
      item: [
        {
          linkId: 'group1',
          text: 'Group 1',
          type: 'group',
          repeats: true,
          item: [
            {
              linkId: 'question1',
              text: 'Question 1',
              type: 'string',
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

    // Add a second group
    await act(async () => {
      formState.onAddGroup([], questionnaire.item?.[0] as QuestionnaireItem);
    });

    const updatedState = result.current as QuestionnaireFormLoadedState;
    expect(updatedState.questionnaireResponse.item).toHaveLength(2);

    // Get the two group instances
    const responseItems = updatedState.questionnaireResponse.item;
    expect(responseItems).toBeDefined();
    expect(responseItems).toHaveLength(2);

    const group1 = responseItems?.[0] as QuestionnaireResponseItem;
    const group2 = responseItems?.[1] as QuestionnaireResponseItem;

    // Answer question in first group
    await act(async () => {
      const questionItem = questionnaire.item?.[0]?.item?.[0] as QuestionnaireItem;
      updatedState.onChangeAnswer([group1], questionItem, [{ valueString: 'Answer 1' }]);
    });

    // Answer question in second group
    await act(async () => {
      const questionItem = questionnaire.item?.[0]?.item?.[0] as QuestionnaireItem;
      updatedState.onChangeAnswer([group2], questionItem, [{ valueString: 'Answer 2' }]);
    });

    const finalState = result.current as QuestionnaireFormLoadedState;

    // Verify that each group has its own answer
    const finalResponseItems = finalState.questionnaireResponse.item;
    expect(finalResponseItems).toBeDefined();
    expect(finalResponseItems).toHaveLength(2);

    const finalGroup1Answer = finalResponseItems?.[0]?.item?.[0]?.answer;
    const finalGroup2Answer = finalResponseItems?.[1]?.item?.[0]?.answer;
    expect(finalGroup1Answer).toHaveLength(1);
    expect(finalGroup2Answer).toHaveLength(1);
    expect(finalGroup1Answer?.[0]?.valueString).toBe('Answer 1');
    expect(finalGroup2Answer?.[0]?.valueString).toBe('Answer 2');
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
    } as const;

    const { result } = renderHook(() => useQuestionnaireForm({ questionnaire }), { wrapper });
    expect(result.current).toMatchObject({ loading: false });

    const formState1 = result.current as QuestionnaireFormLoadedState;
    expect(formState1.items).toHaveLength(1);
    expect(formState1.questionnaireResponse.item).toHaveLength(1);
    expect(formState1.questionnaireResponse.item?.[0]?.answer).toBeUndefined();

    await act(async () => {
      formState1.onChangeAnswer([], questionnaire.item[0], [{ valueString: 'Test Answer' }]);
    });

    const formState2 = result.current as QuestionnaireFormLoadedState;
    expect(formState2.questionnaireResponse.item?.[0]).toMatchObject({
      linkId: 'test-item',
      text: 'Test Item',
      answer: [{ valueString: 'Test Answer' }],
    });

    await act(async () => {
      formState2.onAddAnswer([], questionnaire.item[0] as QuestionnaireItem);
    });

    const updatedState = result.current as QuestionnaireFormLoadedState;
    expect(updatedState.items).toHaveLength(1);
    expect(updatedState.questionnaireResponse.item).toHaveLength(1);
    expect(updatedState.questionnaireResponse.item?.[0]?.answer).toHaveLength(2);
  });

  test('Signature functionality', async () => {
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
    expect(result.current).toMatchObject({ loading: false });

    const formState = result.current as QuestionnaireFormLoadedState;

    expect(formState.questionnaireResponse.extension).toBeUndefined();

    const signature = {
      type: [
        {
          system: 'urn:iso-astm:E1762-95:2013',
          code: '1.2.840.10065.1.12.1.1',
          display: "Author's Signature",
        },
      ],
      when: '2023-01-01T00:00:00Z',
      who: { reference: 'Practitioner/test' },
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    };

    await act(async () => {
      formState.onChangeSignature(signature);
    });

    const signedState = result.current as QuestionnaireFormLoadedState;
    expect(signedState.questionnaireResponse.extension).toHaveLength(1);
    expect(signedState.questionnaireResponse.extension?.[0]).toMatchObject({
      url: 'http://hl7.org/fhir/StructureDefinition/questionnaireresponse-signature',
      valueSignature: signature,
    });

    await act(async () => {
      formState.onChangeSignature(undefined);
    });

    const unsignedState = result.current as QuestionnaireFormLoadedState;
    expect(unsignedState.questionnaireResponse.extension).toEqual([]);
  });
});
