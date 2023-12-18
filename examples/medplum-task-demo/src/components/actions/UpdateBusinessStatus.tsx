import { Button, Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { getQuestionnaireAnswers, MedplumClient, normalizeErrorString, PatchOperation } from '@medplum/core';
import { CodeableConcept, Coding, Questionnaire, QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useState } from 'react';

interface UpdateBusinessStatusProps {
  task: Task;
  onChange: (updatedTask: Task) => void;
}

export function UpdateBusinessStatus(props: UpdateBusinessStatusProps): JSX.Element {
  const medplum = useMedplum();
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const handleOpenClose = (): void => {
    setIsModalOpen(!isModalOpen);
  };

  const handleUpdateStatus = async (
    status: Coding,
    task: Task,
    medplum: MedplumClient,
    onChange: (task: Task) => void
  ): Promise<void> => {
    if (!task?.id) {
      return;
    }

    // Create a businessStatus to add to the task. For more details, see https://www.medplum.com/docs/careplans/tasks#task-status
    const businessStatus: CodeableConcept = { coding: [status] };
    console.log(businessStatus);

    // We use a patch operation here to avoid race conditions. This ensures that if multiple users try to update the status simultaneously, only one will be successful.
    const ops: PatchOperation[] = [{ op: 'test', path: '/meta/versionId', value: task.meta?.versionId }];
    const op: PatchOperation['op'] = task.businessStatus ? 'replace' : 'add';

    ops.push({ op, path: '/businessStatus', value: businessStatus });

    // Patch the task with the new businessStatus
    try {
      const result = await medplum.patchResource('Task', task.id, ops);
      notifications.show({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Status updated.',
      });
      onChange(result);
    } catch (error) {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(error),
      });
    }
  };

  const onQuestionnaireSubmit = (formData: QuestionnaireResponse): void => {
    const status = getQuestionnaireAnswers(formData)['update-status'].valueCoding;

    if (status) {
      handleUpdateStatus(status, props.task, medplum, props.onChange).catch((error) => console.error(error));
    }

    setIsModalOpen(false);
  };

  return (
    <div>
      <Button fullWidth onClick={handleOpenClose}>
        Update Business Status
      </Button>
      <Modal opened={isModalOpen} onClose={handleOpenClose}>
        <QuestionnaireForm questionnaire={updateStatusQuestionnaire} onSubmit={onQuestionnaireSubmit} />
      </Modal>
    </div>
  );
}

const updateStatusQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: 'update-status',
  title: 'Update the Status of the Task',
  item: [
    {
      linkId: 'update-status',
      text: 'Update Status',
      type: 'choice',
      answerValueSet: 'https://medplum.com/medplum-task-example-app/task-status-valueset',
    },
  ],
};
