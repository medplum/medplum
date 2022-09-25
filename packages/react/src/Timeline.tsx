import { ActionIcon, Button, Menu } from '@mantine/core';
import { formatDateTime, getReferenceString } from '@medplum/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import { IconDots } from '@tabler/icons';
import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { MedplumLink } from './MedplumLink';
import { ResourceAvatar } from './ResourceAvatar';
import { ResourceName } from './ResourceName';

import './Timeline.css';

export interface TimelineProps {
  children?: React.ReactNode;
}

export function Timeline(props: TimelineProps): JSX.Element {
  return <main className="medplum-document medplum-timeline">{props.children}</main>;
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
    <article className={props.className || 'medplum-timeline-item'} data-testid="timeline-item">
      <div className="medplum-timeline-item-header">
        <div className="medplum-timeline-item-avatar">
          <ResourceAvatar value={author} link={true} size="md" />
        </div>
        <div className="medplum-timeline-item-title">
          <ResourceName value={author} link={true} />
          <div className="medplum-timeline-item-subtitle">
            <MedplumLink to={props.resource}>{formatDateTime(props.resource.meta?.lastUpdated)}</MedplumLink>
            <span>&middot;</span>
            <MedplumLink to={props.resource}>{props.resource.resourceType}</MedplumLink>
          </div>
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
      </div>
      <ErrorBoundary>
        {props.padding && <div style={{ padding: '2px 16px 16px 16px' }}>{props.children}</div>}
        {!props.padding && <>{props.children}</>}
      </ErrorBoundary>
      {props.socialEnabled && (
        <div className="medplum-timeline-item-footer">
          <Button variant="subtle">Like</Button>
          <Button variant="subtle">Comment</Button>
        </div>
      )}
    </article>
  );
}
