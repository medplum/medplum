// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Group, Stack, Text } from '@mantine/core';
import { formatDate, formatHumanName } from '@medplum/core';
import type { Practitioner, ServiceRequest } from '@medplum/fhirtypes';
import { ListItem, useResource } from '@medplum/react';
import type { JSX } from 'react';

type LabTab = 'open' | 'completed';

interface LabListItemProps {
  item: ServiceRequest;
  selectedItem: ServiceRequest | undefined;
  activeTab: LabTab;
  onItemSelect: (item: ServiceRequest) => string;
}

export function LabListItem(props: LabListItemProps): JSX.Element {
  const { item, selectedItem, activeTab, onItemSelect } = props;
  const isSelected = selectedItem?.id === item.id;
  const requester = useResource(item.requester) as Practitioner | undefined;

  return (
    <ListItem to={onItemSelect(item)} selected={isSelected}>
      <Stack gap={0} miw={0}>
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
          <Text fw={700} truncate="end" flex={1} miw={0}>
            {getDisplayText(item)}
          </Text>
          {activeTab !== 'completed' && (
            <Badge size="sm" color={getStatusColor(item.status)} variant="light">
              {getStatusDisplayText(item.status)}
            </Badge>
          )}
        </Group>
        {getAdditionalInfo(item, activeTab).map((info, index) => (
          <Text key={index} size="sm">
            {info}
          </Text>
        ))}
        <Text size="sm" c="dimmed">
          {getSubText(item, requester)}
        </Text>
      </Stack>
    </ListItem>
  );
}

const getStatusColor = (status: string | undefined): string => {
  switch (status) {
    case 'active':
      return 'blue';
    case 'draft':
    case 'requested':
      return 'yellow';
    case 'on-hold':
      return 'orange';
    case 'revoked':
    case 'cancelled':
    case 'entered-in-error':
      return 'red';
    case 'completed':
      return 'green';
    case 'unknown':
      return 'gray';
    default:
      return 'gray';
  }
};

const getStatusDisplayText = (status: string | undefined): string => {
  switch (status) {
    case 'active':
      return 'Active';
    case 'draft':
      return 'Draft';
    case 'requested':
      return 'Requested';
    case 'on-hold':
      return 'On Hold';
    case 'revoked':
      return 'Revoked';
    case 'cancelled':
      return 'Cancelled';
    case 'entered-in-error':
      return 'Error';
    case 'completed':
      return 'Completed';
    case 'unknown':
      return 'Unknown';
    default:
      return status || 'Unknown';
  }
};

const getDisplayText = (item: ServiceRequest): string => {
  if (item.code?.coding && item.code.coding.length >= 2) {
    return item.code.coding.map((coding) => coding.display).join(', ');
  }

  if (item.code?.text) {
    return item.code.text;
  }

  return item.code?.coding?.[0]?.display || 'Lab Order';
};

const getSubText = (item: ServiceRequest, requester: Practitioner | undefined): string => {
  const date = formatDate(item.authoredOn || item.meta?.lastUpdated);
  if (requester?.resourceType === 'Practitioner') {
    return `Ordered ${date} by ${formatHumanName(requester.name?.[0])}`;
  }
  return `Ordered ${date}`;
};

const getAdditionalInfo = (item: ServiceRequest, activeTab: LabTab): string[] => {
  const info: string[] = [];

  if (activeTab === 'completed') {
    const completionDate = item.meta?.lastUpdated ? formatDate(item.meta.lastUpdated) : 'Unknown date';
    info.push(`Completed ${completionDate}`);
  } else if (item.requisition?.value) {
    info.push(`REQ #${item.requisition.value}`);
  }

  return info;
};
