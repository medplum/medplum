// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Flex, Paper, ScrollArea, SegmentedControl } from '@mantine/core';
import { MedplumClient } from '@medplum/core';
import { ResourceType, Task } from '@medplum/fhirtypes';
import { PatientSummary, ResourceTimeline, useResource } from '@medplum/react';
import { JSX, useState } from 'react';
import { useOutletContext } from 'react-router';
import { TaskInfo } from '../../components/tasks/TaskInfo';
import { TasksInputNote } from '../../components/tasks/TaskInputNote';
import { TaskSelectEmpty } from '../../components/tasks/TaskSelectEmpty';
import classes from './TasksPage.module.css';

interface TasksOutletContext {
  task: Task | undefined;
  onTaskChange: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
}

export function TaskDetails(): JSX.Element {
  const { task, onTaskChange, onDeleteTask } = useOutletContext<TasksOutletContext>();
  const selectedPatient = useResource(task?.for);
  const [activeTab, setActiveTab] = useState<string>('properties');

  const handleTabChange = (value: string): void => {
    setActiveTab(value);
  };

  if (!task) {
    return <TaskSelectEmpty />;
  }

  return (
    <Flex direction="row" w="100%" h="100%">
      <Flex direction="column" w="60%" h="100%" className={classes.borderRight}>
        <TasksInputNote key={task.id} task={task} onDeleteTask={onDeleteTask} />
      </Flex>

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

          {selectedPatient?.resourceType === 'Patient' && task && (
            <>
              {activeTab === 'properties' && <TaskInfo p="md" key={task.id} task={task} onTaskChange={onTaskChange} />}
              {activeTab === 'activity-log' && (
                <ScrollArea h="calc(100% - 50px)">
                  <ResourceTimeline
                    value={task}
                    loadTimelineResources={async (medplum: MedplumClient, _resourceType: ResourceType, id: string) => {
                      return Promise.allSettled([medplum.readHistory('Task', id)]);
                    }}
                  />
                </ScrollArea>
              )}
              {activeTab === 'patient-summary' && <PatientSummary patient={selectedPatient} />}
            </>
          )}
        </Paper>
      </Flex>
    </Flex>
  );
}
