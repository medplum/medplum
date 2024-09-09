import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { normalizeErrorString, PatchOperation } from '@medplum/core';
import { Task } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';

interface CompleteTaskProps {
  readonly task: Task;
  readonly onChange: (updatedTask: Task) => void;
}

export function CompleteTask({ task, onChange }: CompleteTaskProps): JSX.Element {
  const medplum = useMedplum();
  const handleCompleteTask = async (): Promise<void> => {
    const taskId = task.id as string;

    const ops: PatchOperation[] = [
      { op: 'test', path: '/meta/versionId', value: task.meta?.versionId },
      { op: 'replace', path: '/status', value: 'completed' },
    ];

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
      {task.status === 'completed' ? null : (
        <Button fullWidth onClick={handleCompleteTask}>
          Complete Task
        </Button>
      )}
    </div>
  );
}
