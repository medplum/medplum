import { Text, Stack, Box, Button } from '@mantine/core';
import { Encounter, Task } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { Outlet, useLocation, useParams } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { IconCircleOff } from '@tabler/icons-react';
import { TaskQuestionnaireResponseSummaryPanel } from '../components/Task/TaskQuestionnaireResponseSummaryPanel';

export const EncounterComplete = (): JSX.Element => {
  const { encounterId } = useParams();
  const medplum = useMedplum();
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const location = useLocation();

  const fetchTasks = useCallback(async (): Promise<void> => {
    const encounterResult = await medplum.readResource('Encounter', encounterId as string);
    setEncounter(encounterResult);

    const taskResult = await medplum.searchResources('Task', `encounter=Encounter/${encounterId}`);

    taskResult.sort((a: Task, b: Task) => {
      const dateA = new Date(a.authoredOn || '').getTime();
      const dateB = new Date(b.authoredOn || '').getTime();
      return dateA - dateB;
    });

    setTasks(taskResult.filter((task: Task) => task.output?.[0]?.valueReference));
  }, [medplum, encounterId]);

  useEffect(() => {
    fetchTasks().catch((err) => {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    });
  }, [medplum, encounterId, fetchTasks, location.pathname]);

  return (
    <>
      <Box p="md">
        <Text size="lg" color="dimmed" mb="lg">
          Encounter {encounter?.period?.start ?? ''}
        </Text>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
          <Stack gap="md">
            <Stack gap="md">
              {tasks?.map((task: Task) => <TaskQuestionnaireResponseSummaryPanel task={task} key={task.id} />)}
            </Stack>
          </Stack>

          <Stack gap="lg">
            <Button variant="outline">View Claim</Button>
          </Stack>
        </div>
        <Outlet />
      </Box>
    </>
  );
};
