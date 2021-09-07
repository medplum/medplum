import { getReferenceString, Operator, Reference, Resource, Subscription } from '@medplum/core';
import React from 'react';
import { ResourceTimeline } from './ResourceTimeline';

export interface SubscriptionTimelineProps {
  subscription: Subscription | Reference;
}

export function SubscriptionTimeline(props: SubscriptionTimelineProps): JSX.Element {
  return (
    <ResourceTimeline
      value={props.subscription}
      buildSearchRequests={(subscription: Resource) => {
        return [
          {
            resourceType: 'AuditEvent',
            filters: [{
              code: 'source',
              operator: Operator.EQUALS,
              value: getReferenceString(subscription)
            }],
            count: 100
          }
        ];
      }}
    />
  );
}
