// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { TypedValue } from '@medplum/core';
import {
  Encounter,
  Patient,
  QuestionnaireItem,
  QuestionnaireItemEnableWhen,
  Reference,
  ResourceType,
} from '@medplum/fhirtypes';
import {
  buildInitialResponse,
  evaluateCalculatedExpressionsInQuestionnaire,
  getNewMultiSelectValues,
  getQuestionnaireItemReferenceFilter,
  getQuestionnaireItemReferenceTargetTypes,
  isChoiceQuestion,
  isQuestionEnabled,
  setQuestionnaireItemReferenceTargetTypes,
  typedValueToResponseItem,
} from './utils';

describe('Questionnaire Utils', () => {
  test('isChoiceQuestion', () => {
    expect(isChoiceQuestion({ linkId: 'q3', type: 'string' })).toBe(false);
    expect(isChoiceQuestion({ linkId: 'q3', type: 'choice' })).toBe(true);
    expect(isChoiceQuestion({ linkId: 'q3', type: 'open-choice' })).toBe(true);
  });
});

describe('isQuestionEnabled', () => {
  test('default true', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
        },
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [],
        }
      )
    ).toBe(true);
  });

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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueString: 'No' }],
            },
            {
              linkId: 'q2',
              answer: [{ valueString: 'Yes' }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueString: 'No' }],
            },
            {
              linkId: 'q2',
              answer: [{ valueString: 'No' }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueString: 'Yes' }],
            },
            {
              linkId: 'q2',
              answer: [{ valueString: 'Yes' }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueString: 'Yes' }],
            },
            {
              linkId: 'q2',
              answer: [{ valueString: 'No' }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueString: 'No' }, { valueString: 'Maybe' }],
            },
            {
              linkId: 'q2',
              answer: [{ valueString: 'No' }, { valueString: 'Maybe' }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueString: 'No' }, { valueString: 'Maybe' }],
            },
            {
              linkId: 'q2',
              answer: [{ valueString: 'No' }, { valueString: 'Maybe' }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueString: 'No' }, { valueString: 'Yes' }],
            },
            {
              linkId: 'q2',
              answer: [{ valueString: 'No' }, { valueString: 'Maybe' }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueString: 'Yes' }, { valueString: 'Yes' }],
            },
            {
              linkId: 'q2',
              answer: [{ valueString: 'No' }, { valueString: 'Maybe' }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueString: 'Yes' }, { valueString: 'Yes' }],
            },
            {
              linkId: 'q2',
              answer: [{ valueString: 'Yes' }, { valueString: 'Yes' }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueString: 'Yes' }],
            },
            {
              linkId: 'q2',
              answer: [{ valueString: 'No' }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueString: 'Yes' }],
            },
            {
              linkId: 'q2',
              answer: [{ valueString: 'No' }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q2',
              answer: [{ valueString: 'No' }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q2',
              answer: [{ valueString: 'No' }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q2',
              answer: [{ valueString: 'No' }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q2',
              answer: [{ valueString: 'No' }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueString: 'Yes' }, { valueString: 'No' }],
            },
            {
              linkId: 'q2',
              answer: [{ valueString: 'No' }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueString: 'Yes' }, { valueString: 'No' }],
            },
            {
              linkId: 'q2',
              answer: [{ valueString: 'No' }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueString: 'Yes' }, { valueString: 'No' }],
            },
            {
              linkId: 'q2',
              answer: [{ valueString: 'No' }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueString: 'Yes' }, { valueString: 'No' }],
            },
            {
              linkId: 'q2',
              answer: [{ valueString: 'No' }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueString: 'No' }],
            },
          ],
        }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueString: 'Yes' }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueInteger: 4 }],
            },
          ],
        }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueInteger: 2 }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueInteger: 4 }],
            },
          ],
        }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueInteger: 3 }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueInteger: 2 }],
            },
          ],
        }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueInteger: 3 }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueInteger: 2 }],
            },
          ],
        }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueInteger: 3 }],
            },
          ],
        }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueInteger: 4 }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueCoding: { code: 'MEDPLUM123' } }],
            },
          ],
        }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueCoding: { code: 'MEDPLUM123', display: 'Medplum123' } }],
            },
          ],
        }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueCoding: { code: 'NOT_MEDPLUM123', display: 'Medplum123' } }],
            },
          ],
        }
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
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueCoding: { code: 'NOT_MEDPLUM123' } }],
            },
          ],
        }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueCoding: { code: 'NOT_MEDPLUM123', display: 'Medplum123' } }],
            },
          ],
        }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueCoding: { code: 'MEDPLUM123', display: 'Medplum123' } }],
            },
          ],
        }
      )
    ).toBe(false);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          enableWhen,
        },
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueCoding: { code: 'MEDPLUM123' } }],
            },
          ],
        }
      )
    ).toBe(false);
  });

  test('expression evaluation', () => {
    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          extension: [
            {
              url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-enableWhenExpression',
              valueExpression: {
                language: 'text/fhirpath',
                expression:
                  "%resource.item.where(linkId = 'q1').answer.valueCoding.code = 'MEDPLUM123' and %resource.item.where(linkId = 'q2').answer.valueString = 'Female'",
              },
            },
          ],
        },
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueCoding: { code: 'MEDPLUM123' } }],
            },
            {
              linkId: 'q2',
              answer: [{ valueString: 'Female' }],
            },
          ],
        }
      )
    ).toBe(true);

    expect(
      isQuestionEnabled(
        {
          linkId: 'q3',
          type: 'string',
          extension: [
            {
              url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-enableWhenExpression',
              valueExpression: {
                language: 'text/fhirpath',
                expression:
                  "%resource.item.where(linkId = 'q1').answer.valueCoding.code = 'MEDPLUM123' and %resource.item.where(linkId = 'q2').answer.valueString = 'Female'",
              },
            },
          ],
        },
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'q1',
              answer: [{ valueCoding: { code: 'DIFFERENT_CODE' } }],
            },
            {
              linkId: 'q2',
              answer: [{ valueString: 'Female' }],
            },
          ],
        }
      )
    ).toBe(false);
  });
});

describe('getNewMultiSelectValues', () => {
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

    expect(result).toStrictEqual([{ valueString: 'value1' }, { valueString: 'value2' }]);
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

    expect(result).toStrictEqual([]);
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

    expect(result).toStrictEqual([]);
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
    expect(result).toStrictEqual([{ valueCoding: { code: 'code1' } }]);
  });
});

describe('typedValueToResponseItem', () => {
  test('returns undefined for missing type', () => {
    const item: QuestionnaireItem = { linkId: '1', type: 'integer' };
    const value = { value: 'text' };
    const result = typedValueToResponseItem(item, value as unknown as TypedValue);
    expect(result).toBeUndefined();
  });

  test('returns correct value for type boolean', () => {
    const item: QuestionnaireItem = { linkId: '1', type: 'boolean' };
    const value = { type: 'boolean', value: true };
    const result = typedValueToResponseItem(item, value);
    expect(result).toEqual({ valueBoolean: true });
  });

  test('returns undefined for mismatched boolean type', () => {
    const item: QuestionnaireItem = { linkId: '1', type: 'boolean' };
    const value = { type: 'string', value: 'text' };
    const result = typedValueToResponseItem(item, value);
    expect(result).toBeUndefined();
  });

  test('returns correct value for type date', () => {
    const item: QuestionnaireItem = { linkId: '1', type: 'date' };
    const value = { type: 'date', value: '2024-01-01' };
    const result = typedValueToResponseItem(item, value);
    expect(result).toEqual({ valueDate: '2024-01-01' });
  });

  test('returns correct value for type dateTime', () => {
    const item: QuestionnaireItem = { linkId: '1', type: 'dateTime' };
    const value = { type: 'dateTime', value: '2024-01-01T12:00:00Z' };
    const result = typedValueToResponseItem(item, value);
    expect(result).toEqual({ valueDateTime: '2024-01-01T12:00:00Z' });
  });

  test('returns correct value for type time', () => {
    const item: QuestionnaireItem = { linkId: '1', type: 'time' };
    const value = { type: 'time', value: '12:00:00' };
    const result = typedValueToResponseItem(item, value);
    expect(result).toEqual({ valueTime: '12:00:00' });
  });

  test('returns correct value for type url', () => {
    const item: QuestionnaireItem = { linkId: '1', type: 'url' };
    const value = { type: 'url', value: 'http://example.com' };
    const result = typedValueToResponseItem(item, value);
    expect(result).toEqual({ valueUrl: 'http://example.com' });
  });

  test('returns correct value for type text', () => {
    const item: QuestionnaireItem = { linkId: '1', type: 'text' };
    const value = { type: 'string', value: 'Sample text' };
    const result = typedValueToResponseItem(item, value);
    expect(result).toEqual({ valueString: 'Sample text' });
  });

  test('returns correct value for type attachment', () => {
    const item: QuestionnaireItem = { linkId: '1', type: 'attachment' };
    const value = { type: 'Attachment', value: { file: 'file.pdf' } };
    const result = typedValueToResponseItem(item, value);
    expect(result).toEqual({ valueAttachment: { file: 'file.pdf' } });
  });

  test('returns correct value for type reference', () => {
    const item: QuestionnaireItem = { linkId: '1', type: 'reference' };
    const value = { type: 'Reference', value: { ref: '123' } };
    const result = typedValueToResponseItem(item, value);
    expect(result).toEqual({ valueReference: { ref: '123' } });
  });

  test('returns correct value for type quantity', () => {
    const item: QuestionnaireItem = { linkId: '1', type: 'quantity' };
    const value = { type: 'Quantity', value: { value: 10, unit: 'mg' } };
    const result = typedValueToResponseItem(item, value);
    expect(result).toEqual({ valueQuantity: { value: 10, unit: 'mg' } });
  });

  test('returns undefined for unsupported type', () => {
    const item: QuestionnaireItem = { linkId: '1', type: 'unsupported' as any };
    const value = { type: 'string', value: 'text' };
    const result = typedValueToResponseItem(item, value);
    expect(result).toBeUndefined();
  });

  test('returns any type for choice question', () => {
    const item: QuestionnaireItem = { linkId: '1', type: 'choice' };
    const value = { type: 'string', value: 'text' };
    const result = typedValueToResponseItem(item, value);
    expect(result).toEqual({ valueString: 'text' });
  });

  test('returns any type for open-choice question', () => {
    const item: QuestionnaireItem = { linkId: '1', type: 'open-choice' };
    const value = { type: 'string', value: 'text' };
    const result = typedValueToResponseItem(item, value);
    expect(result).toEqual({ valueString: 'text' });
  });

  test('returns undefined for unsupported string type', () => {
    const item: QuestionnaireItem = { linkId: '1', type: 'string' };
    const value = { type: 'integer', value: 10 };
    const result = typedValueToResponseItem(item, value);
    expect(result).toBeUndefined();
  });
});

describe('evaluateCalculatedExpressionsInQuestionnaire', () => {
  test('Boolean type with condition', () => {
    const items: QuestionnaireItem[] = [
      {
        id: 'q1',
        linkId: 'q1',
        type: 'boolean',
        text: 'Is Age Over 18?',
        extension: [
          {
            url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
            valueExpression: {
              expression: '20 > 18',
              language: 'text/fhirpath',
            },
          },
        ],
      },
    ];

    const response = buildInitialResponse({ resourceType: 'Questionnaire', status: 'active', item: items });
    evaluateCalculatedExpressionsInQuestionnaire(items, response);
    expect(response.item).toMatchObject([
      {
        linkId: 'q1',
        text: 'Is Age Over 18?',
        answer: [{ valueBoolean: true }],
      },
    ]);
  });

  test('Date type with today() function', () => {
    const items: QuestionnaireItem[] = [
      {
        id: 'q2',
        linkId: 'q2',
        type: 'date',
        text: "Today's Date",
        extension: [
          {
            url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
            valueExpression: {
              expression: 'today()',
              language: 'text/fhirpath',
            },
          },
        ],
      },
    ];

    const response = buildInitialResponse({ resourceType: 'Questionnaire', status: 'active', item: items });
    evaluateCalculatedExpressionsInQuestionnaire(items, response);
    const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
    expect(response.item).toMatchObject([
      {
        linkId: 'q2',
        text: "Today's Date",
        answer: [{ valueDate: today }],
      },
    ]);
  });

  test('Integer type with addition', () => {
    const items: QuestionnaireItem[] = [
      {
        id: 'q3',
        linkId: 'q3',
        type: 'integer',
        text: 'Age Next Year',
        extension: [
          {
            url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
            valueExpression: {
              expression: '30 + 1',
              language: 'text/fhirpath',
            },
          },
        ],
      },
    ];

    const response = buildInitialResponse({ resourceType: 'Questionnaire', status: 'active', item: items });
    evaluateCalculatedExpressionsInQuestionnaire(items, response);
    expect(response.item).toMatchObject([
      {
        linkId: 'q3',
        text: 'Age Next Year',
        answer: [{ valueInteger: 31 }],
      },
    ]);
  });

  test('Decimal type with division', () => {
    const items: QuestionnaireItem[] = [
      {
        id: 'q4',
        linkId: 'q4',
        type: 'decimal',
        text: 'Half of 98',
        extension: [
          {
            url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
            valueExpression: {
              expression: '98 / 2',
              language: 'text/fhirpath',
            },
          },
        ],
      },
    ];

    const response = buildInitialResponse({ resourceType: 'Questionnaire', status: 'active', item: items });
    evaluateCalculatedExpressionsInQuestionnaire(items, response);
    expect(response.item).toMatchObject([
      {
        linkId: 'q4',
        text: 'Half of 98',
        answer: [{ valueDecimal: 49.0 }],
      },
    ]);
  });

  test('String type with concatenation', () => {
    const items: QuestionnaireItem[] = [
      {
        id: 'q5',
        linkId: 'q5',
        type: 'string',
        text: 'Full Name',
        extension: [
          {
            url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
            valueExpression: {
              expression: "'John' + ' ' + 'Doe'",
              language: 'text/fhirpath',
            },
          },
        ],
      },
    ];

    const response = buildInitialResponse({ resourceType: 'Questionnaire', status: 'active', item: items });
    evaluateCalculatedExpressionsInQuestionnaire(items, response);
    expect(response.item).toMatchObject([
      {
        linkId: 'q5',
        text: 'Full Name',
        answer: [{ valueString: 'John Doe' }],
      },
    ]);
  });

  test('Failed to evaluate expression', () => {
    const items: QuestionnaireItem[] = [
      {
        id: 'q5',
        linkId: 'q5',
        type: 'string',
        text: 'Full Name',
        extension: [
          {
            url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
            valueExpression: {
              expression: '%fail',
              language: 'text/fhirpath',
            },
          },
        ],
      },
    ];

    const response = buildInitialResponse({ resourceType: 'Questionnaire', status: 'active', item: items });
    evaluateCalculatedExpressionsInQuestionnaire(items, response);
    expect(response.item).toMatchObject([
      {
        linkId: 'q5',
        text: 'Full Name',
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-validationError',
            valueString: 'Expression evaluation failed: FhirPathError on "%fail": Error: Undefined variable %fail',
          },
        ],
      },
    ]);
  });

  test('Nested expressions', () => {
    const items: QuestionnaireItem[] = [
      {
        linkId: 'group',
        type: 'group',
        item: [
          {
            id: 'q3',
            linkId: 'q3',
            type: 'integer',
            text: 'Age Next Year',
            extension: [
              {
                url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
                valueExpression: {
                  expression: '30 + 1',
                  language: 'text/fhirpath',
                },
              },
            ],
          },
        ],
      },
    ];

    const response = buildInitialResponse({ resourceType: 'Questionnaire', status: 'active', item: items });
    evaluateCalculatedExpressionsInQuestionnaire(items, response);
    expect(response.item).toMatchObject([
      {
        linkId: 'group',
        item: [
          {
            linkId: 'q3',
            text: 'Age Next Year',
            answer: [{ valueInteger: 31 }],
          },
        ],
      },
    ]);
  });
});

describe('getQuestionnaireItemReferenceTargetTypes', () => {
  test('No extension', () => {
    const item: QuestionnaireItem = { linkId: 'q1', type: 'reference' };
    const result = getQuestionnaireItemReferenceTargetTypes(item);
    expect(result).toEqual(undefined);
  });

  test('Extension with valueCode', () => {
    const item: QuestionnaireItem = {
      linkId: 'q1',
      type: 'reference',
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
          valueCode: 'Patient',
        },
      ],
    };
    const result = getQuestionnaireItemReferenceTargetTypes(item);
    expect(result).toEqual(['Patient']);
  });

  test('Extension with valueCodeableConcept', () => {
    const item: QuestionnaireItem = {
      linkId: 'q1',
      type: 'reference',
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
          valueCodeableConcept: {
            coding: [{ code: 'Observation' }],
          },
        },
      ],
    };
    const result = getQuestionnaireItemReferenceTargetTypes(item);
    expect(result).toEqual(['Observation']);
  });

  test('Extension with unsupported value type', () => {
    const item: QuestionnaireItem = {
      linkId: 'q1',
      type: 'reference',
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
          valueString: 'UnsupportedType',
        },
      ],
    };
    const result = getQuestionnaireItemReferenceTargetTypes(item);
    expect(result).toEqual(undefined);
  });
});

describe('setQuestionnaireItemReferenceTargetTypes', () => {
  test('No existing extension', () => {
    const item: QuestionnaireItem = { linkId: 'q1', type: 'reference' };
    const targetTypes: ResourceType[] = ['Patient', 'Observation'];
    const result = setQuestionnaireItemReferenceTargetTypes(item, targetTypes);
    expect(result.extension).toEqual([
      {
        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
        valueCodeableConcept: {
          coding: [{ code: 'Patient' }, { code: 'Observation' }],
        },
      },
    ]);
  });

  test('Remove existing extension', () => {
    const item: QuestionnaireItem = {
      linkId: 'q1',
      type: 'reference',
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
          valueCode: 'Patient',
        },
      ],
    };
    const result = setQuestionnaireItemReferenceTargetTypes(item, []);
    expect(result.extension).toEqual([]);
  });

  test('Change code to CodeableConcept', () => {
    const item: QuestionnaireItem = {
      linkId: 'q1',
      type: 'reference',
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
          valueCode: 'Patient',
        },
      ],
    };
    const targetTypes: ResourceType[] = ['Patient', 'Observation'];
    const result = setQuestionnaireItemReferenceTargetTypes(item, targetTypes);
    expect(result.extension).toEqual([
      {
        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
        valueCodeableConcept: {
          coding: [{ code: 'Patient' }, { code: 'Observation' }],
        },
      },
    ]);
  });

  test('Change CodeableConcept to code', () => {
    const item: QuestionnaireItem = {
      linkId: 'q1',
      type: 'reference',
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
          valueCodeableConcept: {
            coding: [{ code: 'Patient' }, { code: 'Observation' }],
          },
        },
      ],
    };
    const targetTypes: ResourceType[] = ['Patient'];
    const result = setQuestionnaireItemReferenceTargetTypes(item, targetTypes);
    expect(result.extension).toEqual([
      {
        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
        valueCode: 'Patient',
      },
    ]);
  });
});

describe('getQuestionnaireItemReferenceFilter', () => {
  const subject: Reference<Patient> = { reference: 'Patient/123' };
  const encounter: Reference<Encounter> = { reference: 'Encounter/456' };

  test('No extension', () => {
    const item: QuestionnaireItem = { linkId: 'q1', type: 'reference' };
    const result = getQuestionnaireItemReferenceFilter(item, subject, encounter);
    expect(result).toEqual(undefined);
  });

  test('Extension with valueString', () => {
    const item: QuestionnaireItem = {
      linkId: 'q1',
      type: 'reference',
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceFilter',
          valueString: 'subject=$subj&encounter=$encounter&active=true',
        },
      ],
    };
    const result = getQuestionnaireItemReferenceFilter(item, subject, encounter);
    expect(result).toEqual({
      subject: 'Patient/123',
      encounter: 'Encounter/456',
      active: 'true',
    });
  });

  test('Extension with unsupported value type', () => {
    const item: QuestionnaireItem = {
      linkId: 'q1',
      type: 'reference',
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceFilter',
          valueInteger: 42,
        },
      ],
    };
    const result = getQuestionnaireItemReferenceFilter(item, subject, encounter);
    expect(result).toEqual(undefined);
  });
});
