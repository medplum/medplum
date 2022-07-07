import { getReferenceString } from '@medplum/core';
import { Bundle, BundleEntry, Reference, RequestGroup, Resource, Task } from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import { Button } from './Button';
import { DateTimeDisplay } from './DateTimeDisplay';
import { useMedplum } from './MedplumProvider';
import { ResourceName } from './ResourceName';
import { StatusBadge } from './StatusBadge';
import { useResource } from './useResource';
import './RequestGroupDisplay.css';

export interface RequestGroupDisplayProps {
  value?: RequestGroup | Reference<RequestGroup>;
  onStart: (task: Task, input: Reference) => void;
  onEdit: (task: Task, input: Reference, output: Reference) => void;
}

export function RequestGroupDisplay(props: RequestGroupDisplayProps): JSX.Element | null {
  const medplum = useMedplum();
  const requestGroup = useResource(props.value);
  const [startedLoading, setStartedLoading] = useState(false);
  const [responseBundle, setResponseBundle] = useState<Bundle>();

  useEffect(() => {
    if (requestGroup && !startedLoading) {
      medplum.executeBatch(buildBatchRequest(requestGroup)).then(setResponseBundle);
      setStartedLoading(true);
    }
  }, [medplum, requestGroup, startedLoading]);

  if (!requestGroup || !responseBundle) {
    return null;
  }

  return (
    <div className="medplum-request-group">
      {requestGroup.action?.map((action, index) => {
        const task = action.resource && findBundleEntry(action.resource as Reference<Task>);
        const taskInput = task?.input?.[0]?.valueReference;
        const taskOutput = task?.output?.[0]?.valueReference;
        return (
          <div className="medplum-request-group-task" key={`action-${index}`}>
            <div className="medplum-request-group-task-checkmark">{task?.status === 'completed' ? '🗹' : '☐'}</div>
            <div className="medplum-request-group-task-details">
              <div className="medplum-request-group-task-title">{action.title}</div>
              <div>
                Last edited by&nbsp;
                <ResourceName value={task?.meta?.author as Reference} />
                &nbsp;on&nbsp;
                <DateTimeDisplay value={task?.meta?.lastUpdated} />
              </div>
              <div>
                Status: <StatusBadge status={task?.status || 'unknown'} />
              </div>
            </div>
            <div className="medplum-request-group-task-actions">
              {taskInput && !taskOutput && <Button onClick={() => props.onStart(task, taskInput)}>Start</Button>}
              {taskInput && taskOutput && (
                <Button onClick={() => props.onEdit(task, taskInput, taskOutput)}>Edit</Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
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
