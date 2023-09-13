import { QuestionnaireItemEnableWhen } from '@medplum/fhirtypes';
import { isChoiceQuestion, isQuestionEnabled } from './questionnaire';

describe('QuestionnaireUtils', () => {
  test('isChoiceQuestion', () => {
    expect(isChoiceQuestion({ type: 'string' })).toBe(false);
    expect(isChoiceQuestion({ type: 'choice' })).toBe(true);
    expect(isChoiceQuestion({ type: 'open-choice' })).toBe(true);
  });
});

test('isQuestionEnabled', () => {
  // enableBehavior=any, match
  expect(
    isQuestionEnabled(
      {
        enableBehavior: 'any',
        enableWhen: [
          {
            question: 'q1',
            answerString: 'Yes',
          },
          {
            question: 'q2',
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
      // {
      //   q1: [{ valueString: 'No' }],
      //   q2: [{ valueString: 'Yes' }],
      // }
    )
  ).toBe(true);
});

describe('isQuestionEnabled', () => {
  test('enableBehavior=any, match', () => {
    expect(
      isQuestionEnabled(
        {
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
            answer: [{ valueString: 'Yes' }],
          },
        ]
        // {
        //   q1: [{ valueString: 'No' }],
        //   q2: [{ valueString: 'Yes' }],
        // }
      )
    ).toBe(true);
  });

  test('enableBehavior=any, no match', () => {
    expect(
      isQuestionEnabled(
        {
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
        // {
        //   q1: [{ valueString: 'No' }],
        //   q2: [{ valueString: 'No' }],
        // }
      )
    ).toBe(false);
  });

  test('enableBehavior=all, match', () => {
    expect(
      isQuestionEnabled(
        {
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
        // {
        //   q1: [{ valueString: 'Yes' }],
        //   q2: [{ valueString: 'Yes' }],
        // }
      )
    ).toBe(true);
  });

  test('enableBehavior=all, no match', () => {
    expect(
      isQuestionEnabled(
        {
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
        // },
        // {
        //   q1: [{ valueString: 'Yes' }],
        //   q2: [{ valueString: 'No' }],
        // }
      )
    ).toBe(false);
  });

  test('enableBehavior=any, no match with multiple answers', () => {
    expect(
      isQuestionEnabled(
        {
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
            answer: [{ valueString: 'No' }, {valueString: 'Maybe'}],
          },
          {
            linkId: 'q2',
            answer: [{ valueString: 'No' }, {valueString: 'Maybe'}],
          },
        ]
        // {
        //   q1: [{ valueString: 'No' }, { valueString: 'Maybe' }],
        //   q2: [{ valueString: 'No' }, { valueString: 'Maybe' }],
        // }
      )
    ).toBe(false);
  });

  test('enableBehavior=all, no match with multiple answers', () => {
    expect(
      isQuestionEnabled(
        {
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
        // {
        //   q1: [{ valueString: 'No' }, { valueString: 'Maybe' }],
        //   q2: [{ valueString: 'No' }, { valueString: 'Maybe' }],
        // }
      )
    ).toBe(false);
  });

  test('enableBehavior=any, one match with multiple answers', () => {
    expect(
      isQuestionEnabled(
        {
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
        // {
        //   q1: [{ valueString: 'No' }, { valueString: 'Yes' }],
        //   q2: [{ valueString: 'No' }, { valueString: 'Maybe' }],
        // }
      )
    ).toBe(true);
  });

  test('enableBehavior=all, one non-match with multiple answers', () => {
    expect(
      isQuestionEnabled(
        {
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
        // {
        //   q1: [{ valueString: 'Yes' }, { valueString: 'Yes' }],
        //   q2: [{ valueString: 'No' }, { valueString: 'Maybe' }],
        // }
      )
    ).toBe(false);
  });

  test('enableBehavior=all, all match with multiple answers', () => {
    expect(
      isQuestionEnabled(
        {
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
        // {
        //   q1: [{ valueString: 'Yes' }, { valueString: 'Yes' }],
        //   q2: [{ valueString: 'Yes' }, { valueString: 'Yes' }],
        // }
      )
    ).toBe(true);
  });

  test('enableBehavior=any, enableWhen `exists` operator, `answerBoolean` = true, answer present', () => {
    expect(
      isQuestionEnabled(
        {
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
        // {
        //   q1: [{ valueString: 'Yes' }],
        //   q2: [{ valueString: 'No' }],
        // }
      )
    ).toBe(true);
  });

  test('enableBehavior=any, enableWhen `exists` operator, `answerBoolean` = false, answer present', () => {
    expect(
      isQuestionEnabled(
        {
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
        // {
        //   q1: [{ valueString: 'Yes' }],
        //   q2: [{ valueString: 'No' }],
        // }
      )
    ).toBe(false);
  });

  test('enableBehavior=any, enableWhen `exists` operator, `answerBoolean` = true, answer missing', () => {
    expect(
      isQuestionEnabled(
        {
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
        // {
        //   q2: [{ valueString: 'No' }],
        // }
      )
    ).toBe(false);
  });

  test('enableBehavior=any, enableWhen `exists` operator, `answerBoolean` = false, answer missing', () => {
    expect(
      isQuestionEnabled(
        {
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
        // {
        //   q2: [{ valueString: 'No' }],
        // }
      )
    ).toBe(true);
  });

  test('enableBehavior=any, enableWhen `exists` operator, `answerBoolean` = false, answer missing', () => {
    expect(
      isQuestionEnabled(
        {
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
        // {
        //   q2: [{ valueString: 'No' }],
        // }
      )
    ).toBe(true);
  });

  test('enableBehavior=any, enableWhen `exists` operator, `answerBoolean` = false, answer missing', () => {
    expect(
      isQuestionEnabled(
        {
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
        // {
        //   q2: [{ valueString: 'No' }],
        // }
      )
    ).toBe(true);
  });

  test('enableBehavior=any, enableWhen `exists` operator, `answerBoolean` = true, multiple answers present', () => {
    expect(
      isQuestionEnabled(
        {
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
        // {
        //   q1: [{ valueString: 'Yes' }, { valueString: 'No' }],
        //   q2: [{ valueString: 'No' }],
        // }
      )
    ).toBe(true);
  });

  test('enableBehavior=any, enableWhen `exists` operator, `answerBoolean` = false, multiple answers present', () => {
    expect(
      isQuestionEnabled(
        {
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
        // {
        //   q1: [{ valueString: 'Yes' }, { valueString: 'No' }],
        //   q2: [{ valueString: 'No' }],
        // }
      )
    ).toBe(false);
  });

  test('enableBehavior=any, enableWhen `exists` operator, `answerBoolean` = true, one of the answers missing', () => {
    expect(
      isQuestionEnabled(
        {
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
        // {
        //   q1: [{ valueString: 'Yes' }, { valueString: 'No' }],
        //   q2: [{ valueString: 'No' }],
        // }
      )
    ).toBe(false);
  });

  test('enableBehavior=any, enableWhen `exists` operator, `answerBoolean` = false, one of the answers missing', () => {
    expect(
      isQuestionEnabled(
        {
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
        // {
        //   q1: [{ valueString: 'Yes' }, { valueString: 'No' }],
        //   q2: [{ valueString: 'No' }],
        // }
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
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueString: 'No' }],
          },
        ]
        // {
        //   q1: [{ valueString: 'No' }],
        // }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueString: 'Yes' }],
          },
        ]
        // {
        //   q1: [{ valueString: 'Yes' }],
        // }
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
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueInteger: 4 }],
          },
        ]
        // {
        //   q1: [{ valueInteger: 4 }],
        // }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueInteger: 2 }],
          },
        ]
        // {
        //   q1: [{ valueInteger: 2 }],
        // }
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
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueInteger: 4 }],
          },
        ]
        // {
        //   q1: [{ valueInteger: 4 }],
        // }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueInteger: 3 }],
          },
        ]
        // {
        //   q1: [{ valueInteger: 3 }],
        // }
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
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueInteger: 2 }],
          },
        ]
        // {
        //   q1: [{ valueInteger: 2 }],
        // }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueInteger: 3 }],
          },
        ]
        // {
        //   q1: [{ valueInteger: 3 }],
        // }
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
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueInteger: 2 }],
          },
        ]
        // {
        //   q1: [{ valueInteger: 2 }],
        // }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueInteger: 3 }],
          },
        ]
        // {
        //   q1: [{ valueInteger: 3 }],
        // }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueInteger: 4 }],
          },
        ]
        // {
        //   q1: [{ valueInteger: 4 }],
        // }
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
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueCoding: { code: 'MEDPLUM123' } }],
          },
        ]
        // {
        //   q1: [{ valueCoding: { code: 'MEDPLUM123' } }],
        // }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueCoding: { code: 'MEDPLUM123', display: 'Medplum123' } }],
          },
        ]
        // {
        //   q1: [{ valueCoding: { code: 'MEDPLUM123', display: 'Medplum123' } }],
        // }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueCoding: { code: 'NOT_MEDPLUM123', display: 'Medplum123' } }],
          },
        ]
        // {
        //   q1: [{ valueCoding: { code: 'NOT_MEDPLUM123', display: 'Medplum123' } }],
        // }
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
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueCoding: { code: 'NOT_MEDPLUM123' } }],
          },
        ]
        // {
        //   q1: [{ valueCoding: { code: 'NOT_MEDPLUM123' } }],
        // }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueCoding: { code: 'NOT_MEDPLUM123', display: 'Medplum123' } }],
          },
        ]
        // {
        //   q1: [{ valueCoding: { code: 'NOT_MEDPLUM123', display: 'Medplum123' } }],
        // }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueCoding: { code: 'MEDPLUM123', display: 'Medplum123' } }],
          },
        ]
        // {
        //   q1: [{ valueCoding: { code: 'MEDPLUM123', display: 'Medplum123' } }],
        // }
      )
    ).toBe(false);

    expect(
      isQuestionEnabled(
        {
          enableWhen,
        },
        [
          {
            linkId: 'q1',
            answer: [{ valueCoding: { code: 'MEDPLUM123' } }],
          },
        ]
        // {
        //   q1: [{ valueCoding: { code: 'MEDPLUM123' } }],
        // }
      )
    ).toBe(false);
  });
});
