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
              code: 'entity',
              operator: Operator.EQUALS,
              value: getReferenceString(resource)
            }],
            sortRules: [{
              code: '_lastUpdated',
              descending: true
            }],
            count: 100
          }
        ];
      }}
    />
  );
}
