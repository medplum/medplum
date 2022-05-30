import { Reference, Resource } from '@medplum/fhirtypes';
import React from 'react';
import { Avatar } from './Avatar';
import { ResourceName } from './ResourceName';
import './ResourceBadge.css';

export interface ResourceBadgeProps {
  value?: Reference | Resource;
  size?: 'xsmall' | 'small' | 'medium' | 'large';
  link?: boolean;
}

export function ResourceBadge(props: ResourceBadgeProps): JSX.Element {
  return (
    <div className="medplum-resource-badge">
      <Avatar size={props.size ?? 'small'} value={props.value} link={props.link} />
      <ResourceName value={props.value} link={props.link} />
    </div>
  );
}
