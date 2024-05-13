import { Questionnaire, QuestionnaireItem } from '@medplum/fhirtypes';

const standardQuestions: QuestionnaireItem[] = [
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
    linkId: 'problem-list',
    type: 'boolean',
    text: 'Add to problem list',
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
        type: 'quantity',
        text: 'Height',
      },
      {
        linkId: 'vitals-weight',
        type: 'quantity',
        text: 'Weight',
      },
    ],
  },
];

export const defaultQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'Encounter Note',
  id: 'default-encounter-note',
  item: [
    ...standardQuestions,
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
      linkId: 'assessment',
      type: 'text',
      text: 'Assessment',
      repeats: true,
    },
  ],
};

export const obstetricQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'Obstetric Return Visit',
  name: 'obstetric-visit',
  subjectType: ['Encounter'],
  useContext: [
    {
      code: {
        system: 'http://terminology.hl7.org/CodeSystem/usage-context-type',
        code: 'task',
        display: 'task',
      },
      valueCodeableConcept: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            code: 'CLINNOTEE',
            display: 'clinical note entry task',
          },
        ],
      },
    },
    {
      code: {
        system: 'http://terminology.hl7.org/CodeSystem/usage-context-type',
        code: 'focus',
        display: 'focus',
      },
      valueCodeableConcept: {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '163497009',
            display: 'Obstetric examination',
          },
        ],
      },
    },
  ],
  meta: {},
  item: [
    ...standardQuestions.concat({
      id: 'id-29',
      linkId: 'total-weight-gain',
      type: 'quantity',
      text: 'Total Weight Gain',
    }),
    {
      id: 'id-24',
      linkId: 'g16',
      type: 'group',
      text: 'Pregnancy History',
      item: [
        {
          id: 'id-25',
          linkId: 'gravida',
          type: 'integer',
          text: 'Gravida',
        },
        {
          id: 'id-26',
          linkId: 'para',
          type: 'integer',
          text: 'Para',
        },
        {
          id: 'id-31',
          linkId: 'g23',
          type: 'group',
          text: 'Gestational Age',
          item: [
            {
              id: 'id-32',
              linkId: 'gestational-age-weeks',
              type: 'integer',
              text: 'Weeks',
            },
            {
              id: 'id-33',
              linkId: 'gestational-age-days',
              type: 'integer',
              text: 'Days',
            },
          ],
        },
      ],
    },
    {
      id: 'id-34',
      linkId: 'g26',
      type: 'group',
      text: 'Assessment & Plan',
      item: [
        {
          id: 'id-35',
          linkId: 'assessment',
          type: 'text',
          text: 'Assessment',
        },
      ],
    },
  ],
};

export const gynecologyQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'Gynecology New Visit',
  name: 'gynecology-visit',
  subjectType: ['Encounter'],
  useContext: [
    {
      code: {
        system: 'http://terminology.hl7.org/CodeSystem/usage-context-type',
        code: 'task',
        display: 'task',
      },
      valueCodeableConcept: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            code: 'CLINNOTEE',
            display: 'clinical note entry task',
          },
        ],
      },
    },
    {
      code: {
        system: 'http://terminology.hl7.org/CodeSystem/usage-context-type',
        code: 'focus',
        display: 'focus',
      },
      valueCodeableConcept: {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '83607001',
            display: 'Gynecologic examination',
          },
        ],
      },
    },
  ],
  meta: {},
  item: [
    ...standardQuestions,
    {
      id: 'id-2',
      linkId: 'chief-complaint',
      type: 'choice',
      text: 'Chief Complaint',
    },
    {
      id: 'id-4',
      linkId: 'g3',
      type: 'group',
      text: 'History of Present Illness',
      item: [
        {
          id: 'id-5',
          linkId: 'q4',
          type: 'date',
          text: 'Last Period',
        },
        {
          id: 'id-6',
          linkId: 'contraception',
          type: 'open-choice',
          text: 'Preferred Contraception Method',
          answerOption: [
            {
              id: 'id-7',
              valueCoding: {
                code: 'Condom',
                display: 'Condom',
              },
            },
            {
              id: 'id-8',
              valueCoding: {
                code: 'IUD',
                display: 'IUD',
              },
            },
            {
              id: 'id-9',
              valueCoding: {
                code: 'Birth Control Pill',
                display: 'Birth Control Pill',
              },
            },
          ],
        },
        {
          id: 'id-10',
          linkId: 'mammogram',
          type: 'date',
          text: 'Last Mammogram',
        },
      ],
    },
    {
      id: 'id-11',
      linkId: 'g7',
      type: 'group',
      text: 'Social History',
      item: [
        {
          id: 'id-12',
          linkId: 'smoking',
          type: 'choice',
          text: 'Smoking Status',
          answerOption: [
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '446172000',
                display: 'Failed attempt to stop smoking',
              },
            },
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '77176002',
                display: 'Smoker',
              },
            },
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '449345000',
                display: 'Smoked before confirmation of pregnancy',
              },
            },
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '160616005',
                display: 'Trying to give up smoking',
              },
            },
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '8392000',
                display: 'Non-smoker',
              },
            },
          ],
        },
        {
          id: 'id-13',
          linkId: 'drugs',
          type: 'choice',
          text: 'Drug Use',
          answerOption: [
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '417284009',
                display: 'Current drug user',
              },
            },
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '441668002',
                display: 'Drug seeking behavior',
              },
            },
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '44870007',
                display: 'Ex-drug user',
              },
            },
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '707848009',
                display: 'Patient denies drug use',
              },
            },
          ],
        },
        {
          id: 'id-14',
          linkId: 'q10',
          type: 'choice',
          text: 'Housing Status',
          answerOption: [
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '32911000',
                display: 'Homeless',
              },
            },
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '160943002',
                display: 'Lives in own home',
              },
            },
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '365510008',
                display: 'Temporary shelter arrangements - finding',
              },
            },
          ],
        },
      ],
    },
    {
      id: 'id-15',
      linkId: 'g11',
      type: 'group',
      text: 'Assessment & Plan',
      item: [
        {
          id: 'id-16',
          linkId: 'visit-length',
          type: 'open-choice',
          text: 'Visit Length (minutes)',
          answerOption: [
            {
              id: 'id-17',
              valueInteger: 15,
            },
            {
              id: 'id-18',
              valueInteger: 30,
            },
            {
              id: 'id-19',
              valueInteger: 45,
            },
            {
              id: 'id-20',
              valueInteger: 50,
            },
          ],
        },
        {
          id: 'id-21',
          linkId: 'q13',
          type: 'text',
          text: 'Assessment',
        },
      ],
    },
  ],
};
