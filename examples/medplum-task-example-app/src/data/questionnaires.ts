import { Questionnaire } from '@medplum/fhirtypes';

export const commentQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: 'add-comment',
  title: 'Add a comment',
  item: [
    {
      linkId: 'new-comment',
      text: 'Add a comment',
      type: 'string',
    },
  ],
};

export const dueDateQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: 'add-due-date',
  title: 'Add a due date',
  item: [
    {
      linkId: 'due-date',
      text: 'Add a due date',
      type: 'date',
    },
  ],
};

export const assignTaskQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: 'assign-task',
  title: 'Assign Owner to the Task',
  item: [
    {
      linkId: 'owner',
      text: 'Owner',
      type: 'reference',
    },
  ],
};

export const updateStatusQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: 'update-status',
  title: 'Update the Status of the Task',
  item: [
    {
      linkId: 'update-status',
      text: 'Update Status',
      type: 'choice',
      answerValueSet: 'http://hl7.org/fhir/ValueSet/task-status',
    },
  ],
};
