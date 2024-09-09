import { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';

const basicQuestionnaire: Questionnaire =
  // start-block simpleQuestionnaire
  {
    resourceType: 'Questionnaire',
    id: 'example-questionnaire',
    status: 'draft',
    title: 'Patient Health Questionnaire',
    description: 'A questionnaire to gather basic health information from the patient',
    item: [
      {
        linkId: 'full-name',
        text: 'Patient Full Name',
        type: 'string',
        required: true,
      },
      {
        linkId: 'age',
        text: 'Patient Age',
        type: 'integer',
      },
      {
        linkId: 'gender',
        text: 'Patient Gender',
        type: 'choice',
        answerOption: [
          {
            valueCoding: {
              code: 'female',
            },
          },
          {
            valueCoding: {
              code: 'male',
            },
          },
        ],
      },
      {
        linkId: 'medications',
        text: 'Current Medications',
        type: 'string',
        repeats: true,
      },
      {
        linkId: 'allergies',
        text: 'Known Allergies',
        type: 'string',
        repeats: true,
      },
      {
        linkId: 'exercise',
        text: 'Weekly Exercise Frequency',
        type: 'integer',
      },
      {
        linkId: 'smoking',
        text: 'Smoking Status',
        type: 'reference',
        answerValueSet: 'http://loinc.org/LL22201-3',
      },
    ],
  };
// end-block simpleQuestionnaire

const nestedQuestionnaire: Questionnaire =
  // start-block nestedQuestionnaire
  {
    resourceType: 'Questionnaire',
    id: 'nested-questionnaire',
    status: 'active',
    subjectType: ['Patient'],
    item: [
      {
        linkId: 'allergies',
        text: 'Do you have allergies?',
        type: 'boolean',
      },
      {
        linkId: 'general',
        text: 'General Information',
        type: 'group',
        item: [
          {
            linkId: 'general.gender',
            text: 'What is your gender?',
            type: 'choice',
            answerOption: [
              {
                valueCoding: {
                  code: 'female',
                },
              },
              {
                valueCoding: {
                  code: 'male',
                },
              },
            ],
          },
          {
            linkId: 'general.dob',
            text: 'What is your date of birth?',
            type: 'date',
          },
          {
            linkId: 'general.marital',
            text: 'What is your marital status?',
            type: 'choice',
            answerOption: [
              {
                valueCoding: {
                  code: 'married',
                },
              },
              {
                valueCoding: {
                  code: 'single',
                },
              },
            ],
          },
        ],
      },
      {
        linkId: 'intoxicants',
        text: 'Intoxicants',
        type: 'group',
        item: [
          {
            linkId: 'intoxicants.smoking',
            text: 'Do you smoke?',
            type: 'boolean',
          },
          {
            linkId: 'intoxicants.alcohol',
            text: 'Do you drink alcohol?',
            type: 'boolean',
          },
        ],
      },
    ],
  };
// end-block nestedQuestionnaire

const rules: Questionnaire =
  // start-block ruledQuestionnaire
  {
    resourceType: 'Questionnaire',
    id: 'conditional-questionnaire',
    status: 'active',
    subjectType: ['Patient'],
    item: [
      {
        linkId: 'allergies',
        text: 'Do you have allergies?',
        type: 'boolean',
      },
      {
        linkId: 'general',
        text: 'General Information',
        type: 'group',
        item: [
          {
            linkId: 'general.gender',
            text: 'What is your gender?',
            type: 'choice',
            answerOption: [
              {
                valueCoding: {
                  code: 'female',
                },
              },
              {
                valueCoding: {
                  code: 'male',
                },
              },
            ],
          },
          {
            linkId: 'general.dob',
            text: 'What is your date of birth?',
            type: 'date',
          },
          {
            linkId: 'general.birth-country',
            text: 'What is your country of birth?',
            type: 'string',
            initial: [
              {
                valueString: 'United States',
              },
            ],
          },
          {
            linkId: 'general.marital',
            text: 'What is your marital status?',
            type: 'choice',
            answerOption: [
              {
                valueCoding: {
                  code: 'married',
                },
              },
              {
                valueCoding: {
                  code: 'single',
                },
              },
            ],
          },
        ],
      },
      {
        linkId: 'intoxicants',
        text: 'Intoxicants',
        type: 'group',
        item: [
          {
            linkId: 'intoxicants.smoking',
            text: 'Do you smoke?',
            type: 'boolean',
          },
          {
            linkId: 'intoxicants.alcohol',
            text: 'Do you drink alcohol?',
            type: 'boolean',
          },
        ],
      },
      {
        linkId: 'pregnancy',
        text: 'Pregnancy History',
        type: 'group',
        item: [
          {
            linkId: 'pregnancy.boolean',
            text: 'Have you ever been pregnant?',
            type: 'boolean',
          },
          {
            linkId: 'pregnancy.count',
            text: 'How many times have you been pregnant?',
            type: 'integer',
            enableWhen: [
              {
                question: 'pregnancy.boolean',
                operator: '=',
                answerBoolean: true,
              },
            ],
          },
        ],
        enableWhen: [
          {
            question: 'general.gender',
            operator: '=',
            answerCoding: {
              code: 'female',
            },
          },
        ],
      },
    ],
  };
// end-block ruledQuestionnaire

const response: QuestionnaireResponse =
  // start-block response
  {
    resourceType: 'QuestionnaireResponse',
    id: 'homer-simpson-conditional-response',
    status: 'completed',
    questionnaire: 'http://example.org/Questionnaires/conditional-questionnaire',
    subject: {
      reference: 'Patient/homer-simpson',
    },
    author: {
      reference: 'Patient/homer-simpson',
    },
    authored: '2023-11-18',
    source: {
      reference: 'Patient/homer-simpson',
    },
    item: [
      {
        linkId: 'allergies',
        text: 'Do you have allergies?',
        answer: [
          {
            valueBoolean: false,
          },
        ],
      },
      {
        linkId: 'general',
        text: 'General Information',
        item: [
          {
            linkId: 'general.gender',
            text: 'What is your gender?',
            answer: [
              {
                valueCoding: {
                  code: 'M',
                },
              },
            ],
          },
          {
            linkId: 'general.dob',
            text: 'What is your date of birth?',
            answer: [
              {
                valueDate: '1956-05-12',
              },
            ],
          },
          {
            linkId: 'general.birth-country',
            text: 'What is your country of birth?',
            answer: [
              {
                valueString: 'United States',
              },
            ],
          },
          {
            linkId: 'general.marital',
            text: 'What is your marital status?',
            answer: [
              {
                valueCoding: {
                  code: 'married',
                },
              },
            ],
          },
        ],
      },
      {
        linkId: 'intoxicants',
        text: 'Intoxicants',
        item: [
          {
            linkId: 'intoxicants.smoking',
            text: 'Do you smoke?',
            answer: [
              {
                valueBoolean: true,
              },
            ],
          },
          {
            linkId: 'intoxicants.alcohol',
            text: 'Do you drink alcohol?',
            answer: [
              {
                valueBoolean: true,
              },
            ],
          },
        ],
      },
    ],
  };
// end-block response

console.log(basicQuestionnaire, nestedQuestionnaire, rules, response);
