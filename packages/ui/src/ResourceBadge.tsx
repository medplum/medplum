import { Reference, Resource } from '@medplum/fhirtypes';
import React from 'react';
import { Avatar } from './Avatar';
import { ResourceName } from './ResourceName';
import './ResourceBadge.css';

export interface ResourceBadgeProps {
  value?: Reference | Resource;
  link?: boolean;
}

export function ResourceBadge(props: ResourceBadgeProps) {
  return (
    <div className="medplum-resource-badge">
      <Avatar size="small" value={props.value} link={props.link} />
      <ResourceName value={props.value} link={props.link} />
    </div>
  );
}
