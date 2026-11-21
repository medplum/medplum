// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// start-block imports
import type { Extension, Questionnaire, QuestionnaireItem } from '@medplum/fhirtypes';
// end-block imports

// start-block inputs
export const activityInputs: QuestionnaireItem[] = [
  { linkId: 'morning-minutes', type: 'integer', text: 'Morning activity (minutes)', required: true },
  { linkId: 'afternoon-minutes', type: 'integer', text: 'Afternoon activity (minutes)', required: true },
];
// end-block inputs

// start-block calculated
const morningAnswer = "%resource.item.item.where(linkId = 'morning-minutes').answer.value";
const afternoonAnswer = "%resource.item.item.where(linkId = 'afternoon-minutes').answer.value";

export const totalMinutes: QuestionnaireItem = {
  linkId: 'total-minutes',
  type: 'integer',
  text: 'Total activity (minutes)',
  extension: [
    {
      url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
      valueExpression: {
        language: 'text/fhirpath',
        expression: `iif(${morningAnswer}.empty(), 0, ${morningAnswer}) + iif(${afternoonAnswer}.empty(), 0, ${afternoonAnswer})`,
      },
    },
  ],
};
// end-block calculated

// start-block condition
export const activityComparison: QuestionnaireItem = {
  linkId: 'activity-comparison',
  type: 'text',
  text: 'How did the morning and afternoon activities compare?',
  extension: [
    {
      url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-enableWhenExpression',
      valueExpression: {
        language: 'text/fhirpath',
        expression: `(${morningAnswer} > 0) and (${afternoonAnswer} > 0)`,
      },
    },
  ],
};
// end-block condition

// start-block pages
const pageControl: Extension = {
  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
  valueCodeableConcept: {
    coding: [{ system: 'http://hl7.org/fhir/questionnaire-item-control', code: 'page' }],
  },
};

export const activityQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'draft',
  title: 'Daily activity log',
  subjectType: ['Patient'],
  item: [
    {
      linkId: 'activity',
      type: 'group',
      text: 'Activity',
      extension: [pageControl],
      item: activityInputs,
    },
    {
      linkId: 'review',
      type: 'group',
      text: 'Review',
      extension: [pageControl],
      item: [totalMinutes, activityComparison],
    },
  ],
};
// end-block pages
