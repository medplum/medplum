import { ActionIcon, Group, Menu, Text } from '@mantine/core';
import { formatDateTime, getReferenceString } from '@medplum/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import { IconDots } from '@tabler/icons-react';
import React from 'react';
import { Container } from '../Container/Container';
import { ErrorBoundary } from '../ErrorBoundary/ErrorBoundary';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { Panel, PanelProps } from '../Panel/Panel';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import { ResourceName } from '../ResourceName/ResourceName';

export interface TimelineProps {
  children?: React.ReactNode;
}

export function Timeline(props: TimelineProps): JSX.Element {
  return <Container>{props.children}</Container>;
}

export interface TimelineItemProps extends PanelProps {
  resource: Resource;
  profile?: Reference;
  dateTime?: string;
  padding?: boolean;
  popupMenuItems?: React.ReactNode;
}

export function TimelineItem(props: TimelineItemProps): JSX.Element {
  const { resource, profile, padding, popupMenuItems, children, ...others } = props;
  const author = profile ?? resource.meta?.author;
  const dateTime = props.dateTime ?? resource.meta?.lastUpdated;

  return (
    <Panel data-testid="timeline-item" fill={true} {...others}>
      <Group position="apart" spacing={8} mx="xs" my="sm">
        <ResourceAvatar value={author} link={true} size="md" />
        <div style={{ flex: 1 }}>
          <Text size="sm">
            <ResourceName color="dark" weight={500} value={author} link={true} />
          </Text>
          <Text size="xs">
            <MedplumLink color="dimmed" to={resource}>
              {formatDateTime(dateTime)}
            </MedplumLink>
            <Text component="span" color="dimmed" mx={8}>
              &middot;
            </Text>
            <MedplumLink color="dimmed" to={resource}>
              {resource.resourceType}
            </MedplumLink>
          </Text>
        </div>
        {popupMenuItems && (
          <Menu position="bottom-end" shadow="md" width={200}>
            <Menu.Target>
              <ActionIcon radius="xl" aria-label={`Actions for ${getReferenceString(resource)}`}>
                <IconDots />
              </ActionIcon>
            </Menu.Target>
            {popupMenuItems}
          </Menu>
        )}
      </Group>
      <ErrorBoundary>
        {padding ? <div style={{ padding: '0 16px 16px 16px' }}>{children}</div> : <>{children}</>}
      </ErrorBoundary>
    </Panel>
  );
}
