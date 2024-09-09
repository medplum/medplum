import { createReference, getReferenceString } from '@medplum/core';
import { PlanDefinition, Questionnaire, QuestionnaireResponse, RequestGroup, Task } from '@medplum/fhirtypes';
import { DrAliceSmith } from './alice';
import { HomerSimpson } from './simpsons';

export const ExampleWorkflowQuestionnaire1: Questionnaire = {
  resourceType: 'Questionnaire',
  id: 'workflow-questionnaire-1',
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

export const ExampleWorkflowQuestionnaire2: Questionnaire = {
  resourceType: 'Questionnaire',
  id: 'workflow-questionnaire-2',
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

export const ExampleWorkflowQuestionnaire3: Questionnaire = {
  resourceType: 'Questionnaire',
  id: 'workflow-questionnaire-3',
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

export const ExampleWorkflowPlanDefinition: PlanDefinition = {
  resourceType: 'PlanDefinition',
  id: 'workflow-plan-definition-1',
  status: 'active',
  title: 'Example Plan Definition',
  action: [
    {
      title: ExampleWorkflowQuestionnaire1.title,
      definitionCanonical: getReferenceString(ExampleWorkflowQuestionnaire1),
    },
    {
      title: ExampleWorkflowQuestionnaire2.title,
      definitionCanonical: getReferenceString(ExampleWorkflowQuestionnaire2),
    },
    {
      title: ExampleWorkflowQuestionnaire3.title,
      definitionCanonical: getReferenceString(ExampleWorkflowQuestionnaire3),
    },
  ],
};

export const ExampleWorkflowQuestionnaireResponse1: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  id: 'workflow-questionnaire-response-1',
  status: 'completed',
  questionnaire: getReferenceString(ExampleWorkflowQuestionnaire1),
  subject: createReference(HomerSimpson),
  source: createReference(HomerSimpson),
};

// Based on: http://build.fhir.org/ig/HL7/sdc/Task-example.json.html
export const ExampleWorkflowTask1: Task = {
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

export const ExampleWorkflowTask2: Task = {
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

export const ExampleWorkflowTask3: Task = {
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

export const ExampleWorkflowRequestGroup: RequestGroup = {
  resourceType: 'RequestGroup',
  id: 'workflow-request-group-1',
  instantiatesCanonical: [getReferenceString(ExampleWorkflowPlanDefinition)],
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
