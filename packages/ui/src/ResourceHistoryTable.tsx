import { Bundle, Resource } from '@medplum/core';
import React, { useEffect, useState } from 'react';
import { Avatar } from './Avatar';
import { MedplumLink } from './MedplumLink';
import { useMedplum } from './MedplumProvider';
import { ResourceName } from './ResourceName';

export interface ResourceHistoryTableProps {
  history?: Bundle;
  resourceType?: string;
  id?: string;
}

export function ResourceHistoryTable(props: ResourceHistoryTableProps) {
  const medplum = useMedplum();
  const [value, setValue] = useState<Bundle | undefined>(props.history);

  useEffect(() => {
    if (!props.history && props.resourceType && props.id) {
      medplum.readHistory(props.resourceType, props.id).then(result => setValue(result));
    }

  }, [props.history, props.resourceType, props.id]);

  if (!value) {
    return <div>Loading...</div>
  }

  return (
    <table className="table">
      <tbody>
        {value.entry?.map(entry => (
          <HistoryRow key={entry.resource?.meta?.versionId} version={entry.resource as Resource} />
        ))}
      </tbody>
    </table>
  );
}

interface HistoryRowProps {
  version: Resource;
}

function HistoryRow(props: HistoryRowProps) {
  return (
    <tr>
      <td>
        <Avatar size="small" reference={props.version.meta?.author} />
      </td>
      <td>
        <ResourceName reference={props.version.meta?.author} />
      </td>
      <td>
        {formatDateTime(props.version.meta?.lastUpdated as string | Date)}
      </td>
      <td>
        <MedplumLink to={getVersionUrl(props.version)}>
          {props.version.meta?.versionId}
        </MedplumLink>
      </td>
    </tr>
  );
}

function formatDateTime(dateTime: string | Date): string {
  const date = dateTime instanceof Date ? dateTime : new Date(dateTime);
  return date.toLocaleString();
}

function getVersionUrl(resource: Resource) {
  return `${resource.resourceType}/${resource.id}/_history/${resource.meta?.versionId}`;
}
