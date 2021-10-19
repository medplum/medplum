import { Attachment, createReference, Encounter, getReferenceString, Operator, ProfileResource, Reference, Resource } from '@medplum/core';
import React from 'react';
import { ResourceTimeline } from './ResourceTimeline';

export interface EncounterTimelineProps {
  encounter: Encounter | Reference<Encounter>;
}

export function EncounterTimeline(props: EncounterTimelineProps): JSX.Element {
  return (
    <ResourceTimeline
      value={props.encounter}
      buildSearchRequests={(encounter: Resource) => {
        const encounterReference = getReferenceString(encounter);
        return [
          {
            resourceType: 'Communication',
            filters: [{
              code: 'encounter',
              operator: Operator.EQUALS,
              value: encounterReference
            }],
            count: 100
          },
          {
            resourceType: 'Media',
            filters: [{
              code: 'encounter',
              operator: Operator.EQUALS,
              value: encounterReference
            }],
            count: 100
          }
        ];
      }}
      createCommunication={(resource: Encounter, sender: ProfileResource, text: string) => ({
        resourceType: 'Communication',
        encounter: createReference(resource),
        subject: resource.subject,
        sender: createReference(sender),
        payload: [{ contentString: text }]
      })}
      createMedia={(resource: Encounter, operator: ProfileResource, content: Attachment) => ({
        resourceType: 'Media',
        encounter: createReference(resource),
        subject: resource.subject,
        operator: createReference(operator),
        content
      })}
    />
  );
}
