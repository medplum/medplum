import { isChoiceQuestion } from './questionnaire';

describe('QuestionnaireUtils', () => {
  test('isChoiceQuestion', () => {
    expect(isChoiceQuestion({ type: 'string' })).toBe(false);
    expect(isChoiceQuestion({ type: 'choice' })).toBe(true);
    expect(isChoiceQuestion({ type: 'open-choice' })).toBe(true);
  });
});
