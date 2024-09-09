import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { normalizeErrorString, PatchOperation } from '@medplum/core';
import { Task } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';

interface PauseResumeTaskProps {
  readonly task: Task;
  readonly onChange: (updatedTask: Task) => void;
}

export function PauseResumeTask({ task, onChange }: PauseResumeTaskProps): JSX.Element {
  const medplum = useMedplum();
  const handleChangeTaskStatus = async (): Promise<void> => {
    const taskId = task.id as string;

    // We use a patch operation here to avoid race conditions. This ensures that if multiple users try to update the status simultaneously, only one will be successful.
    const ops: PatchOperation[] = [{ op: 'test', path: '/meta/versionId', value: task.meta?.versionId }];

    // If the task is paused, resume it, otherwise pause it
    const value: PatchOperation['value'] = task.status === 'on-hold' ? 'in-progress' : 'on-hold';
    ops.push({ op: 'replace', path: '/status', value });

    // Patch the task with the updated status
    try {
      const result = await medplum.patchResource('Task', taskId, ops);
      notifications.show({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: ops[1].value === 'on-hold' ? 'Task paused' : 'Task resumed',
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

  return (
    <div>
      {task.status === 'on-hold' ? (
        <Button fullWidth onClick={handleChangeTaskStatus}>
          Resume Task
        </Button>
      ) : (
        <Button fullWidth onClick={handleChangeTaskStatus}>
          Pause Task
        </Button>
      )}
    </div>
  );
}
