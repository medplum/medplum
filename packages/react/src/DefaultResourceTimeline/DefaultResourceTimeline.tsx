import { MedplumClient } from '@medplum/core';
import { Reference, Resource, ResourceType } from '@medplum/fhirtypes';
import React from 'react';
import { ResourceTimeline } from '../ResourceTimeline/ResourceTimeline';

export interface DefaultResourceTimelineProps {
  resource: Resource | Reference;
}

export function DefaultResourceTimeline(props: DefaultResourceTimelineProps): JSX.Element {
  return (
    <ResourceTimeline
      value={props.resource}
      loadTimelineResources={async (medplum: MedplumClient, resourceType: ResourceType, id: string) => {
        const ref = `${resourceType}/${id}`;
        const _count = 100;
        return Promise.allSettled([
          medplum.readHistory(resourceType, id),
          medplum.search('Task', { subject: ref, _count }),
        ]);
      }}
    />
  );
}
