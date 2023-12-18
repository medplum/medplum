import { Button, Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { getQuestionnaireAnswers, MedplumClient, PatchOperation } from '@medplum/core';
import { Questionnaire, QuestionnaireResponse, Reference, Task } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useState } from 'react';

interface AssignTaskProps {
  task: Task;
  onChange: (updatedTask: Task) => void;
}

export function AssignTask(props: AssignTaskProps): JSX.Element {
  const medplum = useMedplum();
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const handleOpenClose = (): void => {
    setIsModalOpen(!isModalOpen);
  };

  const handleAssignTask = async (
    owner: Reference,
    task: Task,
    medplum: MedplumClient,
    onChange: (task: Task) => void
  ): Promise<void> => {
    if (!task?.id) {
      return;
    }

    // We use a patch operation here to avoid race conditions. This ensures that if multiple users try to reassign the task simultaneously, only one will be successful.
    const ops: PatchOperation[] = [{ op: 'test', path: '/meta/versionId', value: task.meta?.versionId }];
    const op: PatchOperation['op'] = task.owner ? 'replace' : 'add';

    // Assign the task to the new owner. For more details on assigning task, see https://www.medplum.com/docs/careplans/tasks#task-assignment
    ops.push({ op, path: '/owner', value: owner });

    // Patch the task with the new owner
    try {
      const result = await medplum.patchResource('Task', task.id, ops);
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

    setIsModalOpen(false);
  };

  return (
    <div>
      <Button fullWidth onClick={handleOpenClose}>
        {props.task.owner ? 'Reassign Task' : 'Assign Task'}
      </Button>
      <Modal opened={isModalOpen} onClose={handleOpenClose}>
        <QuestionnaireForm questionnaire={assignTaskQuestionnaire} onSubmit={onQuestionnaireSubmit} />
      </Modal>
    </div>
  );
}

const assignTaskQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
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
