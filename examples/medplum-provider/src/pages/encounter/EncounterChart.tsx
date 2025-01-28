import { Button, Text, Stack, Group, Box, Select } from '@mantine/core';
import { Encounter, QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { CodeInput, ResourceInput, useMedplum } from '@medplum/react';
import { Outlet, useParams } from 'react-router-dom';
import { TaskQuestionnaireForm } from '../components/TaskQuestionnaireForm';
import { SimpleTask } from '../components/SimpleTask';
import { useCallback, useEffect, useState } from 'react';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import { IconCircleOff } from '@tabler/icons-react';

export const EncounterChart = (): JSX.Element => {
  const { encounterId } = useParams();
  const medplum = useMedplum();
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState<Task['status'] | undefined>();

  useEffect(() => {
    const fetchTasks = async (): Promise<void> => {
      const encounterResult = await medplum.readResource('Encounter', encounterId as string);
      setEncounter(encounterResult);
      setStatus(encounterResult.status as typeof status);

      const taskResult = await medplum.searchResources('Task', `encounter=Encounter/${encounterId}`);
      setTasks(taskResult);
    };

    fetchTasks().catch((err) => {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    });
  }, [medplum, encounterId]);

  const handleSaveChanges = useCallback(
    async (task: Task, questionnaireResponse: QuestionnaireResponse): Promise<void> => {
      try {
        const response = await medplum.createResource<QuestionnaireResponse>(questionnaireResponse);
        const updatedTask = await medplum.updateResource<Task>({
          ...task,
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
        setTasks((prevTasks) => prevTasks.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
      } catch (err) {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(err),
        });
      }
    },
    [medplum]
  );

  return (
    <>
      <Box p="md">
        <Text size="lg" color="dimmed" mb="lg">
          Encounter {encounter?.period?.start ?? ''}
        </Text>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
          <Stack gap="md">
            <Stack gap="md">
              {tasks?.map((task: Task) =>
                task.input && task.input[0]?.type?.text === 'Questionnaire' && task.input[0]?.valueReference ? (
                  <TaskQuestionnaireForm key={task.id} task={task} onSaveQuestionnaire={handleSaveChanges} />
                ) : (
                  <SimpleTask key={task.id} task={task} />
                )
              )}
            </Stack>
          </Stack>

          <Stack gap="lg">
            <Button variant="outline" color="blue" fullWidth>
              Add care template
            </Button>

            <Text size="sm" color="dimmed">
              Task groups predefined by care planner
            </Text>

            <div>
              <CodeInput
                name="status"
                label="Status"
                binding="http://hl7.org/fhir/ValueSet/encounter-status|4.0.1"
                maxValues={1}
                defaultValue={status}
                onChange={(value) => {
                  if (value) {
                    setStatus(value as typeof status);
                  }
                }}
              />
            </div>

            <div>
              <ResourceInput name="practitioner" resourceType="Practitioner" label="Assigned practitioner" />
            </div>

            <div>
              <Text fw={500} mb="xs">
                Encounter Time
              </Text>
              <Select placeholder="1 hour" data={['30 minutes', '1 hour', '2 hours']} />
            </div>

            <Stack gap="md">
              <Button fullWidth>Save changes</Button>

              <Group gap="sm">
                <Button variant="light" color="gray" fullWidth>
                  Mark as finished
                </Button>
              </Group>

              <Text size="sm">Complete all the tasks in encounter before finishing it</Text>
            </Stack>
          </Stack>
        </div>
        <Outlet />
      </Box>
    </>
  );
};
