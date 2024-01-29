import { Table } from '@mantine/core';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import { Bundle, BundleEntry, Resource, ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useState } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { ResourceBadge } from '../ResourceBadge/ResourceBadge';

export interface ResourceHistoryTableProps {
  readonly history?: Bundle;
  readonly resourceType?: string;
  readonly id?: string;
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
    <Table withTableBorder withRowBorders withColumnBorders>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Author</Table.Th>
          <Table.Th>Date</Table.Th>
          <Table.Th>Version</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {value.entry?.map((entry, index) => <HistoryRow key={'entry-' + index} entry={entry} />)}
      </Table.Tbody>
    </Table>
  );
}

interface HistoryRowProps {
  readonly entry: BundleEntry;
}

function HistoryRow(props: HistoryRowProps): JSX.Element {
  const { response, resource } = props.entry;
  if (resource) {
    return (
      <Table.Tr>
        <Table.Td>
          <ResourceBadge value={resource.meta?.author} link={true} />
        </Table.Td>
        <Table.Td>{formatDateTime(resource.meta?.lastUpdated)}</Table.Td>
        <Table.Td>
          <MedplumLink to={getVersionUrl(resource)}>{resource.meta?.versionId}</MedplumLink>
        </Table.Td>
      </Table.Tr>
    );
  } else {
    return (
      <Table.Tr>
        <Table.Td colSpan={3}>{normalizeErrorString(response?.outcome)}</Table.Td>
      </Table.Tr>
    );
  }
}

function getVersionUrl(resource: Resource): string {
  return `/${resource.resourceType}/${resource.id}/_history/${resource.meta?.versionId}`;
}
