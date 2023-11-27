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
        linkId: '1',
        text: 'Patient Full Name',
        type: 'string',
        required: true,
      },
      {
        linkId: '2',
        text: 'Patient Age',
        type: 'integer',
      },
      {
        linkId: '3',
        text: 'Current Medications',
        type: 'string',
        repeats: true,
      },
      {
        linkId: '4',
        text: 'Known Allergies',
        type: 'string',
        repeats: true,
      },
      {
        linkId: '5',
        text: 'Weekly Exercise Frequency',
        type: 'integer',
      },
      {
        linkId: '6',
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
        linkId: '1',
        text: 'Do you have allergies?',
        type: 'boolean',
      },
      {
        linkId: '2',
        text: 'General Information',
        type: 'group',
        item: [
          {
            linkId: '2.1',
            text: 'What is your gender?',
            type: 'choice',
            answerOption: [
              {
                valueCoding: {
                  code: 'F',
                },
              },
              {
                valueCoding: {
                  code: 'M',
                },
              },
            ],
          },
          {
            linkId: '2.2',
            text: 'What is your date of birth?',
            type: 'date',
          },
          {
            linkId: '2.3',
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
        linkId: '3',
        text: 'Intoxicants',
        type: 'group',
        item: [
          {
            linkId: '3.1',
            text: 'Do you smoke?',
            type: 'boolean',
          },
          {
            linkId: '3.2',
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
        linkId: '1',
        text: 'Do you have allergies?',
        type: 'boolean',
      },
      {
        linkId: '2',
        text: 'General Information',
        type: 'group',
        item: [
          {
            linkId: '2.1',
            text: 'What is your gender?',
            type: 'choice',
            answerOption: [
              {
                valueCoding: {
                  code: 'F',
                },
              },
              {
                valueCoding: {
                  code: 'M',
                },
              },
            ],
          },
          {
            linkId: '2.2',
            text: 'What is your date of birth?',
            type: 'date',
          },
          {
            linkId: '2.3',
            text: 'What is your country of birth?',
            type: 'string',
            initial: [
              {
                valueString: 'United States',
              },
            ],
          },
          {
            linkId: '2.4',
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
        linkId: '3',
        text: 'Intoxicants',
        type: 'group',
        item: [
          {
            linkId: '3.1',
            text: 'Do you smoke?',
            type: 'boolean',
          },
          {
            linkId: '3.2',
            text: 'Do you drink alcohol?',
            type: 'boolean',
          },
        ],
      },
      {
        linkId: '4',
        text: 'Pregnancy History',
        type: 'group',
        item: [
          {
            linkId: '4.1',
            text: 'Have you ever been pregnant?',
            type: 'boolean',
          },
          {
            linkId: '4.2',
            text: 'How many times have you been pregnant?',
            type: 'integer',
            enableWhen: [
              {
                question: '4.1',
                operator: '=',
                answerBoolean: true,
              },
            ],
          },
        ],
        enableWhen: [
          {
            question: '2.1',
            operator: '=',
            answerCoding: {
              code: 'F',
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
    id: 'homer-simpson-grouped-response',
    questionnaire: 'http://example.org/Questionnaires/grouped-questionnaire',
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
        linkId: '1',
        text: 'Do you have allergies?',
        answer: [
          {
            valueBoolean: false,
          },
        ],
      },
      {
        linkId: '2',
        text: 'General Information',
        item: [
          {
            linkId: '2.1',
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
            linkId: '2.2',
            text: 'What is your date of birth?',
            answer: [
              {
                valueDate: '1956-05-12',
              },
            ],
          },
          {
            linkId: '2.3',
            text: 'What is your country of birth?',
            answer: [
              {
                valueString: 'United States',
              },
            ],
          },
          {
            linkId: '2.4',
            text: 'What is yoru marital status?',
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
        linkId: '3',
        text: 'Intoxicants',
        item: [
          {
            linkId: '3.1',
            text: 'Do you smoke?',
            answer: [
              {
                valueBoolean: false,
              },
            ],
          },
          {
            linkId: '3.2',
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
