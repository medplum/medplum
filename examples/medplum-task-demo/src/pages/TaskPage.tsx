import { Grid, Paper, Skeleton, Tabs, Title } from '@mantine/core';
import { formatCodeableConcept, getDisplayString, resolveId } from '@medplum/core';
import { Patient, Task } from '@medplum/fhirtypes';
import {
  DefaultResourceTimeline,
  Document,
  PatientSummary,
  ResourceTable,
  useMedplum,
  useMedplumNavigate,
} from '@medplum/react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { TaskActions } from '../components/actions/TaskActions';
import { NotesPage } from './NotesPage';

export function TaskPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useMedplumNavigate();
  const { id } = useParams() as { id: string };
  const [task, setTask] = useState<Task | undefined>(undefined);
  const tabs = ['Details', 'Timeline', 'Notes'];
  const [patient, setPatient] = useState<Patient | undefined>();

  const patientReference = task?.for;

  // Set the current tab to what is in the URL, otherwise default to 'Details'
  const tab = window.location.pathname.split('/').pop();
  const currentTab = tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();

  useEffect(() => {
    // Fetch the task that is specified in the URL
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

  useEffect(() => {
    const fetchLinkedPatient = async (): Promise<void> => {
      if (patientReference) {
        const patientId = resolveId(patientReference);
        try {
          const patientData = patientId ? await medplum.readResource('Patient', patientId) : undefined;
          setPatient(patientData);
        } catch (error) {
          console.error(error);
        }
      }
    };

    fetchLinkedPatient().catch((err) => console.error(err));
  }, [medplum, patientReference]);

  // Update the current tab and navigate to its URL
  const handleTabChange = (newTab: string | null): void => {
    navigate(`/Task/${id}/${newTab ?? ''}`);
  };

  const onTaskChange = (updatedTask: Task): void => {
    setTask(updatedTask);
  };

  if (!task) {
    return <Document>No Task found</Document>;
  }

  return (
    <Grid gutter="xs">
      <Grid.Col span={4}>
        <PatientProfile patient={patient} />
      </Grid.Col>
      <Grid.Col span={5}>
        <TaskDetails task={task} tabs={tabs} currentTab={currentTab} handleTabChange={handleTabChange} />
      </Grid.Col>
      <Grid.Col span={3}>
        <Actions task={task} onTaskChange={onTaskChange} />
      </Grid.Col>
    </Grid>
  );
}

interface PatientProfileProps {
  readonly patient?: Patient;
}

function PatientProfile({ patient }: PatientProfileProps): JSX.Element {
  return (
    <>
      {patient ? (
        <PatientSummary
          patient={patient}
          background="url(https://images.unsplash.com/photo-1535961652354-923cb08225a7?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NXx8bmF0dXJlJTIwc21hbGx8ZW58MHwwfDB8fHww&auto=format&fit=crop&w=800&q=60)"
        />
      ) : (
        <Skeleton visible={true} height={100} />
      )}
    </>
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
    <Paper p="md" key={task ? task.id : 'loading'}>
      <Title>{task.code ? formatCodeableConcept(task.code) : getDisplayString(task)}</Title>
      <Tabs value={currentTab.toLowerCase()} onChange={handleTabChange}>
        <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
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
    </Paper>
  );
}

interface ActionsProps {
  readonly task: Task;
  readonly onTaskChange: (updatedTask: Task) => void;
}

function Actions({ task, onTaskChange }: ActionsProps): JSX.Element {
  return (
    <Paper p="md">
      <TaskActions task={task} onChange={onTaskChange} />
    </Paper>
  );
}
