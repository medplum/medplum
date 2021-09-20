import { getReferenceString, Operator, Reference, Resource } from '@medplum/core';
import React from 'react';
import { ResourceTimeline } from './ResourceTimeline';

export interface DefaultResourceTimelineProps {
  resource: Resource | Reference;
}

export function DefaultResourceTimeline(props: DefaultResourceTimelineProps): JSX.Element {
  return (
    <ResourceTimeline
      value={props.resource}
      buildSearchRequests={(resource: Resource) => {
        return [
          {
            resourceType: 'AuditEvent',
            filters: [{
              code: 'source',
              operator: Operator.EQUALS,
              value: getReferenceString(resource)
            }],
            count: 100
          }
        ];
      }}
    />
  );
}
