import { Tooltip, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { MedplumClient, PatchOperation, createReference, formatDateTime, getDisplayString } from '@medplum/core';
import { Practitioner, Task } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleX, IconEdit, IconUser, IconUserSearch } from '@tabler/icons-react';
import { MouseEvent, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStyles } from './TaskRow.styles';
import { formatDueDate, getShortName, getTaskColor } from './utils';

export interface TaskRowProps {
  task: Task;
  withOwner?: boolean;
  withDueDate?: boolean;
  withLastUpdated?: boolean;
  withActions?: boolean;
  onChange: () => void;
}

export function TaskRow(props: TaskRowProps): JSX.Element {
  const { task, withOwner, withDueDate, withActions, withLastUpdated } = props;
  const medplum = useMedplum();
  const profile = medplum.getProfile() as Practitioner;
  const navigate = useNavigate();
  const { classes, cx } = useStyles();

  const assignToMe = useCallback(
    async (e: MouseEvent): Promise<void> => {
      e.stopPropagation();
      e.preventDefault();
      await testAndUpdateTask(medplum, task, 'accepted', profile);
      notifications.show({
        color: 'blue',
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Task assigned to ' + getDisplayString(profile),
      });
      props.onChange();
    },
    [medplum, profile, task, props]
  );

  const markAsCompleted = useCallback(
    async (e: MouseEvent): Promise<void> => {
      e.stopPropagation();
      e.preventDefault();
      await testAndUpdateTask(medplum, task, 'completed');
      notifications.show({
        color: 'teal',
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Task marked as completed',
      });
      props.onChange();
    },
    [medplum, task, props]
  );

  const editTask = useCallback(
    async (e: MouseEvent): Promise<void> => {
      e.stopPropagation();
      e.preventDefault();
      window.open(`https://app.medplum.com/Task/${task.id}`, '_blank', 'noopener,noreferrer');
    },
    [task]
  );

  const cancelTask = useCallback(
    async (e: MouseEvent): Promise<void> => {
      e.stopPropagation();
      e.preventDefault();
      await testAndUpdateTask(medplum, task, 'cancelled');
      notifications.show({
        color: 'red',
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Task marked as completed',
      });
      props.onChange();
    },
    [medplum, task, props]
  );

  const buttons = [
    {
      icon: IconUser,
      label: 'Assign to me',
      color: 'blue',
      onClick: assignToMe,
    },
    {
      icon: IconUserSearch,
      label: 'Assign to...',
      color: 'purple',
      onClick: () => console.log('TODO'),
    },
    {
      icon: IconCircleCheck,
      label: 'Mark as completed',
      color: 'green',
      onClick: markAsCompleted,
    },
    {
      icon: IconEdit,
      label: 'Edit',
      color: 'orange',
      onClick: editTask,
    },
    {
      icon: IconCircleX,
      label: 'Cancel',
      color: 'red',
      onClick: cancelTask,
    },
  ];

  return (
    <tr className={cx(classes.task, classes[getTaskColor(task)])} onClick={() => navigate(`/Task/${task.id}`)}>
      <td>
        <CodeableConceptDisplay value={task.code} />
      </td>
      {withOwner && <td>{getShortName(task.owner?.display)}</td>}
      {withDueDate && <td>{formatDueDate(task)}</td>}
      <td>{task.status}</td>
      {withLastUpdated && <td>{formatDateTime(task.meta?.lastUpdated)}</td>}
      {withActions && (
        <td className={classes.actions}>
          {buttons.map((button) => (
            <Tooltip label={button.label}>
              <UnstyledButton px={1} onClick={button.onClick}>
                <button.icon size={14} color={button.color} />
              </UnstyledButton>
            </Tooltip>
          ))}
        </td>
      )}
    </tr>
  );
}

function testAndUpdateTask(medplum: MedplumClient, task: Task, status: string, user?: Practitioner): Promise<Task> {
  const ops: PatchOperation[] = [
    { op: 'test', path: '/meta/versionId', value: task.meta?.versionId },
    { op: 'replace', path: '/status', value: status },
  ];
  if (user) {
    ops.push({ op: task.owner ? 'replace' : 'add', path: '/owner', value: createReference(user) });
  }
  return medplum.patchResource('Task', task.id as string, ops);
}
