import { Coding, Extension, Questionnaire, QuestionnaireItem } from '@medplum/fhirtypes';
import { existsSync, readFileSync } from 'fs';

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
    tests: [
      { code: '1234-5', name: 'Test 1' },
      { code: '11119', name: 'ABN TEST REFUSAL' },
      { code: '38827', name: 'INCORRECT ABN SUBMITTED' },
    ],
  },
  {
    id: 'labcorp',
    name: 'Labcorp',
    tests: [
      { code: '001453', name: 'Hemoglobin A1c' },
      { code: '010322', name: 'Prostate-Specific Ag' },
      { code: '322000', name: 'Comp. Metabolic Panel (14)' },
      { code: '322755', name: 'Hepatic Function Panel (7)' },
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

// Codes for test 2 Send these ICD10 Diagnosis Codes:
// E04.2 , D63.1, E11.42,  Z00.00, Z34.90, M10.9, R53.83, D64.9, N13.5, I10, E88.89, F06.8

const diagnosticCodes: Coding[] = [
  { code: 'D63.1', display: 'Anemia in chronic kidney disease' },
  { code: 'D64.9', display: 'Anemia, unspecified' },
  { code: 'E04.2', display: 'Nontoxic multinodular goiter' },
  { code: 'E05.90', display: 'Hyperthyroidism, unspecified' },
  { code: 'E11.9', display: 'Diabetes mellitus, unspecified' },
  { code: 'E11.42', display: 'Type 2 diabetes mellitus with diabetic polyneuropathy' },
  { code: 'E55.9', display: 'Vitamin D deficiency, unspecified' },
  { code: 'E78.2', display: 'Mixed hyperlipidemia' },
  { code: 'E88.89', display: 'Other specified metabolic disorders' },
  { code: 'F06.8', display: 'Other specified mental disorders due to known physiological condition' },
  { code: 'I10', display: 'Essential (primary) hypertension' },
  { code: 'K70.30', display: 'Alcoholic cirrhosis of liver without ascites' },
  { code: 'K76.0', display: 'Fatty (change of) liver, not elsewhere classified' },
  { code: 'M10.9', display: 'Gout, unspecified' },
  { code: 'N13.5', display: 'Crossing vessel and stricture of ureter' },
  { code: 'N18.3', display: 'Chronic kidney disease, stage 3 (moderate)' },
  { code: 'R53.83', display: 'Other fatigue' },
  { code: 'Z00.00', display: 'Encounter for general adult medical examination without abnormal findings' },
  { code: 'Z34.90', display: 'Encounter for supervision of normal pregnancy, unspecified trimester' },
];

const pageExtension: Extension[] = [
  {
    url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
    valueCodeableConcept: {
      coding: [
        {
          system: 'http://hl7.org/fhir/questionnaire-item-control',
          code: 'page',
        },
      ],
    },
  },
];

const testCodeLookup: Record<string, string> = {};

const q: Questionnaire = {
  resourceType: 'Questionnaire',
  name: 'Health Gorilla Order Form',
  title: 'Health Gorilla Order Form',
  status: 'active',
  item: [
    {
      id: 'page1',
      linkId: 'page1',
      type: 'group',
      text: 'People',
      extension: pageExtension,
      item: [
        {
          id: 'practitioner',
          linkId: 'practitioner',
          type: 'reference',
          text: 'Ordering Provider',
          required: true,
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
              valueCode: 'Practitioner',
            },
          ],
        },
        {
          id: 'patient',
          linkId: 'patient',
          type: 'reference',
          text: 'Patient',
          required: true,
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
              valueCode: 'Patient',
            },
          ],
        },
      ],
    },
    {
      id: 'page2',
      linkId: 'page2',
      type: 'group',
      text: 'Performer',
      extension: pageExtension,
      item: [
        {
          id: 'performer',
          linkId: 'performer',
          type: 'choice',
          text: 'Performing Lab',
          required: true,
          answerOption: labs.map((lab) => ({
            id: lab.id,
            valueString: lab.name,
          })),
        },
      ],
    },
    {
      id: 'page3',
      linkId: 'page3',
      type: 'group',
      text: 'Tests',
      extension: pageExtension,
      item: [],
    },
    {
      id: 'page4',
      linkId: 'page4',
      type: 'group',
      text: 'Diagnoses',
      extension: pageExtension,
      item: [
        {
          id: 'diagnoses',
          linkId: 'diagnoses',
          type: 'group',
          item: diagnosticCodes.map((code) => ({
            id: 'diagnosis-' + code.code,
            linkId: 'diagnosis-' + code.code,
            type: 'boolean',
            text: `${code.display} [${code.code}]`,
          })),
        },
        {
          id: 'specimenCollectedDateTime',
          linkId: 'specimenCollectedDateTime',
          type: 'dateTime',
          text: 'Specimen collected date/time',
        },
        {
          id: 'orderNote',
          linkId: 'orderNote',
          type: 'string',
          text: 'Notes',
        },
      ],
    },
    {
      id: 'page5',
      linkId: 'page5',
      type: 'group',
      text: 'Billing',
      extension: pageExtension,
      item: [
        {
          id: 'account',
          linkId: 'account',
          type: 'reference',
          text: 'Account',
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
              valueCode: 'Account',
            },
          ],
        },
      ],
    },
  ],
};

const testsPageItems = (q.item as QuestionnaireItem[])[2].item as QuestionnaireItem[];

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
    testCodeLookup[fullTestId] = test.name;

    // Add a checkbox for the test
    testItems.push({
      id: fullTestId,
      linkId: fullTestId,
      type: 'boolean',
      text: `${test.name} (${test.code})`,
    });

    // Build a group of supplemental questions that is only enabled when the test is enabled
    // Always ask for priority and notes
    const detailsGroup: QuestionnaireItem & { item: QuestionnaireItem[] } = {
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
    };

    // Check for AOE Questionnaire
    const aoeFileName = `./questionnaire-f-388554647b89801ea5e8320b-${test.code}.json`;
    if (existsSync(aoeFileName)) {
      const aoeQuestionnaire = JSON.parse(readFileSync(aoeFileName, 'utf8'));
      if (aoeQuestionnaire.item) {
        detailsGroup.item.push(
          ...aoeQuestionnaire.item.map((i: QuestionnaireItem) => ({
            ...i,
            id: `${fullTestId}-aoe-${i.id}`,
            linkId: `${fullTestId}-aoe-${i.id}`,
          }))
        );
      }
    }

    // Add a group of supplemental questions that is only enabled when the test is enabled
    testItems.push(detailsGroup);
  }

  labItem.item = testItems;
  testsPageItems.push(labItem);
}

const diagnosisCodeLookup = Object.fromEntries(diagnosticCodes.map((code) => [`diagnosis-${code.code}`, code.display]));

console.log(JSON.stringify(q, null, 2));
console.log(JSON.stringify(testCodeLookup, null, 2));
console.log(JSON.stringify(diagnosisCodeLookup, null, 2));
