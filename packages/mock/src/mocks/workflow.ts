// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { PlanDefinition, Questionnaire, QuestionnaireResponse, RequestGroup, Task } from '@medplum/fhirtypes';
import { DrAliceSmith } from './alice';
import { HomerSimpson } from './simpsons';

export const ExampleWorkflowQuestionnaire1: WithId<Questionnaire> = {
  resourceType: 'Questionnaire',
  id: 'workflow-questionnaire-1',
  url: 'http://example.com/Questionnaire/workflow-1',
  status: 'active',
  name: 'Patient Registration',
  title: 'Patient Registration',
  subjectType: ['Patient'],
  item: [
    {
      linkId: '1',
      text: 'First question',
      type: 'string',
    },
  ],
};

export const ExampleWorkflowQuestionnaire2: WithId<Questionnaire> = {
  resourceType: 'Questionnaire',
  id: 'workflow-questionnaire-2',
  url: 'http://example.com/Questionnaire/workflow-2',
  status: 'active',
  name: 'Surgery History',
  title: 'Surgery History',
  subjectType: ['Patient'],
  item: [
    {
      linkId: '1',
      text: 'First question',
      type: 'string',
    },
  ],
};

export const ExampleWorkflowQuestionnaire3: WithId<Questionnaire> = {
  resourceType: 'Questionnaire',
  id: 'workflow-questionnaire-3',
  url: 'http://example.com/Questionnaire/workflow-3',
  status: 'active',
  name: 'Family Health History',
  title: 'Family Health History',
  subjectType: ['Patient'],
  item: [
    {
      linkId: '1',
      text: 'First question',
      type: 'string',
    },
  ],
};

export const ExampleWorkflowPlanDefinition: WithId<PlanDefinition> = {
  resourceType: 'PlanDefinition',
  id: 'workflow-plan-definition-1',
  url: 'http://example.com/PlanDefinition/workflow',
  status: 'active',
  title: 'Example Plan Definition',
  action: [
    {
      title: ExampleWorkflowQuestionnaire1.title,
      definitionCanonical: ExampleWorkflowQuestionnaire1.url,
    },
    {
      title: ExampleWorkflowQuestionnaire2.title,
      definitionCanonical: ExampleWorkflowQuestionnaire2.url,
    },
    {
      title: ExampleWorkflowQuestionnaire3.title,
      definitionCanonical: ExampleWorkflowQuestionnaire3.url,
    },
  ],
};

export const ExampleWorkflowQuestionnaireResponse1: WithId<QuestionnaireResponse> = {
  resourceType: 'QuestionnaireResponse',
  id: 'workflow-questionnaire-response-1',
  status: 'completed',
  questionnaire: ExampleWorkflowQuestionnaire1.url,
  subject: createReference(HomerSimpson),
  source: createReference(HomerSimpson),
};

// Based on: http://build.fhir.org/ig/HL7/sdc/Task-example.json.html
export const ExampleWorkflowTask1: WithId<Task> = {
  resourceType: 'Task',
  id: 'workflow-task-1',
  status: 'completed',
  intent: 'order',
  meta: { author: createReference(HomerSimpson) },
  requester: createReference(DrAliceSmith),
  input: [
    {
      type: { text: 'Questionnaire' },
      valueReference: createReference(ExampleWorkflowQuestionnaire1),
    },
  ],
  output: [
    {
      type: { text: 'QuestionnaireResponse' },
      valueReference: createReference(ExampleWorkflowQuestionnaireResponse1),
    },
  ],
};

export const ExampleWorkflowTask2: WithId<Task> = {
  resourceType: 'Task',
  id: 'workflow-task-2',
  status: 'requested',
  intent: 'order',
  meta: { author: createReference(DrAliceSmith) },
  requester: createReference(DrAliceSmith),
  input: [
    {
      type: { text: 'Questionnaire' },
      valueReference: createReference(ExampleWorkflowQuestionnaire2),
    },
  ],
};

export const ExampleWorkflowTask3: WithId<Task> = {
  resourceType: 'Task',
  id: 'workflow-task-3',
  status: 'requested',
  intent: 'order',
  meta: { author: createReference(DrAliceSmith) },
  requester: createReference(DrAliceSmith),
  input: [
    {
      type: { text: 'Questionnaire' },
      valueReference: createReference(ExampleWorkflowQuestionnaire3),
    },
  ],
};

export const ExampleWorkflowRequestGroup: WithId<RequestGroup> = {
  resourceType: 'RequestGroup',
  id: 'workflow-request-group-1',
  instantiatesCanonical: [ExampleWorkflowPlanDefinition.url as string],
  status: 'active',
  intent: 'order',
  action: [
    {
      title: ExampleWorkflowQuestionnaire1.title,
      resource: createReference(ExampleWorkflowTask1),
    },
    {
      title: ExampleWorkflowQuestionnaire2.title,
      resource: createReference(ExampleWorkflowTask2),
    },
    {
      title: ExampleWorkflowQuestionnaire3.title,
      resource: createReference(ExampleWorkflowTask3),
    },
  ],
};
