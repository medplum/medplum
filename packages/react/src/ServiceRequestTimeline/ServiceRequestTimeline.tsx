import { createReference, getReferenceString, MedplumClient, ProfileResource } from '@medplum/core';
import { Attachment, Group, Patient, Reference, ServiceRequest } from '@medplum/fhirtypes';
import React from 'react';
import { ResourceTimeline } from '../ResourceTimeline/ResourceTimeline';

export interface ServiceRequestTimelineProps {
  serviceRequest: ServiceRequest | Reference<ServiceRequest>;
}

export function ServiceRequestTimeline(props: ServiceRequestTimelineProps): JSX.Element {
  return (
    <ResourceTimeline
      value={props.serviceRequest}
      loadTimelineResources={async (medplum: MedplumClient, resource: ServiceRequest) => {
        return Promise.all([
          medplum.readHistory('ServiceRequest', resource.id as string),
          medplum.search('Communication', 'based-on=' + getReferenceString(resource)),
          medplum.search('Media', '_count=100&based-on=' + getReferenceString(resource)),
          medplum.search('DiagnosticReport', 'based-on=' + getReferenceString(resource)),
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
