// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Group, Stack, Text } from '@mantine/core';
import { formatDate, formatHumanName } from '@medplum/core';
import type { Practitioner, ServiceRequest } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import cx from 'clsx';
import type { JSX } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import classes from './LabListItem.module.css';
import { getOrderDisplayText, getOrderStatusColor, getOrderStatusDisplayText } from './labOrder';

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
    <MedplumLink to={onItemSelect(item)} underline="never">
      <Group
        align="center"
        wrap="nowrap"
        className={cx(classes.contentContainer, {
          [classes.selected]: isSelected,
        })}
      >
        <Stack gap={0} flex={1} miw={0}>
          <Group justify="space-between" align="flex-start">
            <Text fw={700} className={classes.title} flex={1}>
              {getOrderDisplayText(item)}
            </Text>
            {activeTab !== 'completed' && (
              <Badge size="sm" color={getOrderStatusColor(item.status)} variant="light">
                {getOrderStatusDisplayText(item.status)}
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
      </Group>
    </MedplumLink>
  );
}

const getSubText = (item: ServiceRequest, requester: Practitioner | undefined): string => {
  // Use authoredOn if available, otherwise fall back to meta.lastUpdated
  const date = formatDate(item.authoredOn || item.meta?.lastUpdated);
  if (requester?.resourceType === 'Practitioner') {
    return `Ordered ${date} by ${formatHumanName(requester.name?.[0])}`;
  }
  return `Ordered ${date}`;
};

const getAdditionalInfo = (item: ServiceRequest, activeTab: LabTab): string[] => {
  const info: string[] = [];

  if (activeTab === 'completed') {
    // For completed items, show completion date instead of REQ #
    const completionDate = item.meta?.lastUpdated ? formatDate(item.meta.lastUpdated) : 'Unknown date';
    info.push(`Completed ${completionDate}`);
  } else if (item.requisition?.value) {
    // For open items, show REQ # as before
    info.push(`REQ #${item.requisition.value}`);
  }

  return info;
};
