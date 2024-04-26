import { Questionnaire } from '@medplum/fhirtypes';

const encounterNoteQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'Encounter Note',
  id: 'encounter-note',
  item: [
    {
      linkId: 'observation',
      type: 'group',
      text: 'Observations',
      repeats: true,
      item: [
        {
          linkId: 'observation-status',
          text: 'Status',
          type: 'choice',
          answerValueSet: 'http://hl7.org/fhir/ValueSet/observation-status',
        },
        {
          linkId: 'observation-category',
          text: 'Category',
          type: 'choice',
          answerValueSet: 'http://hl7.org/fhir/ValueSet/observation-category',
        },
        {
          linkId: 'observation-interpretation',
          text: 'Interpretation',
          type: 'choice',
          answerValueSet: 'http://hl7.org/fhir/ValueSet/observation-interpretation',
        },
        {
          linkId: 'observation-specimen',
          text: 'Specimen',
          type: 'reference',
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
              valueCodeableConcept: {
                coding: [
                  {
                    code: 'Specimen',
                  },
                ],
              },
            },
          ],
        },
        {
          linkId: 'observation-reference-range',
          text: 'Reference Range',
          type: 'group',
          item: [
            {
              linkId: 'observation-reference-range-low',
              text: 'Low Bound',
              type: 'quantity',
            },
            {
              linkId: 'observation-reference-range-high',
              text: 'High Bound',
              type: 'quantity',
            },
          ],
        },
        {
          linkId: 'observation-note',
          text: 'Comments about the observation',
          type: 'string',
        },
      ],
    },
    {
      linkId: 'conditions',
      text: 'Conditions',
      type: 'group',
      repeats: true,
      item: [
        {
          linkId: 'condition-clinical-status',
          type: 'choice',
          text: 'Clinical status',
          answerValueSet: 'http://hl7.org/fhir/ValueSet/condition-clinical',
        },
        {
          linkId: 'condition-verification-status',
          type: 'choice',
          text: 'Verification status',
          answerValueSet: 'http://hl7.org/fhir/ValueSet/condition-ver-status',
        },
        {
          linkId: 'condition-problem-list',
          type: 'boolean',
          text: 'Add to problem list?',
        },
        {
          linkId: 'condition-code',
          type: 'choice',
          text: 'Condition code',
          answerValueSet: 'http://hl7.org/fhir/ValueSet/condition-code',
        },
        {
          linkId: 'condition-severity',
          type: 'choice',
          text: 'Severity',
          answerValueSet: 'http://hl7.org/fhir/ValueSet/condition-severity',
        },
        {
          linkId: 'condition-onset',
          type: 'date',
          text: 'Onset date',
        },
        {
          linkId: 'condition-abatement',
          type: 'date',
          text: 'Abatement date',
        },
        {
          linkId: 'condition-evidence',
          type: 'choice',
          text: 'Evidence',
          answerValueSet: 'http://hl7.org/fhir/ValueSet/clinical-findings',
        },
      ],
    },
    {
      linkId: 'clinical-impressions',
      type: 'string',
      text: 'Notes and Comments',
      repeats: true,
    },
  ],
};

export default encounterNoteQuestionnaire;
