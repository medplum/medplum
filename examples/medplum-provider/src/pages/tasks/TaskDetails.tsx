// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Flex, Paper, ScrollArea, SegmentedControl } from '@mantine/core';
import { MedplumClient } from '@medplum/core';
import { ResourceType, Task } from '@medplum/fhirtypes';
import { PatientSummary, ResourceTimeline, useResource } from '@medplum/react';
import { JSX, useState, useEffect } from 'react';
import { useOutletContext } from 'react-router';
import { TaskProperties } from '../../components/tasks/TaskProperties';
import { TasksInputNote } from '../../components/tasks/TaskInputNote';
import { TaskSelectEmpty } from '../../components/tasks/TaskSelectEmpty';
import classes from './TasksPage.module.css';

interface TasksOutletContext {
  task: Task | undefined;
  onTaskChange: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
}

export function TaskDetails(): JSX.Element {
  const { task: contextTask, onTaskChange, onDeleteTask } = useOutletContext<TasksOutletContext>();
  const [task, setTask] = useState<Task | undefined>(contextTask);
  const selectedPatient = useResource(task?.for);
  const [activeTab, setActiveTab] = useState<string>('properties');
  const showRight = Boolean(task?.for && selectedPatient?.resourceType === 'Patient');

  useEffect(() => {
    setTask(contextTask);
  }, [contextTask]);

  const handleTabChange = (value: string): void => {
    setActiveTab(value);
  };

  if (!task) {
    return <TaskSelectEmpty notFound />;
  }

  return (
    <Flex direction="row" w="100%" h="100%">
      <Flex
        direction="column"
        w={showRight ? '60%' : '100%'}
        h="100%"
        className={showRight ? classes.borderRight : undefined}
      >
        <TasksInputNote task={task} onTaskChange={onTaskChange} onDeleteTask={onDeleteTask} />
      </Flex>

      {showRight && (
        <Flex direction="column" w="40%" h="100%">
          <Paper h="100%">
            <Box px="md" pb="md" pt="md">
              <SegmentedControl
                value={activeTab}
                onChange={(value: string) => handleTabChange(value)}
                data={[
                  { label: 'Properties', value: 'properties' },
                  { label: 'Activity Log', value: 'activity-log' },
                  { label: 'Patient Summary', value: 'patient-summary' },
                ]}
                fullWidth
                radius="md"
                color="gray"
                size="md"
                className={classes.segmentedControl}
              />
            </Box>

            {task && selectedPatient?.resourceType === 'Patient' && (
              <>
                {activeTab === 'properties' && (
                  <TaskProperties key={task.id} p="md" task={task} onTaskChange={onTaskChange} />
                )}
                {activeTab === 'activity-log' && (
                  <ScrollArea h="calc(100% - 50px)">
                    <ResourceTimeline
                      value={task}
                      loadTimelineResources={async (
                        medplum: MedplumClient,
                        _resourceType: ResourceType,
                        id: string
                      ) => {
                        return Promise.allSettled([medplum.readHistory('Task', id)]);
                      }}
                    />
                  </ScrollArea>
                )}
                {activeTab === 'patient-summary' && selectedPatient && <PatientSummary patient={selectedPatient} />}
              </>
            )}
          </Paper>
        </Flex>
      )}
    </Flex>
  );
}
