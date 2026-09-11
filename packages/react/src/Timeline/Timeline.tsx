// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Group, Menu, Skeleton, Stack, Text } from '@mantine/core';
import { formatDateTime, getReferenceString } from '@medplum/core';
import type { Reference, Resource } from '@medplum/fhirtypes';
import { IconDots } from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX, ReactNode } from 'react';
import { Container } from '../Container/Container';
import { ErrorBoundary } from '../ErrorBoundary/ErrorBoundary';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import type { PanelProps } from '../Panel/Panel';
import { Panel } from '../Panel/Panel';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import { ResourceName } from '../ResourceName/ResourceName';
import classes from './Timeline.module.css';

export interface TimelineProps {
  readonly children?: ReactNode;
}

export function Timeline(props: TimelineProps): JSX.Element {
  return <Container w="100%">{props.children}</Container>;
}

export interface TimelineItemProps<T extends Resource = Resource> extends PanelProps {
  readonly resource: T;
  readonly profile?: Reference;
  readonly dateTime?: string;
  readonly padding?: boolean;
  readonly popupMenuItems?: ReactNode;
}

export function TimelineItem(props: TimelineItemProps): JSX.Element {
  const { resource, profile, padding, popupMenuItems, ...others } = props;
  const author = profile ?? resource.meta?.author;
  const onBehalfOf = resource.meta?.onBehalfOf;
  const dateTime = props.dateTime ?? resource.meta?.lastUpdated;

  return (
    <Panel data-testid="timeline-item" fill={true} {...others}>
      <Group justify="space-between" gap={8} mx="xs" my="sm">
        <ResourceAvatar value={author} link={true} size="md" />
        <div style={{ flex: 1 }}>
          <Text size="sm">
            <ResourceName c="inherit" fw={500} value={author} link={true} />
            {onBehalfOf && (
              <Text component="span" size="xs" c="dimmed">
                {' on behalf of '}
                <ResourceName c="inherit" value={onBehalfOf} link={true} />
              </Text>
            )}
          </Text>
          <Text size="xs">
            <MedplumLink c="dimmed" to={props.resource}>
              {formatDateTime(dateTime)}
            </MedplumLink>
            <Text component="span" c="dimmed" mx={8}>
              &middot;
            </Text>
            <MedplumLink c="dimmed" to={props.resource}>
              {props.resource.resourceType}
            </MedplumLink>
          </Text>
        </div>
        {popupMenuItems && (
          <Menu position="bottom-end" shadow="md" width={200}>
            <Menu.Target>
              <ActionIcon
                color="gray"
                variant="subtle"
                radius="xl"
                aria-label={`Actions for ${getReferenceString(props.resource)}`}
              >
                <IconDots />
              </ActionIcon>
            </Menu.Target>
            {popupMenuItems}
          </Menu>
        )}
      </Group>
      <ErrorBoundary>
        <div className={cx(classes.item, { [classes.itemPadding]: padding })}>{props.children}</div>
      </ErrorBoundary>
    </Panel>
  );
}

export interface TimelineItemSkeletonProps {
  readonly lines?: number;
}

/**
 * Loading placeholder that mirrors the TimelineItem layout: an avatar with name and date lines
 * in the header, followed by a title bar and full-width body rows.
 * @param props - The skeleton props.
 * @returns The TimelineItemSkeleton React node.
 */
export function TimelineItemSkeleton(props: TimelineItemSkeletonProps): JSX.Element {
  const lines = props.lines ?? 4;
  return (
    <Panel data-testid="timeline-item-skeleton" fill={true}>
      <Group gap={8} mx="xs" my="sm" wrap="nowrap">
        <Skeleton circle height={38} />
        <Stack gap={8} style={{ flex: 1 }}>
          <Skeleton height={16} width="28%" />
          <Skeleton height={12} width="40%" />
        </Stack>
      </Group>
      <Stack gap="md" className={classes.itemPadding}>
        <Skeleton height={24} width="35%" mb="xs" />
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton key={index} height={18} />
        ))}
      </Stack>
    </Panel>
  );
}
