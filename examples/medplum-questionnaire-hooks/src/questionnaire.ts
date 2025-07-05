import { Questionnaire } from '@medplum/fhirtypes';

export const PagedQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: 'pages-example',
  status: 'active',
  title: 'Pages Example',
  item: [
    {
      linkId: 'group1',
      text: 'Page Sequence 1',
      type: 'group',
      item: [
        {
          linkId: 'question1',
          text: 'Question 1',
          type: 'string',
        },
        {
          linkId: 'question2',
          text: 'Question 2',
          type: 'string',
          required: true,
        },
        {
          linkId: 'question3',
          text: 'Question 3',
          type: 'string',
        },
      ],
      extension: [
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
      ],
    },
    {
      linkId: 'group2',
      text: 'Page Sequence 2',
      type: 'group',
      item: [
        {
          linkId: 'question4',
          text: 'Question 4',
          type: 'string',
        },
        {
          linkId: 'question5',
          text: 'Question 5',
          type: 'string',
        },
      ],
      extension: [
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
      ],
    },
  ],
};
