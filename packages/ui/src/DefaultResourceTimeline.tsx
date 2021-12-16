import { getReferenceString } from '@medplum/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import React from 'react';
import { ResourceTimeline } from './ResourceTimeline';

export interface DefaultResourceTimelineProps {
  resource: Resource | Reference;
}

export function DefaultResourceTimeline(props: DefaultResourceTimelineProps): JSX.Element {
  return (
    <ResourceTimeline
      value={props.resource}
      buildSearchRequests={(resource: Resource) => ({
        resourceType: 'Bundle',
        type: 'batch',
        entry: [
          {
            request: {
              method: 'GET',
              url: `${getReferenceString(resource)}/_history`
            }
          },
          {
            request: {
              method: 'GET',
              url: `AuditEvent?entity=${getReferenceString(resource)}&_count=20&_sort=-_lastUpdated`
            }
          }
        ]
      })}
    />
  );
}
