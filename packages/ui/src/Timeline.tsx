import React from 'react';
import { Resource } from '@medplum/core';
import { Avatar } from './Avatar';
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
  profile: string;
  resource: Resource
  children?: React.ReactNode;
}

export function TimelineItem(props: TimelineItemProps) {
  return (
    <article className="medplum-timeline-item">
      <div className="medplum-timeline-item-header">
        <div className="medplum-timeline-item-avatar">
          <a href={props.profile}><Avatar reference={props.profile} /></a>
        </div>
        <div className="medplum-timeline-item-title">
          <a href={props.profile}>Alice Smith</a>
          <div className="medplum-timeline-item-subtitle">
            <a href="#">{props.resource.meta?.lastUpdated?.toLocaleString()}</a>
            <span>&middot;</span>
            <a href="#">Patient</a>
          </div>
        </div>
      </div>
      {props.children}
      <div className="medplum-timeline-item-header">
        1+
      </div>
    </article>
  );
}