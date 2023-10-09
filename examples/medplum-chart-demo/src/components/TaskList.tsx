import { Box } from '@mantine/core';
import { createReference } from '@medplum/core';
import { Practitioner, Task } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, Timeline, TimelineItem, useMedplumProfile, useResource } from '@medplum/react';
import React from 'react';
import { useParams } from 'react-router-dom';

const tasks: Task[] = [
  {
    resourceType: 'Task',
    id: 'example1',
    meta: {
      lastUpdated: '2016-03-10T22:39:32-04:00',
    },
    status: 'draft',
    intent: 'order',
    code: {
      text: 'Fill out questionnaire',
    },
    focus: {
      reference: 'MedicationRequest/medrx002',
    },
    for: {
      reference: 'Patient/f001',
    },
    authoredOn: '2016-03-10T22:39:32-04:00',
    lastModified: '2016-03-10T22:39:32-04:00',
    requester: {
      reference: 'Patient/example',
    },
    owner: {
      reference: 'Practitioner/example',
    },
  },
  {
    resourceType: 'Task',
    id: 'example2',
    meta: {
      lastUpdated: '2016-03-10T22:39:32-04:00',
    },
    status: 'draft',
    intent: 'order',
    code: {
      text: 'Approve lab imaging for patient',
    },
    focus: {
      reference: 'MedicationRequest/medrx002',
    },
    for: {
      reference: 'Patient/f001',
    },
    authoredOn: '2016-03-10T22:39:32-04:00',
    lastModified: '2016-03-10T22:39:32-04:00',
    requester: {
      reference: 'Patient/example',
    },
    owner: {
      reference: 'Practitioner/example',
    },
  },
  {
    resourceType: 'Task',
    id: 'example3',
    meta: {
      lastUpdated: '2016-03-10T22:39:32-04:00',
    },
    status: 'draft',
    intent: 'order',
    code: {
      text: 'Refill Request',
    },
    focus: {
      reference: 'MedicationRequest/medrx002',
    },
    for: {
      reference: 'Patient/f001',
    },
    authoredOn: '2016-03-10T22:39:32-04:00',
    lastModified: '2016-03-10T22:39:32-04:00',
    requester: {
      reference: 'Patient/example',
    },
    owner: {
      reference: 'Practitioner/example',
    },
  },
];

export function TaskList(): JSX.Element | null {
  const { id } = useParams();
  const author = createReference(useMedplumProfile() as Practitioner);
  const patient = useResource({ reference: `Patient/${id}` });

  if (!patient) {
    return null;
  }

  return (
    <Box sx={{ width: 600 }}>
      <Timeline>
        {tasks.map((task) => (
          <TimelineItem key={task.id} profile={author} resource={task}>
            <Box pt="sm" px="xl" pb="xl">
              <CodeableConceptDisplay value={task.code} />
            </Box>
          </TimelineItem>
        ))}
      </Timeline>
    </Box>
  );
}
