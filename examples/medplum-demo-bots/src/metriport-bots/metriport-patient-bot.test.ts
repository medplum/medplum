import { validateQuestionnaireAnswers } from './metriport-patient-bot';
import { getQuestionnaireAnswers } from '@medplum/core';
import { existingPatientQuestionnaireResponse } from './metriport-patient-bot-test-data';

describe('validateQuestionnaireAnswers', () => {
  const requiredFields = ['firstName', 'lastName', 'dob', 'genderAtBirth', 'addressLine1', 'city', 'state', 'zip'];

  const getErrorMessage = (field: string): string => {
    if (field === 'dob') {
      return 'Missing date of birth';
    }

    if (field === 'addressLine1' || field === 'city' || field === 'state' || field === 'zip') {
      return 'Missing address information';
    }

    return `Missing ${field
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
      .trim()}`;
  };

  requiredFields.forEach((field) => {
    it(`should throw error when ${field} is missing`, () => {
      const invalidResponse = { ...existingPatientQuestionnaireResponse };
      invalidResponse.item = invalidResponse.item?.filter((item) => item.linkId !== field);

      const rawAnswers = getQuestionnaireAnswers(invalidResponse);

      expect(() => validateQuestionnaireAnswers(rawAnswers)).toThrow(getErrorMessage(field));
    });
  });

  it('should validate questionnaire with all fields present', () => {
    const rawAnswers = getQuestionnaireAnswers(existingPatientQuestionnaireResponse);
    const answers = validateQuestionnaireAnswers(rawAnswers);

    expect(answers).toEqual({
      firstName: 'Jane',
      lastName: 'Smith',
      dob: '1996-02-10',
      genderAtBirth: 'female',
      addressLine1: '123 Arsenal St',
      city: 'Phoenix',
      state: 'AZ',
      zip: '85300',
      ssn: '123456789',
      phone: '555-555-5555',
      email: 'jane.smith@example.com',
    });
  });

  it('should validate questionnaire with only required fields', () => {
    const minimalResponse = {
      ...existingPatientQuestionnaireResponse,
      item: existingPatientQuestionnaireResponse.item?.filter(
        (item) => !['ssn', 'phone', 'email'].includes(item.linkId)
      ),
    };

    const rawAnswers = getQuestionnaireAnswers(minimalResponse);
    const answers = validateQuestionnaireAnswers(rawAnswers);

    expect(answers).toEqual({
      firstName: 'Jane',
      lastName: 'Smith',
      dob: '1996-02-10',
      genderAtBirth: 'female',
      addressLine1: '123 Arsenal St',
      city: 'Phoenix',
      state: 'AZ',
      zip: '85300',
      ssn: undefined,
      phone: undefined,
      email: undefined,
    });
  });

  it('should handle empty optional fields', () => {
    const responseWithEmptyOptionals = { ...existingPatientQuestionnaireResponse };
    responseWithEmptyOptionals.item = responseWithEmptyOptionals.item?.filter(
      (item) => !['ssn', 'phone', 'email'].includes(item.linkId)
    );

    const rawAnswers = getQuestionnaireAnswers(responseWithEmptyOptionals);
    const answers = validateQuestionnaireAnswers(rawAnswers);

    expect(answers.ssn).toBeUndefined();
    expect(answers.phone).toBeUndefined();
    expect(answers.email).toBeUndefined();
  });
});
