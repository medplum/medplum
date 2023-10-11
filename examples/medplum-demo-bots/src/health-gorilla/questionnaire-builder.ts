import { Questionnaire, QuestionnaireItem } from '@medplum/fhirtypes';

// This scripts generates a FHIR Questionnaire resource for Health Gorilla order entry.
// Questionnaires are used to generate forms in the Medplum UI.
// In your own app, you can use the Medplum UI to show the form and collect the user's answers.
// Or you can build your own UI entirely.

interface Lab {
  id: string;
  name: string;
  tests: LabTest[];
}

interface LabTest {
  code: string;
  name: string;
}

const labs: Lab[] = [
  {
    id: 'test',
    name: 'Testing',
    tests: [{ code: '1234-5', name: 'Test 1' }],
  },
  {
    id: 'labcorp',
    name: 'Labcorp',
    tests: [
      { code: '001453', name: 'Hemoglobin A1c' },
      { code: '010322', name: 'Prostate-Specific Ag' },
      { code: '322000', name: 'Comp. Metabolic Panel (14)' },
      { code: '008649', name: 'Aerobic Bacterial Culture' },
      { code: '005009', name: 'CBC With Differential/Platelet' },
      { code: '008847', name: 'Urine Culture, Routine' },
      { code: '008144', name: 'Stool Culture' },
      { code: '083935', name: 'HIV Ab/p24 Ag with Reflex' },
      { code: '322758', name: 'Basic Metabolic Panel (8)' },
      { code: '164922', name: 'HSV 1 and 2-Spec Ab, IgG w/Rfx' },
    ],
  },
  {
    id: 'quest',
    name: 'Quest',
    tests: [
      { code: '866', name: 'Free T4' },
      { code: '899', name: 'TSH' },
      { code: '10306', name: 'Hepatitis Panel, Acute w/reflex to confirmation' },
      { code: '10231', name: 'Comprehensive Metabolic Panel' },
      { code: '496', name: 'Hemoglobin A1C' },
      { code: '2605', name: 'Allergen Specific IGE Dog dander, Serum' },
      { code: '7600', name: 'Lipid Panel (Diagnosis E04.2, Z00.00)' },
      { code: '229', name: 'Aldosterone, 24hr (U) (Diagnosis E04.2, Z00.00) Total Volume - 1200' },
      { code: '4112', name: 'FTA' },
      { code: '6399', name: 'CBC w/Diff' },
      { code: '16814', name: 'ANA Scr, IFA w/Reflex Titer / Pattern / MPX AB Cascade' },
      { code: '7573', name: 'Iron Total/IBC Diagnosis code D64.9' },
    ],
  },
];

const lookup: Record<string, string> = {};

const q: Questionnaire = {
  resourceType: 'Questionnaire',
  name: 'Health Gorilla Order Form',
  title: 'Health Gorilla Order Form',
  status: 'active',
  item: [
    {
      id: 'patient',
      linkId: 'patient',
      type: 'reference',
      text: 'Patient',
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
          valueCode: 'Patient',
        },
      ],
    },
    {
      id: 'practitioner',
      linkId: 'practitioner',
      type: 'reference',
      text: 'Ordering Provider',
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
          valueCode: 'Practitioner',
        },
      ],
    },
    {
      id: 'performer',
      linkId: 'performer',
      type: 'choice',
      text: 'Performing Lab',
      answerOption: labs.map((lab) => ({
        id: lab.id,
        valueString: lab.name,
      })),
    },
  ],
};

for (const lab of labs) {
  const labItem: QuestionnaireItem = {
    id: lab.id + '-tests',
    linkId: lab.id + '-tests',
    type: 'group',
    text: lab.name + ' Tests',
    enableWhen: [
      {
        question: 'performer',
        operator: '=',
        answerString: lab.name,
      },
    ],
  };

  const testItems: QuestionnaireItem[] = [];

  for (const test of lab.tests) {
    const fullTestId = `${lab.id}-${test.code}`;
    lookup[fullTestId] = test.name;

    // Add a checkbox for the test
    testItems.push({
      id: fullTestId,
      linkId: fullTestId,
      type: 'boolean',
      text: `${test.name} (${test.code})`,
    });

    // Add a group of supplemental questions that is only enabled when the test is enabled
    testItems.push({
      id: `${fullTestId}-details`,
      linkId: `${fullTestId}-details`,
      type: 'group',
      enableWhen: [
        {
          question: fullTestId,
          operator: '=',
          answerBoolean: true,
        },
      ],
      item: [
        {
          id: `${fullTestId}-priority`,
          linkId: `${fullTestId}-priority`,
          type: 'choice',
          text: 'Priority',
          answerOption: [
            {
              valueString: 'routine',
              initialSelected: true,
            },
            {
              valueString: 'urgent',
            },
            {
              valueString: 'asap',
            },
            {
              valueString: 'stat',
            },
          ],
        },
        {
          id: `${fullTestId}-note`,
          linkId: `${fullTestId}-note`,
          type: 'string',
          text: 'Notes',
        },
      ],
    });
  }

  labItem.item = testItems;
  (q.item as QuestionnaireItem[]).push(labItem);
}

console.log(JSON.stringify(q, null, 2));
console.log(JSON.stringify(lookup, null, 2));
