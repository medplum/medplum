import { Button, Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import { QuestionnaireResponse, Reference, Task } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { useState } from 'react';
import { assignTaskQuestionnaire } from './questionnaires';

interface AssignTaskProps {
  task: Task;
  onChange: (updatedTask: Task) => void;
}

type OwnerTypes = Task['owner'];

export function AssignTask(props: AssignTaskProps): JSX.Element {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const medplum = useMedplum();

  const handleOpenClose = (): void => {
    setIsOpen(!isOpen);
  };

  const handleAssignTask = async (
    owner: Reference,
    task: Task,
    medplum: MedplumClient,
    onChange: (task: Task) => void
  ): Promise<void> => {
    if (!task) {
      return;
    }

    // Create a resource for the updated task
    const updatedTask = { ...task };

    // Update the owner, or who is responsible for the task. For more details see https://www.medplum.com/docs/careplans/tasks#task-assignment
    updatedTask.owner = owner as OwnerTypes;

    await medplum.updateResource(updatedTask).catch((error) =>
      notifications.show({
        title: 'Error',
        message: `Error: ${error}`,
      })
    );
    notifications.show({
      title: 'Success',
      message: 'Task assigned.',
    });
    onChange(updatedTask);
  };

  const onQuestionnaireSubmit = (formData: QuestionnaireResponse): void => {
    const owner = getQuestionnaireAnswers(formData)['owner'].valueReference;

    if (owner) {
      handleAssignTask(owner, props.task, medplum, props.onChange);
    }

    handleOpenClose();
  };

  return (
    <div>
      <Button fullWidth onClick={handleOpenClose}>
        {props.task.owner ? 'Reassign Task' : 'Assign Task'}
      </Button>
      <Modal opened={isOpen} onClose={handleOpenClose}>
        <QuestionnaireForm questionnaire={assignTaskQuestionnaire} onSubmit={onQuestionnaireSubmit} />
      </Modal>
    </div>
  );
}
