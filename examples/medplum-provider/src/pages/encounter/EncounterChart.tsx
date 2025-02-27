import { Text, Stack, Box } from '@mantine/core';
import { Encounter, QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { Outlet, useLocation, useParams } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import { IconCircleOff } from '@tabler/icons-react';
import { AddPlanDefinition } from '../components/AddPlanDefinitions/AddPlanDefinition';
import { TaskPanel } from '../components/Task/TaskPanel';

export const EncounterChart = (): JSX.Element => {
  const { patientId, encounterId } = useParams();
  const medplum = useMedplum();
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const location = useLocation();

  const fetchTasks = useCallback(async (): Promise<void> => {
    const encounterResult = await medplum.readResource('Encounter', encounterId as string);
    setEncounter(encounterResult);

    const taskResult = await medplum.searchResources('Task', `encounter=Encounter/${encounterId}`, {
      cache: 'no-cache',
    });

    taskResult.sort((a: Task, b: Task) => {
      const dateA = new Date(a.authoredOn || '').getTime();
      const dateB = new Date(b.authoredOn || '').getTime();
      return dateA - dateB;
    });

    setTasks(taskResult);
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

  const updateTaskList = useCallback(
    (updatedTask: Task): void => {
      setTasks(tasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)));
    },
    [tasks]
  );

  const handleSaveChanges = useCallback(
    async (task: Task, questionnaireResponse: QuestionnaireResponse): Promise<void> => {
      try {
        const response = await medplum.createResource<QuestionnaireResponse>(questionnaireResponse);
        const updatedTask = await medplum.updateResource<Task>({
          ...task,
          status: 'completed',
          output: [
            {
              type: {
                text: 'QuestionnaireResponse',
              },
              valueReference: {
                reference: getReferenceString(response),
              },
            },
          ],
        });
        updateTaskList(updatedTask);
      } catch (err) {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(err),
        });
      }
    },
    [medplum, updateTaskList]
  );

  return (
    <>
      <Box p="md">
        <Text size="lg" color="dimmed" mb="lg">
          Encounter {encounter?.period?.start ?? ''}
        </Text>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 250px', gap: '24px' }}>
          <Stack gap="md">
            <Stack gap="md">
              {tasks?.map((task: Task) => (
                <TaskPanel
                  key={task.id}
                  task={task}
                  onSaveQuestionnaire={handleSaveChanges}
                  onCompleteTask={updateTaskList}
                />
              ))}
            </Stack>
          </Stack>

          <Stack gap="lg">
            {encounterId && patientId && (
              <AddPlanDefinition encounterId={encounterId} patientId={patientId} onApply={fetchTasks} />
            )}
          </Stack>
        </div>
        <Outlet />
      </Box>
    </>
  );
};
