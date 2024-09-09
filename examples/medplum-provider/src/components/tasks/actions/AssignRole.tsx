import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { MedplumClient, PatchOperation, getQuestionnaireAnswers, normalizeErrorString } from '@medplum/core';
import { CodeableConcept, Coding, Questionnaire, QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';

interface AssignTaskProps {
  readonly task: Task;
  readonly onChange: (updatedTask: Task) => void;
}

export function AssignRole(props: AssignTaskProps): JSX.Element {
  const medplum = useMedplum();
  const [opened, { toggle, close }] = useDisclosure(false);

  const handleAssignToRole = async (
    role: Coding,
    task: Task,
    medplum: MedplumClient,
    onChange: (task: Task) => void
  ): Promise<void> => {
    const taskId = task.id as string;

    const updatedRole: CodeableConcept = { coding: [role] };

    const ops: PatchOperation[] = [{ op: 'test', path: '/meta/versionId', value: task.meta?.versionId }];
    const op: PatchOperation['op'] = task.performerType ? 'replace' : 'add';

    const updatedRoles = task.performerType ? [...task.performerType] : [];

    updatedRoles.push(updatedRole);

    ops.push({ op, path: '/performerType', value: updatedRoles });

    try {
      const result = await medplum.patchResource('Task', taskId, ops);
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

    close();
  };

  return (
    <div>
      <Button fullWidth onClick={toggle}>
        Assign to a Role
      </Button>
      <Modal opened={opened} onClose={close}>
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
      answerValueSet: 'http://medplum.com/ValueSet/medplum-provider-practitioner-role-valueset',
    },
  ],
};
