import { getReferenceString } from '@medplum/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { DateTimeDisplay } from './DateTimeDisplay';
import { ErrorBoundary } from './ErrorBoundary';
import { MedplumLink } from './MedplumLink';
import { Popup } from './Popup';
import { ResourceName } from './ResourceName';
import { killEvent } from './utils/dom';
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
  const [popupAnchor, setPopupAnchor] = useState<DOMRect | undefined>();
  const author = props.profile ?? props.resource.meta?.author;
  return (
    <article className={props.className || 'medplum-timeline-item'} data-testid="timeline-item">
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
        {props.popupMenuItems && (
          <div className="medplum-timeline-item-actions">
            <a
              href="#"
              aria-label={`Actions for ${getReferenceString(props.resource)}`}
              onClick={(e) => {
                killEvent(e);
                const el = e.currentTarget;
                const rect = el.getBoundingClientRect();
                setPopupAnchor(rect);
              }}
            >
              <svg fill="currentColor" viewBox="0 0 20 20">
                <g transform="translate(-446 -350)">
                  <path d="M458 360a2 2 0 1 1-4 0 2 2 0 0 1 4 0m6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0m-12 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0"></path>
                </g>
              </svg>
            </a>
          </div>
        )}
      </div>
      <ErrorBoundary>
        {props.padding && <div style={{ padding: '2px 16px 16px 16px' }}>{props.children}</div>}
        {!props.padding && <>{props.children}</>}
      </ErrorBoundary>
      {props.socialEnabled && (
        <div className="medplum-timeline-item-footer">
          <Button borderless={true}>Like</Button>
          <Button borderless={true}>Comment</Button>
        </div>
      )}
      {props.popupMenuItems && (
        <Popup visible={!!popupAnchor} anchor={popupAnchor} autoClose={true} onClose={() => setPopupAnchor(undefined)}>
          {props.popupMenuItems}
        </Popup>
      )}
    </article>
  );
}
