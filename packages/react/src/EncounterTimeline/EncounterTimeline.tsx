// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, ProfileResource } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Attachment, Encounter, Reference, ResourceType } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import type { ResourceTimelineProps } from '../ResourceTimeline/ResourceTimeline';
import { ResourceTimeline } from '../ResourceTimeline/ResourceTimeline';

export interface EncounterTimelineProps extends Pick<ResourceTimelineProps<Encounter>, 'getMenu'> {
  readonly encounter: Encounter | Reference<Encounter>;
}

export function EncounterTimeline(props: EncounterTimelineProps): JSX.Element {
  const { encounter, ...rest } = props;

  return (
    <ResourceTimeline
      value={encounter}
      loadTimelineResources={async (medplum: MedplumClient, _resourceType: ResourceType, id: string) => {
        return Promise.allSettled([
          medplum.readHistory('Encounter', id),
          medplum.search('Communication', 'encounter=Encounter/' + id),
          medplum.search('Media', 'encounter=Encounter/' + id),
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
      {...rest}
    />
  );
}
