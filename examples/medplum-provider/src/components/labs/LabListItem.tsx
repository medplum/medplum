// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Stack, Text, Badge } from '@mantine/core';
import { formatDate, formatHumanName } from '@medplum/core';
import type { HumanName, ServiceRequest } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import classes from './LabListItem.module.css';
import cx from 'clsx';
import { useResource } from '@medplum/react';
import { useParams, useNavigate } from 'react-router';
import { useEffect, useRef } from 'react';

type LabTab = 'open' | 'completed';

interface LabListItemProps {
  item: ServiceRequest;
  selectedItem: ServiceRequest | undefined;
  activeTab: LabTab;
  onItemChange: (item: ServiceRequest) => void;
}

export function LabListItem(props: LabListItemProps): JSX.Element {
  const { item, selectedItem, activeTab, onItemChange: _onItemChange } = props;
  const { patientId } = useParams();
  const navigate = useNavigate();
  const isSelected = selectedItem?.id === item.id;
  const titleRef = useRef<HTMLDivElement>(null);
  
  const requester = useResource(item.requester);

  // Replace standard ellipsis with proper character after render
  useEffect(() => {
    if (titleRef.current) {
      const element = titleRef.current;
      // Check if text is truncated by comparing scroll width to client width
      if (element.scrollWidth > element.clientWidth) {
        // Find and replace the standard ellipsis with the proper character
        const textContent = element.textContent || '';
        if (textContent.includes('...')) {
          element.textContent = textContent.replace('...', '…');
        }
      }
    }
  }, [item.code]); // Re-run when the item code changes

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

  const getDisplayText = (): string => {
    // If there are multiple codes (2 or more), show them separated by commas
    if (item.code?.coding && item.code.coding.length >= 2) {
      return item.code.coding.map(coding => coding.display).join(', ');
    }
    
    // If there's a text field and only one code, use the text field
    if (item.code?.text) {
      return item.code.text;
    }
    
    // Otherwise, show the first code or fallback
    return item.code?.coding?.[0]?.display || 'Lab Order';
  };

  const getSubText = (): string => {
    // Use authoredOn if available, otherwise fall back to meta.lastUpdated
    const date = formatDate(item.authoredOn || item.meta?.lastUpdated);
    if (requester?.resourceType === 'Practitioner') {
      return `Ordered ${date} by ${formatHumanName(requester.name?.[0] as HumanName)}`;
    }
    return `Ordered ${date}`;
  };

  const getAdditionalInfo = (): string[] => {
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

  const handleClick = async (): Promise<void> => {
    await navigate(`/Patient/${patientId}/labs/${item.id}`);
  };

  return (
    <div onClick={handleClick}>
      <Group
        align="center"
        wrap="nowrap"
        className={cx(classes.contentContainer, {
          [classes.selected]: isSelected,
        })}
      >
        <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
          <Group justify="space-between" align="flex-start" style={{ minWidth: 0 }}>
            <Text ref={titleRef} fw={700} className={classes.title} style={{ flex: 1, minWidth: 0 }}>
              {getDisplayText()}
            </Text>
            {activeTab !== 'completed' && (
              <Badge 
                size="sm" 
                color={getStatusColor(item.status)} 
                variant="light"
              >
                {getStatusDisplayText(item.status)}
              </Badge>
            )}
          </Group>
          {getAdditionalInfo().map((info, index) => (
            <Text key={index} size="sm" c="#2E2E2E">
              {info}
            </Text>
          ))}
          <Text size="sm" c="dimmed">
            {getSubText()}
          </Text>
        </Stack>
      </Group>
    </div>
  );
}