import { ActionIcon, Container, Group, Menu, Paper, Text } from '@mantine/core';
import { formatDateTime, getReferenceString } from '@medplum/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import { IconDots } from '@tabler/icons';
import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { MedplumLink } from './MedplumLink';
import { ResourceAvatar } from './ResourceAvatar';
import { ResourceName } from './ResourceName';

export interface TimelineProps {
  children?: React.ReactNode;
}

export function Timeline(props: TimelineProps): JSX.Element {
  return <Container>{props.children}</Container>;
}

export interface TimelineItemProps {
  resource: Resource;
  profile?: Reference;
  socialEnabled?: boolean;
  children?: React.ReactNode;
  padding?: boolean;
  className?: string;
  popupMenuItems?: React.ReactNode;
}

export function TimelineItem(props: TimelineItemProps): JSX.Element {
  const author = props.profile ?? props.resource.meta?.author;

  return (
    <Paper data-testid="timeline-item" m="lg" p="sm" shadow="xs" radius="sm" withBorder className={props.className}>
      <Group position="apart" spacing={8}>
        <ResourceAvatar value={author} link={true} size="md" />
        <div style={{ flex: 1 }}>
          <Text size="sm">
            <ResourceName color="dark" weight={500} value={author} link={true} />
          </Text>
          <Text size="xs">
            <MedplumLink color="dimmed" to={props.resource}>
              {formatDateTime(props.resource.meta?.lastUpdated)}
            </MedplumLink>
            <Text component="span" color="dimmed" mx={8}>
              &middot;
            </Text>
            <MedplumLink color="dimmed" to={props.resource}>
              {props.resource.resourceType}
            </MedplumLink>
          </Text>
        </div>
        {props.popupMenuItems && (
          <Menu position="bottom-end" shadow="md" width={200}>
            <Menu.Target>
              <ActionIcon radius="xl" aria-label={`Actions for ${getReferenceString(props.resource)}`}>
                <IconDots />
              </ActionIcon>
            </Menu.Target>
            {props.popupMenuItems}
          </Menu>
        )}
      </Group>
      <ErrorBoundary>
        {props.padding && <div style={{ padding: '2px 16px 16px 16px' }}>{props.children}</div>}
        {!props.padding && <>{props.children}</>}
      </ErrorBoundary>
    </Paper>
  );
}
