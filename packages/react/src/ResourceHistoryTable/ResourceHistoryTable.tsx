import { Table } from '@mantine/core';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import { Bundle, BundleEntry, Resource, ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import React, { useEffect, useState } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { ResourceBadge } from '../ResourceBadge/ResourceBadge';

export interface ResourceHistoryTableProps {
  history?: Bundle;
  resourceType?: string;
  id?: string;
}

export function ResourceHistoryTable(props: ResourceHistoryTableProps): JSX.Element {
  const medplum = useMedplum();
  const [value, setValue] = useState<Bundle | undefined>(props.history);

  useEffect(() => {
    if (!props.history && props.resourceType && props.id) {
      medplum
        .readHistory(props.resourceType as ResourceType, props.id)
        .then(setValue)
        .catch(console.log);
    }
  }, [medplum, props.history, props.resourceType, props.id]);

  if (!value) {
    return <div>Loading...</div>;
  }

  return (
    <Table withBorder withColumnBorders>
      <thead>
        <tr>
          <th>Author</th>
          <th>Date</th>
          <th>Version</th>
        </tr>
      </thead>
      <tbody>{value.entry?.map((entry, index) => <HistoryRow key={'entry-' + index} entry={entry} />)}</tbody>
    </Table>
  );
}

interface HistoryRowProps {
  entry: BundleEntry;
}

function HistoryRow(props: HistoryRowProps): JSX.Element {
  const { response, resource } = props.entry;
  if (resource) {
    return (
      <tr>
        <td>
          <ResourceBadge value={resource.meta?.author} link={true} />
        </td>
        <td>{formatDateTime(resource.meta?.lastUpdated)}</td>
        <td>
          <MedplumLink to={getVersionUrl(resource)}>{resource.meta?.versionId}</MedplumLink>
        </td>
      </tr>
    );
  } else {
    return (
      <tr>
        <td colSpan={3}>{normalizeErrorString(response?.outcome)}</td>
      </tr>
    );
  }
}

function getVersionUrl(resource: Resource): string {
  return `/${resource.resourceType}/${resource.id}/_history/${resource.meta?.versionId}`;
}
