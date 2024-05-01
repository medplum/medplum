import { Questionnaire } from '@medplum/fhirtypes';

const encounterNoteQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'Encounter Note',
  id: 'encounter-note',
  item: [
    {
      linkId: 'encounter-date',
      type: 'date',
      text: 'Date of Visit',
      required: true,
    },
    {
      linkId: 'reason-for-visit',
      type: 'choice',
      text: 'Reason for visit',
      required: true,
      answerValueSet: 'http://hl7.org/fhir/ValueSet/icd-10',
    },
    {
      linkId: 'vitals',
      type: 'group',
      text: 'Vital Signs',
      item: [
        {
          linkId: 'systolic-blood-pressure',
          type: 'integer',
          text: 'Systolic Blood Pressure',
        },
        {
          linkId: 'diastolic-blood-pressure',
          type: 'integer',
          text: 'Diastolic Blood Pressure',
        },
        {
          linkId: 'vitals-height',
          type: 'integer',
          text: 'Height (cm)',
        },
        {
          linkId: 'vitals-weight',
          type: 'integer',
          text: 'Weight (lbs)',
        },
      ],
    },
    {
      linkId: 'subjective-evaluation',
      type: 'group',
      text: 'Subjective Evaluation',
      item: [
        {
          linkId: 'hot-flashes',
          type: 'boolean',
          text: 'Hot flashes',
        },
        {
          linkId: 'hot-flashes-details',
          type: 'string',
          text: 'Hot flashes - details',
          enableWhen: [
            {
              question: 'hot-flashes',
              operator: '=',
              answerBoolean: true,
            },
          ],
        },
        {
          linkId: 'mood-swings',
          type: 'boolean',
          text: 'Mood swings',
        },
        {
          linkId: 'mood-swings-details',
          type: 'string',
          text: 'Mood swings - details',
          enableWhen: [
            {
              question: 'mood-swings',
              operator: '=',
              answerBoolean: true,
            },
          ],
        },
        {
          linkId: 'vaginal-dryness',
          type: 'boolean',
          text: 'Vaginal dryness',
        },
        {
          linkId: 'vaginal-dryness-details',
          type: 'string',
          text: 'Vaginal dryness - details',
          enableWhen: [
            {
              question: 'vaginal-dryness',
              operator: '=',
              answerBoolean: true,
            },
          ],
        },
        {
          linkId: 'sleep-disturbance',
          type: 'boolean',
          text: 'Sleep Disturbance',
        },
        {
          linkId: 'sleep-disturbance-details',
          type: 'string',
          text: 'Sleep disturbance - details',
          enableWhen: [
            {
              question: 'sleep-disturbance',
              operator: '=',
              answerBoolean: true,
            },
          ],
        },
        {
          linkId: 'self-reported-history',
          type: 'open-choice',
          text: 'Self-reported history',
          answerOption: [
            {
              id: 'id-76',
              valueString: 'Blood clots',
            },
            {
              id: 'id-77',
              valueString: 'Stroke',
            },
            {
              id: 'id-78',
              valueString: 'Breast cancer',
            },
            {
              id: 'id-79',
              valueString: 'Endometrial cancer',
            },
            {
              id: 'id-80',
              valueString: 'Irregular bleeding',
            },
            {
              id: 'id-81',
              valueString: 'BMI > 30',
            },
          ],
        },
        {
          linkId: 'blood-clot-details',
          type: 'string',
          text: 'Blood clot - details',
          enableWhen: [
            {
              question: 'self-reported-history',
              operator: '=',
              answerString: 'Blood clots',
            },
          ],
        },
        {
          linkId: 'stroke-details',
          type: 'string',
          text: 'Stroke - details',
          enableWhen: [
            {
              question: 'self-reported-history',
              operator: '=',
              answerString: 'Stroke',
            },
          ],
        },
        {
          linkId: 'breast-cancer-details',
          type: 'string',
          text: 'Breast cancer - details',
          enableWhen: [
            {
              question: 'self-reported-history',
              operator: '=',
              answerString: 'Breast cancer',
            },
          ],
        },
        {
          linkId: 'endometrial-cancer-details',
          type: 'string',
          text: 'Endometrial cancer - details',
          enableWhen: [
            {
              question: 'self-reported-history',
              operator: '=',
              answerString: 'Endometrial cancer',
            },
          ],
        },
        {
          linkId: 'irregular-bleeding-details',
          type: 'string',
          text: 'Irregular bleeding - details',
          enableWhen: [
            {
              question: 'self-reported-history',
              operator: '=',
              answerString: 'Irregular bleeding',
            },
          ],
        },
        {
          linkId: 'bmi>30-details',
          type: 'string',
          text: 'BMI > 30 - details',
          enableWhen: [
            {
              question: 'self-reported-history',
              operator: '=',
              answerString: 'BMI > 30',
            },
          ],
        },
      ],
    },
    {
      linkId: 'notes-and-comments',
      type: 'text',
      text: 'Notes and comments',
      repeats: true,
    },
  ],
};

export default encounterNoteQuestionnaire;
