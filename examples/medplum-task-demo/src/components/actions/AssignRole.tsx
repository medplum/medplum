import { Button, Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { MedplumClient, PatchOperation, getQuestionnaireAnswers, normalizeErrorString } from '@medplum/core';
import { CodeableConcept, Coding, Questionnaire, QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useState } from 'react';

interface AssignTaskProps {
  task: Task;
  onChange: (updatedTask: Task) => void;
}

export function AssignRole(props: AssignTaskProps): JSX.Element {
  const medplum = useMedplum();
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const handleOpenClose = (): void => {
    setIsModalOpen(!isModalOpen);
  };

  const handleAssignToRole = async (
    role: Coding,
    task: Task,
    medplum: MedplumClient,
    onChange: (task: Task) => void
  ): Promise<void> => {
    if (!task?.id) {
      return;
    }

    const updatedRole: CodeableConcept = { coding: [role] };

    const ops: PatchOperation[] = [{ op: 'test', path: '/meta/versionId', value: task.meta?.versionId }];
    const op: PatchOperation['op'] = task.performerType ? 'replace' : 'add';

    const updatedRoles = task.performerType ? [...task.performerType] : [];

    updatedRoles.push(updatedRole);

    ops.push({ op, path: '/performerType', value: updatedRoles });
    console.log(ops);

    try {
      const result = await medplum.patchResource('Task', task.id, ops);
      notifications.show({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Task assigned',
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
    const role = getQuestionnaireAnswers(formData)['assign-role'].valueCoding;

    if (role) {
      handleAssignToRole(role, props.task, medplum, props.onChange).catch((error) => console.error(error));
    }

    setIsModalOpen(false);
  };

  return (
    <div>
      <Button fullWidth onClick={handleOpenClose}>
        Assign to a Role
      </Button>
      <Modal opened={isModalOpen} onClose={handleOpenClose}>
        <QuestionnaireForm questionnaire={assignRoleQuestionnaire} onSubmit={onQuestionnaireSubmit} />
      </Modal>
    </div>
  );
}

const assignRoleQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  id: 'assign-role',
  title: 'Assign to a Role',
  item: [
    {
      linkId: 'assign-role',
      text: 'Select Role',
      type: 'choice',
      answerValueSet: 'http://medplum.com/medplum-task-demo/practitioner-role-codes',
    },
  ],
};
