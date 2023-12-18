import { Button, Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import { QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { useState } from 'react';
import { dueDateQuestionnaire } from './questionnaires';

interface AddDueDateProps {
  task: Task;
  onChange: (updatedTask: Task) => void;
}

export function AddDueDate(props: AddDueDateProps): JSX.Element {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const medplum = useMedplum();

  const handleOpenClose = (): void => {
    setIsOpen(!isOpen);
  };

  const handleAddDueDate = async (
    date: string,
    task: Task,
    medplum: MedplumClient,
    onChange: (task: Task) => void
  ): Promise<void> => {
    const updatedTask: Task = { ...task, resourceType: 'Task' };

    // If there is no defined period for a task, add one
    updatedTask.restriction = updatedTask.restriction ?? {};
    updatedTask.restriction.period = updatedTask.restriction.period ?? {};

    // Set the period end date to your due date. For more details see https://www.medplum.com/docs/careplans/tasks#task-start--due-dates
    updatedTask.restriction.period.end = date;

    // Update the task with the new due date
    await medplum.updateResource(updatedTask).catch((error) =>
      notifications.show({
        title: 'Error',
        message: `Error: ${error}`,
      })
    );
    notifications.show({
      title: 'Success',
      message: 'The due-date has been updated.',
    });
    onChange(updatedTask);
  };

  const onQuestionnaireSubmit = (formData: QuestionnaireResponse): void => {
    const dueDate = getQuestionnaireAnswers(formData)['due-date'].valueDate;

    if (dueDate) {
      handleAddDueDate(dueDate, props.task, medplum, props.onChange);
    }

    handleOpenClose();
  };

  return (
    <div>
      {props.task.restriction?.period?.end ? (
        <Button fullWidth onClick={handleOpenClose}>
          Change Due-Date
        </Button>
      ) : (
        <Button fullWidth onClick={handleOpenClose}>
          Add Due-Date
        </Button>
      )}
      <Modal opened={isOpen} onClose={handleOpenClose}>
        <QuestionnaireForm questionnaire={dueDateQuestionnaire} onSubmit={onQuestionnaireSubmit} />
      </Modal>
    </div>
  );
}
