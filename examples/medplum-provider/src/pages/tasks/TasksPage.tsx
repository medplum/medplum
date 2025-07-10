import { Flex, Group, Paper, Stack, Text } from '@mantine/core';
import { JSX, useEffect, useMemo, useState } from 'react';
import styles from './TasksPage.module.css';
import { Task } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { showErrorNotification } from '../../utils/notifications';
import { createReference, formatDate, getReferenceString, ProfileResource } from '@medplum/core';

export function TasksPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [tasks, setTasks] = useState<Task[]>([]);
  const profileRef = useMemo(() => (profile ? createReference(profile as ProfileResource) : undefined), [profile]);
  
  useEffect(() => {
    const fetchTasks = async (): Promise<void> => {

      const searchParams = new URLSearchParams();
      searchParams.append('status:not', 'completed');
      searchParams.append('status:not', 'cancelled');
      searchParams.append('status:not', 'failed');
      if (profileRef) {
        searchParams.append('owner', getReferenceString(profileRef));
      }
      const tasks = await medplum.searchResources('Task', searchParams, { cache: 'no-cache' });
      setTasks(tasks);
    };

    fetchTasks().catch(showErrorNotification);
  }, [medplum, profileRef]);

  return (
    <div className={styles.container}>
      <Flex h="100%" w="100%">
        <Flex direction="column" w="25%" h="100%" style={{ borderRight: '1px solid var(--mantine-color-gray-3)' }}>
          <Paper h="100%">

            {tasks.map((task) => (
              <Stack key={task.id} p="md" gap={0}>
                <Text key={task.id} fw={500}>{task.description ?? task.id}</Text>
                <Group>
                  {task.restriction?.period && (
                    <Text key={task.id} fw={500}>Due {formatDate(task.restriction?.period?.end)}</Text>
                  )}
                  
                </Group>
                
              </Stack>
            ))}

          </Paper>
        </Flex>

        <Flex direction="column" w="75%" h="100%">
          <Text fw={500}>Placeholder</Text>
        </Flex>
      </Flex>
    </div>
  );
}
