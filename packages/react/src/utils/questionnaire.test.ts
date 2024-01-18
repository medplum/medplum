import { QuestionnaireItem, QuestionnaireItemEnableWhen } from '@medplum/fhirtypes';
import { formatReferenceString, getNewMultiSelectValues, isChoiceQuestion, isQuestionEnabled } from './questionnaire';

describe('QuestionnaireUtils', () => {
  test('isChoiceQuestion', () => {
    expect(isChoiceQuestion({ linkId: 'q3', type: 'string' })).toBe(false);
    expect(isChoiceQuestion({ linkId: 'q3', type: 'choice' })).toBe(true);
    expect(isChoiceQuestion({ linkId: 'q3', type: 'open-choice' })).toBe(true);
  });
});

test('isQuestionEnabled', () => {
  expect(
    isQuestionEnabled(
      {
        linkId: 'q3',
        type: 'string',
        enableBehavior: 'any',
        enableWhen: [
          {
            question: 'q1',
            operator: '=',
            answerString: 'Yes',
          },
          {
            question: 'q2',
            operator: '=',
            answerString: 'Yes',
          },
        ],
      },
      [
        {
          linkId: 'q1',
          answer: [{ valueString: 'No' }],
        },
        {
          linkId: 'q2',
          answer: [{ valueString: 'Yes' }],
        },
      ]
    )
  ).toBe(true);
});

describe('isQuestionEnabled', () => {
  test('enableBehavior=any, match', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableBehavior: 'any',
          enableWhen: [
            {
              question: 'q1',
              operator: '=',
              answerString: 'Yes',
            },
            {
              question: 'q2',
              operator: '=',
              answerString: 'Yes',
            },
          ],
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueString: 'No' }],
          },
          {
            linkId: 'q2',
            answer: [{ valueString: 'Yes' }],
          },
        ]
      )
    ).toBe(true);
  });

  test('enableBehavior=any, no match', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableBehavior: 'any',
          enableWhen: [
            {
              question: 'q1',
              answerString: 'Yes',
              operator: '=',
            },
            {
              question: 'q2',
              answerString: 'Yes',
              operator: '=',
            },
          ],
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueString: 'No' }],
          },
          {
            linkId: 'q2',
            answer: [{ valueString: 'No' }],
          },
        ]
      )
    ).toBe(false);
  });

  test('enableBehavior=all, match', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableBehavior: 'all',
          enableWhen: [
            {
              question: 'q1',
              answerString: 'Yes',
              operator: '=',
            },
            {
              question: 'q2',
              answerString: 'Yes',
              operator: '=',
            },
          ],
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueString: 'Yes' }],
          },
          {
            linkId: 'q2',
            answer: [{ valueString: 'Yes' }],
          },
        ]
      )
    ).toBe(true);
  });

  test('enableBehavior=all, no match', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableBehavior: 'all',
          enableWhen: [
            {
              question: 'q1',
              answerString: 'Yes',
              operator: '=',
            },
            {
              question: 'q2',
              answerString: 'Yes',
              operator: '=',
            },
          ],
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueString: 'No' }],
          },
          {
            linkId: 'q2',
            answer: [{ valueString: 'Yes' }],
          },
        ]
      )
    ).toBe(false);
  });

  test('enableBehavior=any, no match with multiple answers', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableBehavior: 'any',
          enableWhen: [
            {
              question: 'q1',
              answerString: 'Yes',
              operator: '=',
            },
            {
              question: 'q2',
              answerString: 'Yes',
              operator: '=',
            },
          ],
        },

        [
          {
            linkId: 'q1',
            answer: [{ valueString: 'No' }, { valueString: 'Maybe' }],
          },
          {
            linkId: 'q2',
            answer: [{ valueString: 'No' }, { valueString: 'Maybe' }],
          },
        ]
      )
    ).toBe(false);
  });

  test('enableBehavior=all, no match with multiple answers', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableBehavior: 'all',
          enableWhen: [
            {
              question: 'q1',
              answerString: 'Yes',
              operator: '=',
            },
            {
              question: 'q2',
              answerString: 'Yes',
              operator: '=',
            },
          ],
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueString: 'No' }, { valueString: 'Maybe' }],
          },
          {
            linkId: 'q2',
            answer: [{ valueString: 'No' }, { valueString: 'Maybe' }],
          },
        ]
      )
    ).toBe(false);
  });

  test('enableBehavior=any, one match with multiple answers', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableBehavior: 'any',
          enableWhen: [
            {
              question: 'q1',
              answerString: 'Yes',
              operator: '=',
            },
            {
              question: 'q2',
              answerString: 'Yes',
              operator: '=',
            },
          ],
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueString: 'No' }, { valueString: 'Yes' }],
          },
          {
            linkId: 'q2',
            answer: [{ valueString: 'No' }, { valueString: 'Maybe' }],
          },
        ]
      )
    ).toBe(true);
  });

  test('enableBehavior=all, one non-match with multiple answers', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableBehavior: 'all',
          enableWhen: [
            {
              question: 'q1',
              answerString: 'Yes',
              operator: '=',
            },
            {
              question: 'q2',
              answerString: 'Yes',
              operator: '=',
            },
          ],
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueString: 'Yes' }, { valueString: 'Yes' }],
          },
          {
            linkId: 'q2',
            answer: [{ valueString: 'No' }, { valueString: 'Maybe' }],
          },
        ]
      )
    ).toBe(false);
  });

  test('enableBehavior=all, all match with multiple answers', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableBehavior: 'all',
          enableWhen: [
            {
              question: 'q1',
              answerString: 'Yes',
              operator: '=',
            },
            {
              question: 'q2',
              answerString: 'Yes',
              operator: '=',
            },
          ],
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueString: 'Yes' }, { valueString: 'Yes' }],
          },
          {
            linkId: 'q2',
            answer: [{ valueString: 'Yes' }, { valueString: 'Yes' }],
          },
        ]
      )
    ).toBe(true);
  });

  test('enableBehavior=any, enableWhen `exists` operator, `answerBoolean` = true, answer present', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen: [
            {
              question: 'q1',
              operator: 'exists',
              answerBoolean: true,
            },
          ],
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueString: 'Yes' }],
          },
          {
            linkId: 'q2',
            answer: [{ valueString: 'No' }],
          },
        ]
      )
    ).toBe(true);
  });

  test('enableBehavior=any, enableWhen `exists` operator, `answerBoolean` = false, answer present', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen: [
            {
              question: 'q1',
              operator: 'exists',
              answerBoolean: false,
            },
          ],
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueString: 'Yes' }],
          },
          {
            linkId: 'q2',
            answer: [{ valueString: 'No' }],
          },
        ]
      )
    ).toBe(false);
  });

  test('enableBehavior=any, enableWhen `exists` operator, `answerBoolean` = true, answer missing', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen: [
            {
              question: 'q1',
              operator: 'exists',
              answerBoolean: true,
            },
          ],
        },
        [
          {
            linkId: 'q2',
            answer: [{ valueString: 'No' }],
          },
        ]
      )
    ).toBe(false);
  });

  test('enableBehavior=any, enableWhen `exists` operator, `answerBoolean` = false, answer missing', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen: [
            {
              question: 'q1',
              operator: 'exists',
              answerBoolean: false,
            },
          ],
        },
        [
          {
            linkId: 'q2',
            answer: [{ valueString: 'No' }],
          },
        ]
      )
    ).toBe(true);
  });

  test('enableBehavior=any, enableWhen `exists` operator, `answerBoolean` = false, answer missing', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen: [
            {
              question: 'q1',
              operator: 'exists',
              answerBoolean: false,
            },
          ],
        },
        [
          {
            linkId: 'q2',
            answer: [{ valueString: 'No' }],
          },
        ]
      )
    ).toBe(true);
  });

  test('enableBehavior=any, enableWhen `exists` operator, `answerBoolean` = false, answer missing', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen: [
            {
              question: 'q1',
              operator: 'exists',
              answerBoolean: false,
            },
          ],
        },
        [
          {
            linkId: 'q2',
            answer: [{ valueString: 'No' }],
          },
        ]
      )
    ).toBe(true);
  });

  test('enableBehavior=any, enableWhen `exists` operator, `answerBoolean` = true, multiple answers present', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen: [
            {
              question: 'q1',
              operator: 'exists',
              answerBoolean: true,
            },
          ],
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueString: 'Yes' }, { valueString: 'No' }],
          },
          {
            linkId: 'q2',
            answer: [{ valueString: 'No' }],
          },
        ]
      )
    ).toBe(true);
  });

  test('enableBehavior=any, enableWhen `exists` operator, `answerBoolean` = false, multiple answers present', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen: [
            {
              question: 'q1',
              operator: 'exists',
              answerBoolean: false,
            },
          ],
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueString: 'Yes' }, { valueString: 'No' }],
          },
          {
            linkId: 'q2',
            answer: [{ valueString: 'No' }],
          },
        ]
      )
    ).toBe(false);
  });

  test('enableBehavior=any, enableWhen `exists` operator, `answerBoolean` = true, one of the answers missing', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen: [
            {
              question: 'q3',
              operator: 'exists',
              answerBoolean: true,
            },
          ],
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueString: 'Yes' }, { valueString: 'No' }],
          },
          {
            linkId: 'q2',
            answer: [{ valueString: 'No' }],
          },
        ]
      )
    ).toBe(false);
  });

  test('enableBehavior=any, enableWhen `exists` operator, `answerBoolean` = false, one of the answers missing', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen: [
            {
              question: 'q3',
              operator: 'exists',
              answerBoolean: false,
            },
          ],
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueString: 'Yes' }, { valueString: 'No' }],
          },
          {
            linkId: 'q2',
            answer: [{ valueString: 'No' }],
          },
        ]
      )
    ).toBe(true);
  });

  test('enableBehavior=any, enableWhen `!=` operator', () => {
    const enableWhen = [
      {
        question: 'q1',
        operator: '!=',
        answerString: 'Yes',
      },
    ] satisfies QuestionnaireItemEnableWhen[];

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueString: 'No' }],
          },
        ]
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueString: 'Yes' }],
          },
        ]
      )
    ).toBe(false);
  });

  test('enableBehavior=any, enableWhen `>` operator', () => {
    const enableWhen = [
      {
        question: 'q1',
        operator: '>',
        answerInteger: 3,
      },
    ] satisfies QuestionnaireItemEnableWhen[];

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueInteger: 4 }],
          },
        ]
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueInteger: 2 }],
          },
        ]
      )
    ).toBe(false);
  });

  test('enableBehavior=any, enableWhen `>=` operator', () => {
    const enableWhen = [
      {
        question: 'q1',
        operator: '>=',
        answerInteger: 3,
      },
    ] satisfies QuestionnaireItemEnableWhen[];

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueInteger: 4 }],
          },
        ]
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueInteger: 3 }],
          },
        ]
      )
    ).toBe(true);
  });

  test('enableBehavior=any, enableWhen `<` operator', () => {
    const enableWhen = [
      {
        question: 'q1',
        operator: '<',
        answerInteger: 3,
      },
    ] satisfies QuestionnaireItemEnableWhen[];

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueInteger: 2 }],
          },
        ]
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueInteger: 3 }],
          },
        ]
      )
    ).toBe(false);
  });

  test('enableBehavior=any, enableWhen `<=` operator', () => {
    const enableWhen = [
      {
        question: 'q1',
        operator: '<=',
        answerInteger: 3,
      },
    ] satisfies QuestionnaireItemEnableWhen[];

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueInteger: 2 }],
          },
        ]
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueInteger: 3 }],
          },
        ]
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueInteger: 4 }],
          },
        ]
      )
    ).toBe(false);
  });

  test('enableBehavior=any, enableWhen `=` operator for `valueCoding`', () => {
    const enableWhen = [
      { question: 'q1', operator: '=', answerCoding: { code: 'MEDPLUM123' } },
    ] satisfies QuestionnaireItemEnableWhen[];

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueCoding: { code: 'MEDPLUM123' } }],
          },
        ]
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueCoding: { code: 'MEDPLUM123', display: 'Medplum123' } }],
          },
        ]
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueCoding: { code: 'NOT_MEDPLUM123', display: 'Medplum123' } }],
          },
        ]
      )
    ).toBe(false);
  });

  test('enableBehavior=any, enableWhen `!=` operator for `valueCoding`', () => {
    const enableWhen = [
      { question: 'q1', operator: '!=', answerCoding: { code: 'MEDPLUM123' } },
    ] satisfies QuestionnaireItemEnableWhen[];

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueCoding: { code: 'NOT_MEDPLUM123' } }],
          },
        ]
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueCoding: { code: 'NOT_MEDPLUM123', display: 'Medplum123' } }],
          },
        ]
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueCoding: { code: 'MEDPLUM123', display: 'Medplum123' } }],
          },
        ]
      )
    ).toBe(false);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueCoding: { code: 'MEDPLUM123' } }],
          },
        ]
      )
    ).toBe(false);
  });

  test('multi-select map selected values', () => {
    const selected = ['value1', 'value2'];
    const propertyName = 'valueString';
    const item: QuestionnaireItem = {
      linkId: 'q3',
      type: 'string',
      answerOption: [
        {
          valueString: 'value1',
        },
        {
          valueString: 'value2',
        },
      ],
    };

    const result = getNewMultiSelectValues(selected, propertyName, item);

    expect(result).toEqual([{ valueString: 'value1' }, { valueString: 'value2' }]);
  });

  test('multi-select non selected values', () => {
    const selected = ['nonMatchingValue'];
    const propertyName = 'valueString';
    const item: QuestionnaireItem = {
      linkId: 'q3',
      type: 'string',
      answerOption: [
        {
          valueString: 'value1',
        },
        {
          valueString: 'value2',
        },
      ],
    };

    const result = getNewMultiSelectValues(selected, propertyName, item);

    expect(result).toEqual([{ valueString: undefined }]);
  });

  test('multi-select empty array', () => {
    const selected: string[] = [];
    const propertyName = 'valueString';
    const item: QuestionnaireItem = {
      linkId: 'q3',
      type: 'string',
      answerOption: [{ valueString: 'value1' }, { valueString: 'value2' }],
    };

    const result = getNewMultiSelectValues(selected, propertyName, item);

    expect(result).toEqual([]);
  });

  test('multi-select with value coding', () => {
    const selected = ['code1'];
    const propertyName = 'valueCoding';
    const item: QuestionnaireItem = {
      linkId: 'q3',
      type: 'string',
      answerOption: [
        {
          valueCoding: { code: 'code1' },
        },
        {
          valueCoding: { code: 'code2' },
        },
      ],
    };

    const result = getNewMultiSelectValues(selected, propertyName, item);
    expect(result).toEqual([{ valueCoding: { code: 'code1' } }]);
  });

  test('multi-select with non existing values', () => {
    const selected = ['value1'];
    const propertyName = 'nonExistingProperty';
    const item: QuestionnaireItem = {
      linkId: 'q3',
      type: 'string',
      answerOption: [{ valueString: 'value1' }],
    };

    const result = getNewMultiSelectValues(selected, propertyName, item);

    expect(result).toEqual([{ nonExistingProperty: undefined }]);
  });

  test('Reference with display', () => {
    const reference = { type: 'valueReference', value: { reference: 'Patient/123', display: 'Patient 123' } };
    expect(formatReferenceString(reference)).toBe('Patient 123');
  });

  test('Reference with no display', () => {
    const reference = { type: 'valueReference', value: { reference: 'Patient/123', display: undefined } };
    expect(formatReferenceString(reference)).toBe('Patient/123');
  });

  test('Reference String with no display or reference', () => {
    const reference = { type: 'valueReference', value: { reference: undefined, display: undefined, id: '123' } };
    expect(formatReferenceString(reference)).toBe('{"id":"123"}');
  });
});
