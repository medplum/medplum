import { Grid, Group, SimpleGrid, Tabs, Title } from '@mantine/core';
import { getDisplayString, getReferenceString } from '@medplum/core';
import { Task } from '@medplum/fhirtypes';
import { DefaultResourceTimeline, Document, Loading, ResourceTable, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { PatientChart } from '../components/PatientChart';
import { TaskActions } from '../components/TaskActions';
import { NotesPage } from './NotesPage';

export function TaskPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const { id } = useParams() as { id: string };
  const [task, setTask] = useState<Task | undefined>(undefined);
  const tabs = ['Details', 'Timeline', 'Notes'];

  // Set the current tab to what is in the URL, otherwise default to 'Details'
  const [currentTab, setCurrentTab] = useState<string>(() => {
    const tab = window.location.pathname.split('/').pop();
    return tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();
  });

  // Set the task to what is specified in the URL
  useEffect(() => {
    if (id) {
      medplum.readResource('Task', id).then(setTask).catch(console.error);
    }
  }, [medplum, id]);

  // Update the current tab and navigate to its URL
  const handleTabChange = (newTab: string) => {
    setCurrentTab(newTab);
    navigate(`/Task/${id}/${newTab}`);
  };

  const handleTaskChange = (updatedTask: Task) => {
    setTask(updatedTask);
  };

  if (!task) {
    return <Loading />;
  }

  return (
    <Grid>
      <Grid.Col span={3}>
        <Document>{/* <PatientChart /> */}</Document>
      </Grid.Col>
      <Grid.Col span={6}>
        <Document key={getReferenceString(task)}>
          <Title>{getDisplayString(task)}</Title>
          <Tabs value={currentTab.toLowerCase()} onTabChange={handleTabChange}>
            <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
              {tabs.map((tab) => (
                <Tabs.Tab key={tab} value={tab.toLowerCase()}>
                  {tab}
                </Tabs.Tab>
              ))}
            </Tabs.List>
            <Tabs.Panel value="details">
              <ResourceTable key={`Task/${id}`} value={task} ignoreMissingValues={false} />
            </Tabs.Panel>
            <Tabs.Panel value="timeline">
              <DefaultResourceTimeline resource={task} />
            </Tabs.Panel>
            <Tabs.Panel value="notes">
              <NotesPage task={task} />
            </Tabs.Panel>
          </Tabs>
        </Document>
      </Grid.Col>
      <Grid.Col span={3}>
        <Document>
          <TaskActions task={task} onChange={handleTaskChange} />
        </Document>
      </Grid.Col>
    </Grid>
  );
}
