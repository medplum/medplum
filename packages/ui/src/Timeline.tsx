import { ChatIcon, ThumbUpIcon } from '@heroicons/react/outline';
import { getReferenceString, Reference, Resource } from '@medplum/core';
import React from 'react';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { MedplumLink } from './MedplumLink';
import { ResourceName } from './ResourceName';
import { formatDateTime } from './utils/format';
import './Timeline.css';

export interface TimelineProps {
  children?: React.ReactNode;
}

export function Timeline(props: TimelineProps) {
  return (
    <main className="medplum-timeline">
      {props.children}
    </main>
  );
}

export interface TimelineItemProps {
  resource: Resource
  profile?: Reference;
  children?: React.ReactNode;
}

export function TimelineItem(props: TimelineItemProps) {
  const author = props.profile ?? props.resource.meta?.author;
  const url = `/${getReferenceString(props.resource)}`;
  return (
    <article className="medplum-timeline-item" data-testid="timeline-item">
      <div className="medplum-timeline-item-header">
        <div className="medplum-timeline-item-avatar">
          <Avatar reference={author} link={true} />
        </div>
        <div className="medplum-timeline-item-title">
          <ResourceName reference={author} link={true} />
          <div className="medplum-timeline-item-subtitle">
            <MedplumLink to={url}>{formatDateTime(props.resource.meta?.lastUpdated)}</MedplumLink>
            <span>&middot;</span>
            <MedplumLink to={url}>{props.resource.resourceType}</MedplumLink>
          </div>
        </div>
      </div>
      {props.children}
      <div className="medplum-timeline-item-footer">
        <Button borderless={true}><ThumbUpIcon className="medplum-timeline-icon" /> Like</Button>
        <Button borderless={true}><ChatIcon className="medplum-timeline-icon" /> Comment</Button>
      </div>
    </article>
  );
}