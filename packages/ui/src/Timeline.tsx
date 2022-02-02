import { Reference, Resource } from '@medplum/fhirtypes';
import React from 'react';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { DateTimeDisplay } from './DateTimeDisplay';
import { MedplumLink } from './MedplumLink';
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
}

export function TimelineItem(props: TimelineItemProps): JSX.Element {
  const author = props.profile ?? props.resource.meta?.author;
  return (
    <article className="medplum-timeline-item" data-testid="timeline-item">
      <div className="medplum-timeline-item-header">
        <div className="medplum-timeline-item-avatar">
          <Avatar value={author} link={true} size="medium" />
        </div>
        <div className="medplum-timeline-item-title">
          <ResourceName value={author} link={true} />
          <div className="medplum-timeline-item-subtitle">
            <MedplumLink to={props.resource}>
              <DateTimeDisplay value={props.resource.meta?.lastUpdated} />
            </MedplumLink>
            <span>&middot;</span>
            <MedplumLink to={props.resource}>{props.resource.resourceType}</MedplumLink>
          </div>
        </div>
      </div>
      {props.padding && <div style={{ padding: '2px 16px 16px 16px' }}>{props.children}</div>}
      {!props.padding && <>{props.children}</>}
      {props.socialEnabled && (
        <div className="medplum-timeline-item-footer">
          <Button borderless={true}>Like</Button>
          <Button borderless={true}>Comment</Button>
        </div>
      )}
    </article>
  );
}
