import { createReference, MedplumClient, ProfileResource } from '@medplum/core';
import { Attachment, Group, Patient, Reference, ResourceType, ServiceRequest } from '@medplum/fhirtypes';
import React from 'react';
import { ResourceTimeline } from '../ResourceTimeline/ResourceTimeline';

export interface ServiceRequestTimelineProps {
  serviceRequest: ServiceRequest | Reference<ServiceRequest>;
}

export function ServiceRequestTimeline(props: ServiceRequestTimelineProps): JSX.Element {
  return (
    <ResourceTimeline
      value={props.serviceRequest}
      loadTimelineResources={async (medplum: MedplumClient, _resourceType: ResourceType, id: string) => {
        return Promise.allSettled([
          medplum.readHistory('ServiceRequest', id),
          medplum.search('Communication', 'based-on=ServiceRequest/' + id),
          medplum.search('Media', '_count=100&based-on=ServiceRequest/' + id),
          medplum.search('DiagnosticReport', 'based-on=ServiceRequest/' + id),
        ]);
      }}
      createCommunication={(resource: ServiceRequest, sender: ProfileResource, text: string) => ({
        resourceType: 'Communication',
        status: 'completed',
        basedOn: [createReference(resource)],
        subject: resource.subject as Reference<Group | Patient>,
        sender: createReference(sender),
        sent: new Date().toISOString(),
        payload: [{ contentString: text }],
      })}
      createMedia={(resource: ServiceRequest, operator: ProfileResource, content: Attachment) => ({
        resourceType: 'Media',
        status: 'completed',
        basedOn: [createReference(resource)],
        subject: resource.subject,
        operator: createReference(operator),
        issued: new Date().toISOString(),
        content,
      })}
    />
  );
}
