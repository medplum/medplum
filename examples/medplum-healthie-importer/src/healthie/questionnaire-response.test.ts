import {
  convertHealthieFormAnswerGroupToFhir,
  createSlug,
  convertHealthieTimestampToIso,
  HealthieFormAnswerGroup,
} from './questionnaire-response';
import { HEALTHIE_FORM_ANSWER_GROUP_ID_SYSTEM } from './constants';
import { Reference, Patient } from '@medplum/fhirtypes';

// Test data for different mod_types
const COVID_SCREENING_FORM: HealthieFormAnswerGroup = {
  id: '1009170',
  user_id: '2494091',
  name: 'COVID-19 Screening Form',
  created_at: '2025-07-19 10:48:32 -0700',
  finished: true,
  form_answers: [
    {
      label: 'This screening tool is being used for the safety of us all.',
      displayed_answer: '',
      answer: '',
      id: '12018533',
      custom_module: {
        id: '18562174',
        mod_type: 'label',
        label: 'This screening tool is being used for the safety of us all.',
      },
    },
    {
      label: 'In the past 24 hours, have you had a fever?',
      displayed_answer: 'Yes',
      answer: 'Yes',
      id: '12018534',
      custom_module: {
        id: '18562175',
        mod_type: 'radio',
        label: 'In the past 24 hours, have you had a fever?',
      },
    },
    {
      label: 'I certify that the responses shared above are accurate.',
      displayed_answer: 'Yes, I agree',
      answer: 'Yes, I agree',
      id: '12018539',
      custom_module: {
        id: '18562180',
        mod_type: 'checkbox',
        label: 'I certify that the responses shared above are accurate.',
      },
    },
  ],
};

const GAD7_FORM: HealthieFormAnswerGroup = {
  id: '1009169',
  user_id: '2494091',
  name: 'General Anxiety Disorder (GAD-7)',
  created_at: '2025-07-19 10:45:25 -0700',
  finished: true,
  form_answers: [
    {
      label: 'Date',
      displayed_answer: '',
      answer: '',
      id: '12018521',
      custom_module: {
        id: '18562210',
        mod_type: 'date',
        label: 'Date',
      },
    },
    {
      label: 'Patient Name',
      displayed_answer: 'Client, Example',
      answer: 'Example,Client',
      id: '12018522',
      custom_module: {
        id: '18562211',
        mod_type: 'name',
        label: 'Patient Name',
      },
    },
    {
      label: 'Date of Birth',
      displayed_answer: '1989-01-01',
      answer: '1989-01-01',
      id: '12018523',
      custom_module: {
        id: '18562212',
        mod_type: 'dob',
        label: 'Date of Birth',
      },
    },
    {
      label: 'Additional comments',
      displayed_answer: 'Patient reports feeling anxious lately.',
      answer: 'Patient reports feeling anxious lately.',
      id: '12018540',
      custom_module: {
        id: '18562222',
        mod_type: 'textarea',
        label: 'Additional comments',
      },
    },
  ],
};

const HIPAA_AGREEMENT_FORM: HealthieFormAnswerGroup = {
  id: '1009168',
  user_id: '2494091',
  name: 'HIPAA Agreement',
  created_at: '2025-07-19 10:44:45 -0700',
  finished: true,
  form_answers: [
    {
      label: 'HIPAA Agreement',
      displayed_answer: '',
      answer: '',
      id: '12018516',
      custom_module: {
        id: '18562396',
        mod_type: 'hipaa',
        label: 'HIPAA Agreement',
      },
    },
    {
      label: '',
      displayed_answer: 'Agreed To On Jul 19, 2025 10:44',
      answer: 'true',
      id: '12018517',
      custom_module: {
        id: '18562397',
        mod_type: 'agree_to_above',
        label: '',
      },
    },
    {
      label: '',
      displayed_answer: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQAAADI...',
      answer: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQAAADI...',
      id: '12018518',
      custom_module: {
        id: '18562398',
        mod_type: 'signature',
        label: '',
      },
    },
    {
      label: 'Parent/Guardian Name (if client is under 18)',
      displayed_answer: '',
      answer: '',
      id: '12018519',
      custom_module: {
        id: '18562399',
        mod_type: 'text',
        label: 'Parent/Guardian Name (if client is under 18)',
      },
    },
  ],
};

const MATRIX_FORM: HealthieFormAnswerGroup = {
  id: '1009185',
  user_id: '2494091',
  name: 'Medical Symptoms Questionnaire (MSQ)',
  created_at: '2025-07-19 11:51:28 -0700',
  finished: true,
  form_answers: [
    {
      label: 'Head symptoms',
      displayed_answer: 'Complex matrix data...',
      answer:
        '[["{\\"value\\":\\"Head\\",\\"type\\":\\"text\\"}","{\\"value\\":\\"Score\\",\\"type\\":\\"text\\"}"],["{\\"value\\":\\"Headaches\\",\\"type\\":\\"text\\"}","{\\"value\\":\\"1\\",\\"type\\":\\"text\\"}"],["{\\"value\\":\\"Faintness\\",\\"type\\":\\"text\\"}","{\\"value\\":\\"2\\",\\"type\\":\\"text\\"}"],["{\\"value\\":\\"Dizziness\\",\\"type\\":\\"text\\"}","{\\"value\\":\\"3\\",\\"type\\":\\"text\\"}"],["{\\"value\\":\\"Insomnia\\",\\"type\\":\\"text\\"}","{\\"value\\":\\"4\\",\\"type\\":\\"text\\"}"]]',
      id: '12018612',
      custom_module: {
        id: '18562262',
        mod_type: 'matrix',
        label: 'Head symptoms',
      },
    },
  ],
};

const INCOMPLETE_FORM: HealthieFormAnswerGroup = {
  id: '1009171',
  user_id: '2494091',
  name: 'Incomplete Form',
  created_at: '2025-07-19 10:48:32 -0700',
  finished: false,
  form_answers: [
    {
      label: 'Test question',
      displayed_answer: 'Test answer',
      answer: 'Test answer',
      id: '12018550',
      custom_module: {
        id: '18562200',
        mod_type: 'text',
        label: 'Test question',
      },
    },
  ],
};

describe('Healthie QuestionnaireResponse Transformer', () => {
  const HEALTHIE_API_URL = 'https://api.gethealthie.com/fhir';
  const PATIENT_REFERENCE: Reference<Patient> = {
    reference: 'Patient/12345',
  };

  describe('createSlug', () => {
    test('creates URL-friendly slugs', () => {
      expect(createSlug('COVID-19 Screening Form')).toBe('covid-19-screening-form');
      expect(createSlug('General Anxiety Disorder (GAD-7)')).toBe('general-anxiety-disorder-gad-7');
      expect(createSlug('HIPAA Agreement')).toBe('hipaa-agreement');
      expect(createSlug('Test  Multiple   Spaces')).toBe('test-multiple-spaces');
      expect(createSlug('Special!@#$%^&*()Characters')).toBe('specialcharacters');
    });
  });

  describe('convertHealthieTimestampToIso', () => {
    test('converts Healthie timestamps to ISO format', () => {
      expect(convertHealthieTimestampToIso('2025-07-19 10:48:32 -0700')).toBe('2025-07-19T10:48:32-07:00');
      expect(convertHealthieTimestampToIso('2025-04-08 15:33:09 -0700')).toBe('2025-04-08T15:33:09-07:00');
      expect(convertHealthieTimestampToIso('2025-12-25 23:59:59 +0000')).toBe('2025-12-25T23:59:59+00:00');
      expect(convertHealthieTimestampToIso('2025-01-01 00:00:00 +0530')).toBe('2025-01-01T00:00:00+05:30');
    });

    test('handles edge cases gracefully', () => {
      // Malformed input should return as-is
      expect(convertHealthieTimestampToIso('invalid-format')).toBe('invalid-format');
      expect(convertHealthieTimestampToIso('2025-07-19 10:48:32')).toBe('2025-07-19 10:48:32');
      expect(convertHealthieTimestampToIso('')).toBe('');
    });
  });

  describe('convertHealthieFormAnswerGroupToFhir', () => {
    test('maps basic form structure correctly', () => {
      const result = convertHealthieFormAnswerGroupToFhir(COVID_SCREENING_FORM, HEALTHIE_API_URL, PATIENT_REFERENCE);

      expect(result.resourceType).toBe('QuestionnaireResponse');
      expect(result.status).toBe('completed');
      expect(result.subject?.reference).toBe('Patient/12345');
      expect(result.questionnaire).toBe(`${HEALTHIE_API_URL}/Questionnaire/healthie-covid-19-screening-form`);
      expect(result.authored).toBe('2025-07-19T10:48:32-07:00');
      expect(result.identifier).toEqual({ system: HEALTHIE_FORM_ANSWER_GROUP_ID_SYSTEM, value: '1009170' });
    });

    test('handles incomplete forms with in-progress status', () => {
      const result = convertHealthieFormAnswerGroupToFhir(INCOMPLETE_FORM, HEALTHIE_API_URL, PATIENT_REFERENCE);

      expect(result.status).toBe('in-progress');
    });

    test('filters out display-only fields (label, read_only, hipaa)', () => {
      const result = convertHealthieFormAnswerGroupToFhir(COVID_SCREENING_FORM, HEALTHIE_API_URL, PATIENT_REFERENCE);

      // Should not include the label field
      const labelItem = result.item?.find((item) => item.linkId === '18562174');
      expect(labelItem).toBeUndefined();

      // Should include the radio question
      const radioItem = result.item?.find((item) => item.linkId === '18562175');
      expect(radioItem).toBeDefined();
      expect(radioItem?.text).toBe('In the past 24 hours, have you had a fever?');
      expect(radioItem?.answer?.[0]?.valueString).toBe('Yes');
    });

    test('filters out questions with empty answers', () => {
      const result = convertHealthieFormAnswerGroupToFhir(HIPAA_AGREEMENT_FORM, HEALTHIE_API_URL, PATIENT_REFERENCE);

      // Should not include the empty text field
      const emptyTextItem = result.item?.find((item) => item.linkId === '18562399');
      expect(emptyTextItem).toBeUndefined();

      // Should include the agree_to_above field
      const agreeItem = result.item?.find((item) => item.linkId === '18562397');
      expect(agreeItem).toBeDefined();
    });

    test('maps different answer types correctly', () => {
      const result = convertHealthieFormAnswerGroupToFhir(GAD7_FORM, HEALTHIE_API_URL, PATIENT_REFERENCE);

      // name -> valueString
      const nameItem = result.item?.find((item) => item.linkId === '18562211');
      expect(nameItem?.answer?.[0]?.valueString).toBe('Example,Client');

      // dob -> valueDate
      const dobItem = result.item?.find((item) => item.linkId === '18562212');
      expect(dobItem?.answer?.[0]?.valueDate).toBe('1989-01-01');

      // textarea -> valueString
      const textareaItem = result.item?.find((item) => item.linkId === '18562222');
      expect(textareaItem?.answer?.[0]?.valueString).toBe('Patient reports feeling anxious lately.');
    });

    test('maps boolean types correctly', () => {
      const result = convertHealthieFormAnswerGroupToFhir(COVID_SCREENING_FORM, HEALTHIE_API_URL, PATIENT_REFERENCE);

      // checkbox with "Yes, I agree" -> valueBoolean: true
      const checkboxItem = result.item?.find((item) => item.linkId === '18562180');
      expect(checkboxItem?.answer?.[0]?.valueBoolean).toBe(true);

      const hipaaResult = convertHealthieFormAnswerGroupToFhir(
        HIPAA_AGREEMENT_FORM,
        HEALTHIE_API_URL,
        PATIENT_REFERENCE
      );

      // agree_to_above with "true" -> valueBoolean: true
      const agreeItem = hipaaResult.item?.find((item) => item.linkId === '18562397');
      expect(agreeItem?.answer?.[0]?.valueBoolean).toBe(true);
    });

    test('maps signature to valueAttachment with TODO comment for SDC extension', () => {
      const result = convertHealthieFormAnswerGroupToFhir(HIPAA_AGREEMENT_FORM, HEALTHIE_API_URL, PATIENT_REFERENCE);

      const signatureItem = result.item?.find((item) => item.linkId === '18562398');
      expect(signatureItem?.answer?.[0]?.valueAttachment).toBeDefined();
      expect(signatureItem?.answer?.[0]?.valueAttachment?.contentType).toBe('image/png');
      expect(signatureItem?.answer?.[0]?.valueAttachment?.data).toBe('iVBORw0KGgoAAAANSUhEUgAAAfQAAADI...');
    });

    test('handles matrix questions (stubbed for now)', () => {
      const result = convertHealthieFormAnswerGroupToFhir(MATRIX_FORM, HEALTHIE_API_URL, PATIENT_REFERENCE);

      // For now, matrix questions should be filtered out until implementation
      const matrixItem = result.item?.find((item) => item.linkId === '18562262');
      expect(matrixItem).toBeUndefined();
    });

    test('groups multiple answers for the same question', () => {
      // This would test scenarios where multiple FormAnswers have the same custom_module.id
      // (e.g., multiple checkbox selections for a "check all that apply" question)
      const multiAnswerForm: HealthieFormAnswerGroup = {
        id: '1009172',
        user_id: '2494091',
        name: 'Multi Answer Test',
        created_at: '2025-07-19 10:48:32 -0700',
        finished: true,
        form_answers: [
          {
            label: 'Which symptoms do you have?',
            displayed_answer: 'Headache',
            answer: 'Headache',
            id: '12018560',
            custom_module: {
              id: '18562300',
              mod_type: 'checkbox',
              label: 'Which symptoms do you have?',
            },
          },
          {
            label: 'Which symptoms do you have?',
            displayed_answer: 'Fatigue',
            answer: 'Fatigue',
            id: '12018561',
            custom_module: {
              id: '18562300',
              mod_type: 'checkbox',
              label: 'Which symptoms do you have?',
            },
          },
        ],
      };

      const result = convertHealthieFormAnswerGroupToFhir(multiAnswerForm, HEALTHIE_API_URL, PATIENT_REFERENCE);

      const multiAnswerItem = result.item?.find((item) => item.linkId === '18562300');
      expect(multiAnswerItem).toBeDefined();
      expect(multiAnswerItem?.answer).toHaveLength(2);
      expect(multiAnswerItem?.answer?.[0]?.valueBoolean).toBe(true); // "Headache" -> true
      expect(multiAnswerItem?.answer?.[1]?.valueBoolean).toBe(true); // "Fatigue" -> true
    });

    test('handles edge cases in boolean conversion', () => {
      const edgeCaseForm: HealthieFormAnswerGroup = {
        id: '1009173',
        user_id: '2494091',
        name: 'Boolean Edge Cases',
        created_at: '2025-07-19 10:48:32 -0700',
        finished: true,
        form_answers: [
          {
            label: 'Test No',
            displayed_answer: 'No',
            answer: 'No',
            id: '12018570',
            custom_module: {
              id: '18562310',
              mod_type: 'checkbox',
              label: 'Test No',
            },
          },
          {
            label: 'Test False',
            displayed_answer: 'false',
            answer: 'false',
            id: '12018571',
            custom_module: {
              id: '18562311',
              mod_type: 'agree_to_above',
              label: 'Test False',
            },
          },
        ],
      };

      const result = convertHealthieFormAnswerGroupToFhir(edgeCaseForm, HEALTHIE_API_URL, PATIENT_REFERENCE);

      const noItem = result.item?.find((item) => item.linkId === '18562310');
      expect(noItem?.answer?.[0]?.valueBoolean).toBe(false);

      const falseItem = result.item?.find((item) => item.linkId === '18562311');
      expect(falseItem?.answer?.[0]?.valueBoolean).toBe(false);
    });
  });
});
