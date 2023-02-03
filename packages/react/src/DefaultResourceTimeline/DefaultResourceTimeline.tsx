import { getReferenceString, MedplumClient } from '@medplum/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import React from 'react';
import { ResourceTimeline } from '../ResourceTimeline/ResourceTimeline';

export interface DefaultResourceTimelineProps {
  resource: Resource | Reference;
}

export function DefaultResourceTimeline(props: DefaultResourceTimelineProps): JSX.Element {
  return (
    <ResourceTimeline
      value={props.resource}
      loadTimelineResources={async (medplum: MedplumClient, resource: Resource) => {
        return Promise.all([
          medplum.readHistory(resource.resourceType, resource.id as string),
          medplum.search('AuditEvent', '_sort=-_lastUpdated&entity=' + getReferenceString(resource)),
        ]);
      }}
    />
  );
}
