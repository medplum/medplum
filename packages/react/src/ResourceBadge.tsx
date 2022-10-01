import { Reference, Resource } from '@medplum/fhirtypes';
import React from 'react';
import { ResourceAvatar } from './ResourceAvatar';
import { ResourceName } from './ResourceName';

import './ResourceBadge.css';

export interface ResourceBadgeProps {
  value?: Reference | Resource;
  link?: boolean;
}

export function ResourceBadge(props: ResourceBadgeProps): JSX.Element {
  return (
    <div className="medplum-resource-badge">
      <ResourceAvatar size={24} radius={12} value={props.value} link={props.link} />
      <ResourceName value={props.value} link={props.link} />
    </div>
  );
}
