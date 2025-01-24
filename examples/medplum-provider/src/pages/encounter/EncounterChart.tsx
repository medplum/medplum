import { Select, Button, Text, Stack, Group, Box, Card } from '@mantine/core';
import { Questionnaire, QuestionnaireResponse, Reference, Task } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { useParams } from 'react-router-dom';
import { TaskQuestionnaireForm } from '../components/TaskQuestionnaireForm';
import { SimpleTask } from '../components/SimpleTask';
import { useEffect, useMemo, useState } from 'react';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import { IconCircleOff } from '@tabler/icons-react';

export const EncounterChart = (): JSX.Element => {
  const { encounterId } = useParams();
  const medplum = useMedplum();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [questionnaireResponse, setQuestionnaireResponse] = useState<QuestionnaireResponse | undefined>(undefined);
  const [chartQuestionnaire, setChartQuestionnaire] = useState<Reference<Questionnaire>| undefined>(undefined);
  const [chartQuestionnaireResponse, setChartQuestionnaireResponse] = useState<Reference<QuestionnaireResponse> | undefined>(undefined);
  const questionnaireReference = "Questionnaire/0194903a-74f5-72e9-9063-e38b8276a855";

  useEffect(() => {
    const fetchTasks = async (): Promise<void> => {
      const result = await medplum.searchResources('Task', `encounter=Encounter/${encounterId}`);
      console.log(result);
      setTasks(result);
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
  
  const { filteredTasks, chartNoteTasks } = useMemo(() => {
    if (!tasks) {
      return { filteredTasks: [] as Task[], chartNoteTasks: [] as Task[] };
    }

    return tasks.reduce(
      (acc, task) => {
        if (
          Array.isArray(task.input) &&
          task.input.length > 0 &&
          task.input[0]?.valueReference?.reference === questionnaireReference
        ) {
          acc.chartNoteTasks.push(task);
          if (task.output?.[0]?.type?.text === 'QuestionnaireResponse') {
            setChartQuestionnaireResponse(task.output[0].valueReference as Reference<QuestionnaireResponse>);
          }

          if (task.input?.[0]?.type?.text === 'Questionnaire') {
            setChartQuestionnaire(task.input[0].valueReference as Reference<Questionnaire>);
          }
        } else {
          acc.filteredTasks.push(task);
        }
        return acc;
      },
      { filteredTasks: [] as Task[], chartNoteTasks: [] as Task[] }
    );
  }, [tasks]);
  
  const handleSaveChanges = async (): Promise<void> => {
    if (!questionnaireResponse) {
      return;
    }
  
    try {
      const response = await medplum.createResource<QuestionnaireResponse>(questionnaireResponse);
      const updatedTask = {
        ...chartNoteTasks[0],
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
      };
  

      const task = await medplum.updateResource<Task>(updatedTask);
      setTasks((prevTasks) =>
        prevTasks.map((t) => (t.id === task.id ? task : t))
      );
      
    } catch (err) {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  };

  return (
    <Box p="md">
      <Text size="lg" color="dimmed" mb="lg">
        Encounters • Encounter 12.12.2024
      </Text>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
          <Stack gap="md">
            <Card withBorder shadow="sm">
      
              <Stack gap="md">
              {chartQuestionnaireResponse ? (
                <Text size="sm" color="dimmed">
                  Chart note saved.
                </Text>
              ) : null}

    
              {!chartQuestionnaireResponse && chartQuestionnaire ? (
                <QuestionnaireForm  
                  questionnaire={chartQuestionnaire} 
                  excludeButtons={true} 
                  onChange={setQuestionnaireResponse}
                />
              ) : null}
              </Stack>
            </Card>

            <Stack gap="md">
              {filteredTasks?.map((task: Task) =>
                task.input && task.input[0]?.type?.text === 'Questionnaire' && task.input[0]?.valueReference ? (
                  <TaskQuestionnaireForm key={task.id} task={task} />
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
            <Text fw={500} mb="xs">
              Encounter status
            </Text>
            <Select placeholder="In-progress" data={['In-progress', 'Completed', 'Cancelled']} />
          </div>

          <div>
            <Text fw={500} mb="xs">
              Assigned practitioner
            </Text>
            <Select placeholder="Lisa Caddy" data={['Lisa Caddy', 'John Smith', 'Jane Doe']} />
          </div>

          <div>
            <Text fw={500} mb="xs">
              Encounter Time
            </Text>
            <Select placeholder="1 hour" data={['30 minutes', '1 hour', '2 hours']} />
          </div>

          <Stack gap="md">
            <Button color="blue" fullWidth onClick={handleSaveChanges}>
              Save changes
            </Button>

            <Group gap="sm">
              <Button variant="light" color="gray" fullWidth>
                Mark as finished
              </Button>
            </Group>

            <Text size="sm">Complete all the tasks in encounter before finishing it</Text>
          </Stack>
        </Stack>
      </div>
    </Box>
  );
};
