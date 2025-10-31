// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Paper, ScrollArea, SegmentedControl, Text } from '@mantine/core';
import type { MedplumClient } from '@medplum/core';
import type { Patient, Reference, ResourceType, Task } from '@medplum/fhirtypes';
import { PatientSummary, ResourceTimeline, useMedplum, useResource } from '@medplum/react';
import { useState } from 'react';
import type { JSX } from 'react';
import { TaskInputNote } from './TaskInputNote';
import { TaskProperties } from './TaskProperties';
import classes from './TaskBoard.module.css';
import { useDebouncedUpdateResource } from '../../hooks/useDebouncedUpdateResource';
import { showErrorNotification } from '../../utils/notifications';

interface TaskDetailPanelProps {
  task: Task | Reference<Task>;
  onTaskChange?: (task: Task) => void;
  onDeleteTask?: (task: Task) => void;
}

export function TaskDetailPanel(props: TaskDetailPanelProps): JSX.Element | null {
  const { task: taskProp, onTaskChange, onDeleteTask } = props;
  const medplum = useMedplum();
  const task = useResource(taskProp);
  const [activeTab, setActiveTab] = useState<string>('properties');
  const patientRef = task?.for as Reference<Patient>;
  const selectedPatient = useResource<Patient>(patientRef);

  const debouncedUpdateResource = useDebouncedUpdateResource(medplum);

  if (!task) {
    return (
      <Box h="100%" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text c="dimmed">No task selected</Text>
      </Box>
    );
  }

  const handleTaskChange = async (updatedTask: Task): Promise<void> => {
    onTaskChange?.(updatedTask);
    await debouncedUpdateResource(updatedTask);
  };

  const handleDeleteTask = async (deletedTask: Task): Promise<void> => {
    try {
      await medplum.deleteResource('Task', deletedTask.id as string);
      onDeleteTask?.(deletedTask);
    } catch (error) {
      showErrorNotification(error);
    }
  };

  const handleTabChange = (value: string): void => {
    setActiveTab(value);
  };

  const getTabData = (): { label: string; value: string }[] => {
    const tabs = [
      { label: 'Properties', value: 'properties' },
      { label: 'Activity Log', value: 'activity-log' },
    ];

    if (selectedPatient) {
      tabs.push({ label: 'Patient Summary', value: 'patient-summary' });
    }

    return tabs;
  };

  return (
    <>
      <Box
        h="100%"
        style={{
          flex: 1,
        }}
        className={classes.borderRight}
      >
        <TaskInputNote task={task} onTaskChange={handleTaskChange} onDeleteTask={handleDeleteTask} />
      </Box>

      <Box h="100%" w="400px">
        <Paper h="100%" style={{ overflow: 'hidden' }}>
          <Box px="md" pb="md" pt="md">
            <SegmentedControl
              value={activeTab}
              onChange={handleTabChange}
              data={getTabData()}
              fullWidth
              radius="md"
              color="gray"
              size="sm"
              className={classes.segmentedControl}
            />
          </Box>

          <Box>
            {activeTab === 'properties' && (
              <ScrollArea h="calc(100vh - 120px)">
                <TaskProperties key={task.id} p="md" task={task} onTaskChange={handleTaskChange} />
              </ScrollArea>
            )}
            {activeTab === 'activity-log' && (
              <ScrollArea h="calc(100vh - 120px)">
                <ResourceTimeline
                  value={task}
                  loadTimelineResources={async (medplum: MedplumClient, _resourceType: ResourceType, id: string) => {
                    return Promise.allSettled([medplum.readHistory('Task', id)]);
                  }}
                />
              </ScrollArea>
            )}
            {activeTab === 'patient-summary' && selectedPatient?.resourceType === 'Patient' && (
              <ScrollArea h="calc(100vh - 120px)">
                <PatientSummary patient={selectedPatient} />
              </ScrollArea>
            )}
          </Box>
        </Paper>
      </Box>
    </>
  );
}
