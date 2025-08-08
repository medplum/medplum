// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
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

const _KITCHEN_SINK_FORM: HealthieFormAnswerGroup = {
  id: '1009863',
  user_id: '2498847',
  name: 'Kitchen Sink',
  created_at: '2025-07-20 12:01:14 -0700',
  finished: true,
  form_answers: [
    {
      label: 'Title',
      answer: '',
      id: '12020331',
      custom_module: {
        required: false,
        id: '18878900',
        mod_type: 'label',
        label: 'Title',
      },
    },
    {
      label: 'Open answer (short)',
      answer: 'Example short answer response',
      id: '12020332',
      custom_module: {
        required: false,
        id: '18878902',
        mod_type: 'text',
        label: 'Open answer (short)',
      },
    },
    {
      label: 'Open answer (long)',
      answer: '<p>Example log answer rich text <strong>response</strong></p>',
      id: '12020333',
      custom_module: {
        required: false,
        id: '18878903',
        mod_type: 'textarea',
        label: 'Open answer (long)',
      },
    },
    {
      label: 'Multiple choice (checkbox)',
      answer: 'a\nb',
      id: '12023514',
      custom_module: {
        required: false,
        id: '18878866',
        mod_type: 'checkbox',
        label: 'Multiple choice (checkbox)',
      },
    },
    {
      label: 'HIPAA',
      answer: '',
      id: '12020335',
      custom_module: {
        required: false,
        id: '18878908',
        mod_type: 'hipaa',
        label: 'HIPAA',
      },
    },
    {
      label: 'Multiple choice',
      answer: 'a',
      id: '12020336',
      custom_module: {
        required: false,
        id: '18878904',
        mod_type: 'radio',
        label: 'Multiple choice',
      },
    },
    {
      label: 'Multiple choice (horizontal)',
      answer: 'c',
      id: '12020337',
      custom_module: {
        required: false,
        id: '18878905',
        mod_type: 'horizontal_radio',
        label: 'Multiple choice (horizontal)',
      },
    },
    {
      label: 'Number',
      answer: '3',
      id: '12020338',
      custom_module: {
        required: false,
        id: '18878906',
        mod_type: 'number',
        label: 'Number',
      },
    },
    {
      label: 'Referring provider',
      answer: 'Foo,Bar',
      id: '12020339',
      custom_module: {
        required: false,
        id: '18878910',
        mod_type: 'referring_provider',
        label: 'Referring provider',
      },
    },
    {
      label: 'Body Fat %',
      answer: '10',
      id: '12020340',
      custom_module: {
        required: false,
        id: '18878909',
        mod_type: 'Body Fat %',
        label: 'Body Fat %',
      },
    },
    {
      label: 'Dropdown',
      answer: 'b',
      id: '12020341',
      custom_module: {
        required: false,
        id: '18878907',
        mod_type: 'dropdown',
        label: 'Dropdown',
      },
    },
    {
      label: 'Time',
      answer: '0:05',
      id: '12020342',
      custom_module: {
        required: false,
        id: '18878901',
        mod_type: 'time',
        label: 'Time',
      },
    },
    {
      label: 'Family medical history',
      answer: '<p>TESTING FAMILY MEDICAL <strong>HISTORY</strong></p>',
      id: '12020343',
      custom_module: {
        required: false,
        id: '18878916',
        mod_type: 'textarea',
        label: 'Family medical history',
      },
    },
    {
      label: 'Diagnosis',
      answer: '9311',
      id: '12020344',
      custom_module: {
        required: false,
        id: '18878918',
        mod_type: 'diagnosis',
        label: 'Diagnosis',
      },
    },
    {
      label: 'Billing item',
      answer: '8\r\n2\r\n100\r\n',
      id: '12020345',
      custom_module: {
        required: false,
        id: '18878917',
        mod_type: 'billing_item',
        label: 'Billing item',
      },
    },
    {
      label: 'Allergy',
      answer:
        'allergy\r\ndrug\r\nPenicillin V (Penicillin)\r\nactive\r\n/anaphylaxis\r\nsevere\r\n\r\n\r\n\r\nZ2lkOi8vRG9zZXNwb3QvRG9zZXNwb3Q6OkRydWdBbGxlcmdlbi8yMzQz\\\\allergy\r\npet\r\ncustom\r\nactive\r\n/hives\r\nmoderate\r\nDog',
      id: '12020346',
      custom_module: {
        required: false,
        id: '18878915',
        mod_type: 'synced_allergy',
        label: 'Allergy',
      },
    },
    {
      label: 'Are medical records available',
      answer: 'Yes',
      id: '12020347',
      custom_module: {
        required: false,
        id: '18878914',
        mod_type: 'radio',
        label: 'Are medical records available',
      },
    },
    {
      label: 'Matrix',
      answer:
        '[["{\\"value\\":\\"Col1\\",\\"type\\":\\"text\\"}","{\\"value\\":\\"Col2\\",\\"type\\":\\"text\\"}","{\\"value\\":\\"Col3\\",\\"type\\":\\"text\\"}"],["{\\"value\\":\\"Row1\\",\\"type\\":\\"text\\"}","{\\"value\\":\\"asdadsa\\",\\"type\\":\\"text\\"}","{\\"value\\":true,\\"type\\":\\"checkbox\\"}"],["{\\"value\\":\\"Row2\\",\\"type\\":\\"text\\"}","{\\"value\\":\\"\\",\\"type\\":\\"checkbox\\"}","{\\"value\\":\\"adfsafa\\",\\"type\\":\\"text\\"}"],["{\\"value\\":\\"Row3\\",\\"type\\":\\"text\\"}","{\\"value\\":\\"\\",\\"type\\":\\"checkbox\\"}","{\\"value\\":\\"\\",\\"type\\":\\"checkbox\\"}"]]',
      id: '12020348',
      custom_module: {
        required: false,
        id: '18878867',
        mod_type: 'matrix',
        label: 'Matrix',
      },
    },
    {
      label: 'Require client to agree',
      answer: 'true',
      id: '12020349',
      custom_module: {
        required: false,
        id: '18878912',
        mod_type: 'agree_to_above',
        label: 'Require client to agree',
      },
    },
    {
      label: 'Document',
      answer: '',
      id: '12020350',
      custom_module: {
        required: false,
        id: '18878913',
        mod_type: 'document',
        label: 'Document',
      },
    },
    {
      label: 'Signature',
      answer: 'data:image/png;base64,iVBORw0KGgoAAAANSUhE...',
      id: '12020351',
      custom_module: {
        required: false,
        id: '18878911',
        mod_type: 'signature',
        label: 'Signature',
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

      // checkbox with "Yes, I agree" -> valueString (checkboxes are now strings)
      const checkboxItem = result.item?.find((item) => item.linkId === '18562180');
      expect(checkboxItem?.answer?.[0]?.valueString).toBe('Yes, I agree');

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

    test('handles matrix questions', () => {
      const result = convertHealthieFormAnswerGroupToFhir(MATRIX_FORM, HEALTHIE_API_URL, PATIENT_REFERENCE);

      // Should now include the matrix item
      const matrixItem = result.item?.find((item) => item.linkId === '18562262');
      expect(matrixItem).toBeDefined();
      expect(matrixItem?.text).toBe('Head symptoms');
      expect(matrixItem?.item).toBeDefined();

      // Should have sub-items for each row with data
      expect(matrixItem?.item?.length).toBeGreaterThan(0);

      // Check first row structure
      const firstRow = matrixItem?.item?.[0];
      expect(firstRow?.text).toBe('Headaches'); // Row name from first cell
      expect(firstRow?.item).toBeDefined();
      expect(firstRow?.item?.length).toBeGreaterThan(0);
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
            displayed_answer: 'Headache, Fatigue',
            answer: 'Headache\nFatigue',
            id: '12018560',
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

      // Checkbox with newline-separated values -> multiple valueString answers
      expect(multiAnswerItem?.answer?.[0]?.valueString).toBe('Headache');
      expect(multiAnswerItem?.answer?.[1]?.valueString).toBe('Fatigue');
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

      // checkbox with "No" -> valueString (checkboxes are now strings)
      const noItem = result.item?.find((item) => item.linkId === '18562310');
      expect(noItem?.answer?.[0]?.valueString).toBe('No');

      // agree_to_above with "false" -> valueBoolean: false
      const falseItem = result.item?.find((item) => item.linkId === '18562311');
      expect(falseItem?.answer?.[0]?.valueBoolean).toBe(false);
    });
  });

  describe('Kitchen Sink Form - Comprehensive mod_type testing', () => {
    let result: any;

    beforeAll(() => {
      result = convertHealthieFormAnswerGroupToFhir(_KITCHEN_SINK_FORM, HEALTHIE_API_URL, PATIENT_REFERENCE);
    });

    test('label type is filtered out (display-only)', () => {
      const labelItem = result.item?.find((item: any) => item.linkId === '18878900');
      expect(labelItem).toBeUndefined();
    });

    test('text type maps to valueString', () => {
      const textItem = result.item?.find((item: any) => item.linkId === '18878902');
      expect(textItem).toBeDefined();
      expect(textItem?.text).toBe('Open answer (short)');
      expect(textItem?.answer?.[0]?.valueString).toBe('Example short answer response');
    });

    test('textarea type maps to valueString with HTML preserved', () => {
      const textareaItem = result.item?.find((item: any) => item.linkId === '18878903');
      expect(textareaItem).toBeDefined();
      expect(textareaItem?.text).toBe('Open answer (long)');
      expect(textareaItem?.answer?.[0]?.valueString).toBe(
        '<p>Example log answer rich text <strong>response</strong></p>'
      );
    });

    test('checkbox type with multiple values creates multiple valueString answers', () => {
      const checkboxItem = result.item?.find((item: any) => item.linkId === '18878866');
      expect(checkboxItem).toBeDefined();
      expect(checkboxItem?.text).toBe('Multiple choice (checkbox)');
      expect(checkboxItem?.answer).toHaveLength(2);
      expect(checkboxItem?.answer?.[0]?.valueString).toBe('a');
      expect(checkboxItem?.answer?.[1]?.valueString).toBe('b');
    });

    test('hipaa type is filtered out (display-only)', () => {
      const hipaaItem = result.item?.find((item: any) => item.linkId === '18878908');
      expect(hipaaItem).toBeUndefined();
    });

    test('radio type maps to valueString', () => {
      const radioItem = result.item?.find((item: any) => item.linkId === '18878904');
      expect(radioItem).toBeDefined();
      expect(radioItem?.text).toBe('Multiple choice');
      expect(radioItem?.answer?.[0]?.valueString).toBe('a');
    });

    test('horizontal_radio type maps to valueString', () => {
      const horizontalRadioItem = result.item?.find((item: any) => item.linkId === '18878905');
      expect(horizontalRadioItem).toBeDefined();
      expect(horizontalRadioItem?.text).toBe('Multiple choice (horizontal)');
      expect(horizontalRadioItem?.answer?.[0]?.valueString).toBe('c');
    });

    test('number type maps to valueQuantity', () => {
      const numberItem = result.item?.find((item: any) => item.linkId === '18878906');
      expect(numberItem).toBeDefined();
      expect(numberItem?.text).toBe('Number');
      expect(numberItem?.answer?.[0]?.valueQuantity?.value).toBe(3);
    });

    test('referring_provider type maps to valueString', () => {
      const referringProviderItem = result.item?.find((item: any) => item.linkId === '18878910');
      expect(referringProviderItem).toBeDefined();
      expect(referringProviderItem?.text).toBe('Referring provider');
      expect(referringProviderItem?.answer?.[0]?.valueString).toBe('Foo,Bar');
    });

    test('Body Fat % type maps to valueQuantity', () => {
      const bodyFatItem = result.item?.find((item: any) => item.linkId === '18878909');
      expect(bodyFatItem).toBeDefined();
      expect(bodyFatItem?.text).toBe('Body Fat %');
      expect(bodyFatItem?.answer?.[0]?.valueQuantity?.value).toBe(10);
    });

    test('dropdown type maps to valueString', () => {
      const dropdownItem = result.item?.find((item: any) => item.linkId === '18878907');
      expect(dropdownItem).toBeDefined();
      expect(dropdownItem?.text).toBe('Dropdown');
      expect(dropdownItem?.answer?.[0]?.valueString).toBe('b');
    });

    test.skip('time type maps to valueTime', () => {
      const timeItem = result.item?.find((item: any) => item.linkId === '18878901');
      expect(timeItem).toBeDefined();
      expect(timeItem?.text).toBe('Time');
      expect(timeItem?.answer?.[0]?.valueTime).toBe('00:05:00');
    });

    test('textarea for family medical history maps to valueString with HTML', () => {
      const familyHistoryItem = result.item?.find((item: any) => item.linkId === '18878916');
      expect(familyHistoryItem).toBeDefined();
      expect(familyHistoryItem?.text).toBe('Family medical history');
      expect(familyHistoryItem?.answer?.[0]?.valueString).toBe(
        '<p>TESTING FAMILY MEDICAL <strong>HISTORY</strong></p>'
      );
    });

    test('diagnosis type maps to valueString', () => {
      const diagnosisItem = result.item?.find((item: any) => item.linkId === '18878918');
      expect(diagnosisItem).toBeDefined();
      expect(diagnosisItem?.text).toBe('Diagnosis');
      expect(diagnosisItem?.answer?.[0]?.valueString).toBe('9311');
    });

    test('billing_item type maps to valueString', () => {
      const billingItem = result.item?.find((item: any) => item.linkId === '18878917');
      expect(billingItem).toBeDefined();
      expect(billingItem?.text).toBe('Billing item');
      expect(billingItem?.answer?.[0]?.valueString).toBe('8\r\n2\r\n100\r\n');
    });

    test('synced_allergy type maps to valueString', () => {
      const allergyItem = result.item?.find((item: any) => item.linkId === '18878915');
      expect(allergyItem).toBeDefined();
      expect(allergyItem?.text).toBe('Allergy');
      expect(allergyItem?.answer?.[0]?.valueString).toBe(
        'allergy\r\ndrug\r\nPenicillin V (Penicillin)\r\nactive\r\n/anaphylaxis\r\nsevere\r\n\r\n\r\n\r\nZ2lkOi8vRG9zZXNwb3QvRG9zZXNwb3Q6OkRydWdBbGxlcmdlbi8yMzQz\\\\allergy\r\npet\r\ncustom\r\nactive\r\n/hives\r\nmoderate\r\nDog'
      );
    });

    test('radio for medical records availability maps to valueString', () => {
      const medicalRecordsItem = result.item?.find((item: any) => item.linkId === '18878914');
      expect(medicalRecordsItem).toBeDefined();
      expect(medicalRecordsItem?.text).toBe('Are medical records available');
      expect(medicalRecordsItem?.answer?.[0]?.valueString).toBe('Yes');
    });

    test('matrix type creates hierarchical structure with row/column items', () => {
      const matrixItem = result.item?.find((item: any) => item.linkId === '18878867');
      expect(matrixItem).toBeDefined();
      expect(matrixItem?.text).toBe('Matrix');
      expect(matrixItem?.item).toBeDefined();

      // Check Row1 structure
      const row1 = matrixItem?.item?.find((item: any) => item.text === 'Row1');
      expect(row1).toBeDefined();
      expect(row1?.item).toBeDefined();

      // Row1 should have Col2 with text value "asdadsa"
      const col2Item = row1?.item?.find((item: any) => item.text === 'Col2');
      expect(col2Item?.answer?.[0]?.valueString).toBe('asdadsa');

      // Row1 should have Col3 with boolean value true
      const col3Item = row1?.item?.find((item: any) => item.text === 'Col3');
      expect(col3Item?.answer?.[0]?.valueBoolean).toBe(true);

      // Check Row2 structure
      const row2 = matrixItem?.item?.find((item: any) => item.text === 'Row2');
      expect(row2).toBeDefined();

      // Row2 should have Col3 with text value "adfsafa"
      const row2col3Item = row2?.item?.find((item: any) => item.text === 'Col3');
      expect(row2col3Item?.answer?.[0]?.valueString).toBe('adfsafa');
    });

    test('agree_to_above type maps to valueBoolean', () => {
      const agreeItem = result.item?.find((item: any) => item.linkId === '18878912');
      expect(agreeItem).toBeDefined();
      expect(agreeItem?.text).toBe('Require client to agree');
      expect(agreeItem?.answer?.[0]?.valueBoolean).toBe(true);
    });

    test('document type with empty answer is filtered out', () => {
      const documentItem = result.item?.find((item: any) => item.linkId === '18878913');
      expect(documentItem).toBeUndefined();
    });

    test('signature type maps to valueAttachment', () => {
      const signatureItem = result.item?.find((item: any) => item.linkId === '18878911');
      expect(signatureItem).toBeDefined();
      expect(signatureItem?.text).toBe('Signature');
      expect(signatureItem?.answer?.[0]?.valueAttachment).toBeDefined();
      expect(signatureItem?.answer?.[0]?.valueAttachment?.contentType).toBe('image/png');
      expect(signatureItem?.answer?.[0]?.valueAttachment?.data).toBe('iVBORw0KGgoAAAANSUhE...');
    });
  });
});
