import { createReference, getReferenceString, MedplumClient, ProfileResource } from '@medplum/core';
import { Attachment, Encounter, Reference } from '@medplum/fhirtypes';
import React from 'react';
import { ResourceTimeline } from '../ResourceTimeline/ResourceTimeline';

export interface EncounterTimelineProps {
  encounter: Encounter | Reference<Encounter>;
}

export function EncounterTimeline(props: EncounterTimelineProps): JSX.Element {
  return (
    <ResourceTimeline
      value={props.encounter}
      loadTimelineResources={async (medplum: MedplumClient, resource: Encounter) => {
        return Promise.all([
          medplum.readHistory('Encounter', resource.id as string),
          medplum.search('Communication', 'encounter=' + getReferenceString(resource)),
          medplum.search('Media', 'encounter=' + getReferenceString(resource)),
        ]);
      }}
      createCommunication={(resource: Encounter, sender: ProfileResource, text: string) => ({
        resourceType: 'Communication',
        status: 'completed',
        encounter: createReference(resource),
        subject: resource.subject,
        sender: createReference(sender),
        sent: new Date().toISOString(),
        payload: [{ contentString: text }],
      })}
      createMedia={(resource: Encounter, operator: ProfileResource, content: Attachment) => ({
        resourceType: 'Media',
        status: 'completed',
        encounter: createReference(resource),
        subject: resource.subject,
        operator: createReference(operator),
        issued: new Date().toISOString(),
        content,
      })}
    />
  );
}
