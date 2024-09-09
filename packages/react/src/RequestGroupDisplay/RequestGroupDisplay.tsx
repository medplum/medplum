import { Button, Grid, Text } from '@mantine/core';
import { formatDateTime, getReferenceString } from '@medplum/core';
import { Bundle, BundleEntry, Reference, RequestGroup, Resource, Task } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import { IconCheckbox, IconSquare } from '@tabler/icons-react';
import { Fragment, useEffect, useState } from 'react';
import { ResourceName } from '../ResourceName/ResourceName';
import { StatusBadge } from '../StatusBadge/StatusBadge';

export interface RequestGroupDisplayProps {
  readonly value?: RequestGroup | Reference<RequestGroup>;
  readonly onStart: (task: Task, input: Reference) => void;
  readonly onEdit: (task: Task, input: Reference, output: Reference) => void;
}

export function RequestGroupDisplay(props: RequestGroupDisplayProps): JSX.Element | null {
  const medplum = useMedplum();
  const requestGroup = useResource(props.value);
  const [startedLoading, setStartedLoading] = useState(false);
  const [responseBundle, setResponseBundle] = useState<Bundle>();

  useEffect(() => {
    if (requestGroup && !startedLoading) {
      medplum.executeBatch(buildBatchRequest(requestGroup)).then(setResponseBundle).catch(console.log);
      setStartedLoading(true);
    }
  }, [medplum, requestGroup, startedLoading]);

  if (!requestGroup || !responseBundle) {
    return null;
  }

  return (
    <Grid>
      {requestGroup.action?.map((action, index) => {
        const task = action.resource && findBundleEntry(action.resource as Reference<Task>);
        const taskInput = task?.input?.[0]?.valueReference;
        const taskOutput = task?.output?.[0]?.valueReference;
        return (
          <Fragment key={`action-${index}`}>
            <Grid.Col span={1} p="md">
              {task?.status === 'completed' ? <IconCheckbox /> : <IconSquare color="gray" />}
            </Grid.Col>
            <Grid.Col span={9} p="xs">
              <Text fw={500}>{action.title}</Text>
              {action.description && <div>{action.description}</div>}
              <div>
                Last edited by&nbsp;
                <ResourceName value={task?.meta?.author as Reference} />
                &nbsp;on&nbsp;
                {formatDateTime(task?.meta?.lastUpdated)}
              </div>
              <div>
                Status: <StatusBadge status={task?.status || 'unknown'} />
              </div>
            </Grid.Col>
            <Grid.Col span={2} p="md">
              {taskInput && !taskOutput && <Button onClick={() => props.onStart(task, taskInput)}>Start</Button>}
              {taskInput && taskOutput && (
                <Button onClick={() => props.onEdit(task, taskInput, taskOutput)}>Edit</Button>
              )}
            </Grid.Col>
          </Fragment>
        );
      })}
    </Grid>
  );

  function buildBatchRequest(request: RequestGroup): Bundle {
    const batchEntries = [] as BundleEntry[];
    if (request.action) {
      for (const action of request.action) {
        if (action.resource?.reference) {
          batchEntries.push({ request: { method: 'GET', url: action.resource.reference } });
        }
      }
    }

    return {
      resourceType: 'Bundle',
      type: 'batch',
      entry: batchEntries,
    };
  }

  function findBundleEntry<T extends Resource>(reference: Reference<T>): T | undefined {
    for (const entry of responseBundle?.entry as BundleEntry[]) {
      if (entry.resource && reference.reference === getReferenceString(entry.resource)) {
        return entry.resource as T;
      }
    }
    return undefined;
  }
}
