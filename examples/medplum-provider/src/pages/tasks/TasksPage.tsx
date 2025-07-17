import { Box, Divider, Flex, Paper, SegmentedControl, Skeleton, Stack } from '@mantine/core';
import React, { JSX, useEffect, useMemo, useState } from 'react';
import styles from './TasksPage.module.css';
import { Task } from '@medplum/fhirtypes';
import { PatientSummary, PatientTimeline, useMedplum, useMedplumProfile, useResource } from '@medplum/react';
import { showErrorNotification } from '../../utils/notifications';
import { createReference, getReferenceString, ProfileResource } from '@medplum/core';
import { TaskListItem } from '../../components/tasks/TaskListItem';
import { TaskInfo } from '../../components/tasks/TaskInfo';

export function TasksPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | undefined>(undefined);
  const selectedPatient = useResource(selectedTask?.for);
  const [activeTab, setActiveTab] = useState<string>('patient-summary');
  const [loading, setLoading] = useState<boolean>(false);
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

    setLoading(true);
    fetchTasks()
      .catch(showErrorNotification)
      .finally(() => setLoading(false));
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
        <Flex direction="column" w="25%" h="100%" className={styles.borderRight}>
          <Paper h="100%" p="xs">
            {loading ? (
              <TaskListSkeleton />
            ) : (
              tasks.map((task, index) => (
                <React.Fragment key={task.id}>
                  <TaskListItem task={task} selectedTask={selectedTask} onClick={() => setSelectedTask(task)} />
                  {index < tasks.length - 1 && <Divider />}
                </React.Fragment>
              ))
            )}
          </Paper>
        </Flex>

        <Flex direction="column" w="40%" h="100%" className={styles.borderRight}>
          <Paper h="100%" p="md" style={{ overflow: 'auto' }}>
            {selectedTask && <TaskInfo key={selectedTask.id} task={selectedTask} onTaskChange={handleTaskChange} />}
          </Paper>
        </Flex>

        <Flex direction="column" w="35%" h="100%">
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
                className={styles.segmentedControl}
              />
            </Box>
            
            {selectedPatient?.resourceType === 'Patient' && (
              <>
                {activeTab === 'patient-summary' && <PatientSummary patient={selectedPatient} />}
                {activeTab === 'activity-log' && <PatientTimeline patient={selectedPatient} />}
              </>
            )}
          </Paper>
        </Flex>
      </Flex>
    </div>
  );
}

function TaskListSkeleton(): JSX.Element {
  return (
    <Stack gap="md" p="md">
      {Array.from({ length: 6 }).map((_, index) => (
        <Stack key={index}>
          <Flex direction="column" gap="xs" align="flex-start">
            <Skeleton height={16} width={`${Math.random() * 40 + 60}%`} />
            <Skeleton height={14} width={`${Math.random() * 50 + 40}%`} />
            <Skeleton height={14} width={`${Math.random() * 50 + 40}%`} />
          </Flex>
          <Divider />
        </Stack>
      ))}
    </Stack>
  );
}
