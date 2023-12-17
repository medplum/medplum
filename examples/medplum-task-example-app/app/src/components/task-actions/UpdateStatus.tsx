import { Button, Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import { Coding, QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { useState } from 'react';
import { updateStatusQuestionnaire } from './questionnaires';

interface UpdateStatusProps {
  task: Task;
  onChange: () => void;
}

export function UpdateStatus(props: UpdateStatusProps): JSX.Element {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const medplum = useMedplum();

  const handleOpenClose = () => {
    setIsOpen(!isOpen);
  };

  const handleUpdateStatus = async (
    status: Coding,
    task: Task,
    medplum: MedplumClient,
    onChange: (task: Task) => void
  ): Promise<void> => {
    if (!task) {
      return;
    }

    // Create a resource for an updated Task
    const updatedTask: Task = { ...task };

    // Update the status of your Task. For more details see https://www.medplum.com/docs/careplans/tasks#task-status
    updatedTask.businessStatus = { coding: [status] };

    // Update the Task on the server and re-render.
    await medplum.updateResource(updatedTask).catch((error) =>
      notifications.show({
        title: 'Error',
        message: `Error: ${error}`,
      })
    );
    notifications.show({
      title: 'Success',
      message: 'Status updated.',
    });
    onChange(updatedTask);
  };

  const onQuestionnaireSubmit = (formData: QuestionnaireResponse): void => {
    const status = getQuestionnaireAnswers(formData)['update-status'].valueCoding;

    if (status) {
      handleUpdateStatus(status, props.task, medplum, props.onChange);
    }

    handleOpenClose();
  };

  return (
    <div>
      <Button onClick={handleOpenClose}>Update Status</Button>
      <Modal opened={isOpen} onClose={handleOpenClose}>
        <QuestionnaireForm questionnaire={updateStatusQuestionnaire} onSubmit={onQuestionnaireSubmit} />
      </Modal>
    </div>
  );
}
