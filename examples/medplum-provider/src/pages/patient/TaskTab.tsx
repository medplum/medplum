import { Blockquote, Group, Paper, Stack, Tabs, Title, Text } from '@mantine/core';
import { formatCodeableConcept, getDisplayString } from '@medplum/core';
import { Annotation, Task } from '@medplum/fhirtypes';
import { Container, DefaultResourceTimeline, Document, ResourceTable, useMedplum } from '@medplum/react';
import { useNavigate, useParams } from 'react-router-dom';
import { TaskActions } from '../../components/tasks/actions/TaskActions';
import { useEffect, useState } from 'react';
import { formatPatientPageTabUrl, getPatientPageTabOrThrow } from './PatientPage.utils';

const tabs = ['Details', 'Timeline', 'Notes'];

const tasksTab = getPatientPageTabOrThrow('tasks');
export function TaskTab(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const { patientId, id } = useParams() as { patientId: string; id: string };
  const [task, setTask] = useState<Task | undefined>(undefined);

  // Set the current tab to what is in the URL, otherwise default to 'Details'
  const tab = window.location.pathname.split('/').pop();
  const currentTab = tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();

  useEffect(() => {
    const fetchTask = async (): Promise<void> => {
      try {
        const taskData = await medplum.readResource('Task', id);
        setTask(taskData);
      } catch (error) {
        console.error(error);
      }
    };

    fetchTask().catch((error) => console.error(error));
  }, [medplum, id]);

  // Update the current tab and navigate to its URL
  const handleTabChange = (newTab: string | null): void => {
    console.log('newTab:', newTab);
    navigate(`./${newTab}`, { relative: 'path' });
  };

  const onTaskChange = (updatedTask: Task): void => {
    setTask(updatedTask);
  };

  const onTaskDeleted = (): void => {
    navigate(formatPatientPageTabUrl(patientId, tasksTab));
  };

  if (!task) {
    return <Document>No Task found</Document>;
  }

  return (
    <Container size="none">
      <Group mt="md" align="flex-start">
        <Paper flex={1} maw={600} p="md" key={task?.id ?? 'loading'}>
          <TaskDetails task={task} tabs={tabs} currentTab={currentTab} handleTabChange={handleTabChange} />
        </Paper>
        <Paper p="md" w={250}>
          <TaskActions task={task} onChange={onTaskChange} onDeleted={onTaskDeleted} />
        </Paper>
      </Group>
    </Container>
  );
}

interface TaskDetailsProps {
  readonly task: Task;
  readonly tabs: string[];
  readonly currentTab: string;
  readonly handleTabChange: (newTab: string | null) => void;
}

function TaskDetails({ task, tabs, currentTab, handleTabChange }: TaskDetailsProps): JSX.Element {
  return (
    <>
      <Title>{task.code ? formatCodeableConcept(task.code) : getDisplayString(task)}</Title>
      <Tabs value={currentTab.toLowerCase()} onChange={handleTabChange}>
        <Tabs.List my="md" style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab} value={tab.toLowerCase()}>
              {tab}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="details">
          <ResourceTable key={`Task/${task.id}`} value={task} ignoreMissingValues={true} />
        </Tabs.Panel>
        <Tabs.Panel value="timeline">
          <DefaultResourceTimeline resource={task} />
        </Tabs.Panel>
        <Tabs.Panel value="notes">
          <NotesPage task={task} />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}

export interface NotesPageProps {
  readonly task: Task;
}

export function NotesPage(props: NotesPageProps): JSX.Element {
  const notes = props.task.note;

  if (!notes) {
    return <Text>No Notes</Text>;
  }

  // Sort notes so the most recent are at the top of the page
  const sortedNotes = sortNotesByTime(notes);

  // Display if the task does not have any notes

  return (
    <Document>
      <Stack>
        {sortedNotes.map(
          (note) =>
            note.text && (
              <Blockquote
                key={`note-${note.text}`}
                cite={`${note.authorReference?.display || note.authorString} – ${note.time?.slice(0, 10)}`}
                icon={null}
              >
                {note.text}
              </Blockquote>
            )
        )}
      </Stack>
    </Document>
  );
}

function sortNotesByTime(notes: Annotation[]): Annotation[] {
  const compareTimes = (a: Annotation, b: Annotation): number => {
    const timeA = new Date(a.time || 0).getTime();
    const timeB = new Date(b.time || 0).getTime();

    return timeB - timeA;
  };

  const sortedNotes = notes.sort(compareTimes);
  return sortedNotes;
}
