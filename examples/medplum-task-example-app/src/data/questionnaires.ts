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
  id: 'due-date',
  title: 'Due-Date',
  item: [
    {
      linkId: 'due-date',
      text: 'The date the task should be completed',
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
      answerValueSet: 'https://example-business.org',
    },
  ],
};
