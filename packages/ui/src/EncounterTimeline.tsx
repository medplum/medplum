import { createReference, getReferenceString, ProfileResource } from '@medplum/core';
import { Attachment, Encounter, Reference, Resource } from '@medplum/fhirtypes';
import React from 'react';
import { ResourceTimeline } from './ResourceTimeline';

export interface EncounterTimelineProps {
  encounter: Encounter | Reference<Encounter>;
}

export function EncounterTimeline(props: EncounterTimelineProps): JSX.Element {
  return (
    <ResourceTimeline
      value={props.encounter}
      buildSearchRequests={(resource: Resource) => ({
        resourceType: 'Bundle',
        type: 'batch',
        entry: [
          {
            request: {
              method: 'GET',
              url: `${getReferenceString(resource)}/_history`,
            },
          },
          {
            request: {
              method: 'GET',
              url: `Communication?encounter=${getReferenceString(resource)}`,
            },
          },
          {
            request: {
              method: 'GET',
              url: `Media?encounter=${getReferenceString(resource)}`,
            },
          },
        ],
      })}
      createCommunication={(resource: Encounter, sender: ProfileResource, text: string) => ({
        resourceType: 'Communication',
        encounter: createReference(resource),
        subject: resource.subject,
        sender: createReference(sender),
        payload: [{ contentString: text }],
      })}
      createMedia={(resource: Encounter, operator: ProfileResource, content: Attachment) => ({
        resourceType: 'Media',
        encounter: createReference(resource),
        subject: resource.subject,
        operator: createReference(operator),
        content,
      })}
    />
  );
}
