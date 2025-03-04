import { Stack, Box } from '@mantine/core';
import { Practitioner, QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { Loading, useMedplum } from '@medplum/react';
import { Outlet, useLocation, useParams } from 'react-router';
import { useCallback, useEffect, useState } from 'react';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import { IconCircleOff } from '@tabler/icons-react';
import { AddPlanDefinition } from '../components/AddPlanDefinitions/AddPlanDefinition';
import { TaskPanel } from '../components/Task/TaskPanel';
import { EncounterHeader } from '../components/Encounter/EncounterHeader';
import { usePatient } from '../../hooks/usePatient';
import { useEncounter } from '../../hooks/useEncounter';

export const EncounterChart = (): JSX.Element => {
  const { patientId, encounterId } = useParams();
  const medplum = useMedplum();
  const patient = usePatient();
  const encounter = useEncounter();
  const location = useLocation();
  const [practitioner, setPractitioner] = useState<Practitioner | undefined>();
  const [tasks, setTasks] = useState<Task[]>([]);

  const fetchTasks = useCallback(async (): Promise<void> => {
    if (!encounter) {
      return;
    }

    const taskResult = await medplum.searchResources('Task', `encounter=${getReferenceString(encounter)}`, {
      cache: 'no-cache',
    });

    taskResult.sort((a: Task, b: Task) => {
      const dateA = new Date(a.authoredOn || '').getTime();
      const dateB = new Date(b.authoredOn || '').getTime();
      return dateA - dateB;
    });

    setTasks(taskResult);
  }, [medplum, encounter]);

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

  useEffect(() => {
    const fetchPractitioner = async (): Promise<void> => {
      if (encounter?.participant?.[0]?.individual) {
        const practitionerResult = await medplum.readReference(encounter.participant[0].individual);
        setPractitioner(practitionerResult as Practitioner);
      }
    };

    fetchPractitioner().catch((err) => {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    });
  }, [encounter, medplum]);

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

  if (!patient || !encounter) {
    return <Loading />;
  }

  return (
    <>
      <Stack justify="space-between" gap={0}>
        <EncounterHeader patient={patient} encounter={encounter} practitioner={practitioner} />

        <Box p="md">
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
      </Stack>
    </>
  );
};
