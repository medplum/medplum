import { Group } from '@mantine/core';
import { SoapNote } from '../../components/soapnote/SoapNote';
import { TaskList } from '../../components/tasks/TaskList';

export function EncounterTab(): JSX.Element {
  return (
    <Group gap="xs" justify="center" align="flex-start" w="100%" grow>
      <TaskList />
      <SoapNote />
    </Group>
  );
}
