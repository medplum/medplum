import { Condition, ValueSet } from '@medplum/fhirtypes';

const sampleCondition: Condition =
  // start-block sampleCondition
  {
    resourceType: 'Condition',
    subject: {
      reference: 'Patient/homer-simpson',
    },
    code: {
      coding: [
        {
          system: 'http://hl7.org/fhir/sid/icd-10',
          code: 'C46.50',
          display: "Kaposi's sarcoma of unspecified lung",
        },
      ],
    },
    clinicalStatus: {
      coding: [
        {
          system: 'http://hl7.org/fhir/ValueSet/condition-clinical',
          code: 'active',
          display: 'Active',
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: 'http://hl7.org/fhir/ValueSet/condition-ver-status',
          code: 'confirmed',
          display: 'Confirmed',
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system: 'http://hl7.org/fhir/ValueSet/condition-category',
            code: 'encounter-diagnosis',
            display: 'Encounter Diagnosis',
          },
        ],
      },
    ],
    severity: {
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: '24484000',
          display: 'Severe',
        },
      ],
    },
    onsetString: '2023-11-11',
    stage: [
      {
        summary: {
          coding: [
            {
              system: 'https://example-org.com/cancer-stages',
              code: 'stage-3',
              display: 'Stage 3',
            },
          ],
        },
      },
    ],
    evidence: [
      {
        detail: [
          {
            reference: 'Observation/lung-tumor',
          },
        ],
      },
    ],
    note: [
      {
        text: 'Patient has a family history of cancer.',
      },
    ],
  };
// end-block sampleCondition

const sampleValueSet: ValueSet =
  // start-block sampleValueSet
  {
    resourceType: 'ValueSet',
    status: 'active',
    url: 'http://hl7.org/fhir/sid/icd-10',
    name: 'example-conditions',
    title: 'Example Conditions',
    compose: {
      include: [
        {
          system: 'http://hl7.org/fhir/sid/icd-10',
          concept: [
            {
              code: 'D63.1',
              display: 'Anemia in chronic kidney disease',
            },
            {
              code: 'D64.9',
              display: 'Anemia, unspecified',
            },
            {
              code: 'E04.2',
              display: 'Nontoxic multinodular goiter',
            },
            {
              code: 'E05.90',
              display: 'Thyrotoxicosis, unspecified without thyrotoxic crisis or storm',
            },
            {
              code: 'E11.9',
              display: 'Type 2 diabetes mellitus without complications',
            },
            {
              code: 'E11.42',
              display: 'Type 2 diabetes mellitus with diabetic polyneuropathy',
            },
            {
              code: 'E55.9',
              display: 'Vitamin D deficiency, unspecified',
            },
            {
              code: 'E78.2',
              display: 'Mixed hyperlipidemia',
            },
            {
              code: 'E88.89',
              display: 'Other specified metabolic disorder',
            },
            {
              code: 'F06.8',
              display: 'Other specified mental disorders due to known physiological condition',
            },
            {
              code: 'I10',
              display: 'Essential (primary) hypertension',
            },
            {
              code: 'K70.30',
              display: 'Alcoholic cirrhosis of the liver without ascites',
            },
            {
              code: 'K76.0',
              display: 'Fatty (change of) liver, not elsewhere classified',
            },
            {
              code: 'M10.9',
              display: 'Gout, unspecified',
            },
            {
              code: 'N13.5',
              display: 'Crossing vessel and stricture of ureter without hyrdronephrosis',
            },
            {
              code: 'N18.3',
              display: 'Chronic kidney disease, stage 3 (moderate)',
            },
            {
              code: 'R53.83',
              display: 'Other fatigue',
            },
            {
              code: 'Z00.00',
              display: 'Encounter for general adult medical examination without abnormal findings',
            },
            {
              code: 'Z34.90',
              display: 'Encounter for supervision of normal pregnancy, unspecified, unspecified trimester',
            },
          ],
        },
      ],
    },
  };
// end-block sampleValueSet

console.log(sampleCondition, sampleValueSet);
