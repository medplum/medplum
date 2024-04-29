import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { getQuestionnaireAnswers, MedplumClient, PatchOperation } from '@medplum/core';
import { Questionnaire, QuestionnaireResponse, Reference, Task } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';

interface AssignTaskProps {
  readonly task: Task;
  readonly onChange: (updatedTask: Task) => void;
}

export function AssignTask(props: AssignTaskProps): JSX.Element {
  const medplum = useMedplum();
  const [opened, { toggle, close }] = useDisclosure(false);

  const handleAssignTask = async (
    owner: Reference,
    task: Task,
    medplum: MedplumClient,
    onChange: (task: Task) => void
  ): Promise<void> => {
    const taskId = task.id as string;

    // We use a patch operation here to avoid race conditions. This ensures that if multiple users try to reassign the task simultaneously, only one will be successful.
    const ops: PatchOperation[] = [{ op: 'test', path: '/meta/versionId', value: task.meta?.versionId }];
    const op: PatchOperation['op'] = task.owner ? 'replace' : 'add';

    // Assign the task to the new owner. For more details on assigning task, see https://www.medplum.com/docs/careplans/tasks#task-assignment
    ops.push({ op, path: '/owner', value: owner });

    // Patch the task with the new owner
    try {
      const result = await medplum.patchResource('Task', taskId, ops);
      notifications.show({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Task assigned',
      });
      onChange(result);
    } catch {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: 'Another user modified the task.',
      });
    }
  };

  const onQuestionnaireSubmit = (formData: QuestionnaireResponse): void => {
    const owner = getQuestionnaireAnswers(formData)['owner'].valueReference;

    if (owner) {
      handleAssignTask(owner, props.task, medplum, props.onChange).catch((error) => console.error(error));
    }

    close();
  };

  return (
    <div>
      <Button fullWidth onClick={toggle}>
        {props.task.owner ? 'Reassign Task' : 'Assign Task'}
      </Button>
      <Modal opened={opened} onClose={close}>
        <QuestionnaireForm questionnaire={assignTaskQuestionnaire} onSubmit={onQuestionnaireSubmit} />
      </Modal>
    </div>
  );
}

const assignTaskQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  id: 'assign-task',
  title: 'Assign Owner to the Task',
  item: [
    {
      linkId: 'owner',
      text: 'Owner',
      type: 'reference',
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://hl7.org/fhir/fhir-types',
                display: 'Practitioner',
                code: 'Practitioner',
              },
            ],
          },
        },
      ],
    },
  ],
};
