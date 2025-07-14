import { Box, Divider, Flex, Paper, SegmentedControl } from '@mantine/core';
import { JSX, useEffect, useMemo, useState } from 'react';
import styles from './TasksPage.module.css';
import { Patient, Task } from '@medplum/fhirtypes';
import { PatientSummary, PatientTimeline, useMedplum, useMedplumProfile } from '@medplum/react';
import { showErrorNotification } from '../../utils/notifications';
import { createReference, getReferenceString, ProfileResource } from '@medplum/core';
import { TaskListItem } from '../../components/tasks/TaskListItem';
import { TaskInfo } from '../../components/tasks/TaskInfo';

export function TasksPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<string>('patient-summary');
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
      if (tasks.length > 0) {
        setSelectedTask(tasks[0]);
      }
    };

    fetchTasks().catch(showErrorNotification);
  }, [medplum, profileRef]);

  const handleTaskChange = (task: Task): void => {
    setSelectedTask(task);
    setTasks(tasks.map((t) => (t.id === task.id ? task : t)));
  };

  const handleTabChange = (value: string): void => {
    setActiveTab(value);
  };

  return (
    <div className={styles.container}>
      <Flex h="100%" w="100%">
        <Flex direction="column" w="25%" h="100%" style={{ borderRight: '1px solid var(--mantine-color-gray-3)' }}>
          <Paper h="100%" p="xs">
            {tasks.map((task) => (
              <>
                <TaskListItem
                  key={task.id}
                  task={task}
                  selectedTask={selectedTask}
                  onClick={() => setSelectedTask(task)}
                />
                <Divider />
              </>
            ))}
          </Paper>
        </Flex>

        <Flex direction="column" w="40%" h="100%">
          <Paper h="100%" p="md" style={{ overflow: 'auto' }}>
            {selectedTask && <TaskInfo key={selectedTask.id} task={selectedTask} onTaskChange={handleTaskChange} />}
          </Paper>
        </Flex>

        <Flex direction="column" w="35%" h="100%" style={{ borderLeft: '1px solid var(--mantine-color-gray-3)' }}>
          <Paper h="100%" p="xs">
            <Box px="md" pb="md">
              <SegmentedControl
                value={activeTab}
                onChange={(value: string) => handleTabChange(value)}
                data={[
                  { label: 'Patient Summary', value: 'patient-summary' },
                  { label: 'Activity Log', value: 'activity-log' },
                ]}
                fullWidth
                radius="md"
                color="gray"
                size="md"
                styles={(theme) => ({
                  root: {
                    backgroundColor: theme.colors.gray[1],
                    borderRadius: theme.radius.md,
                  },
                  indicator: {
                    backgroundColor: theme.white,
                  },
                  label: {
                    fontWeight: 500,
                    color: theme.colors.dark[9],
                    padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                  },
                })}
              />
            </Box>

            {activeTab === 'patient-summary' && <PatientSummary patient={selectedTask?.for as Patient} />}
            {activeTab === 'activity-log' && <PatientTimeline patient={selectedTask?.for as Patient} />}
          </Paper>
        </Flex>
      </Flex>
    </div>
  );
}
