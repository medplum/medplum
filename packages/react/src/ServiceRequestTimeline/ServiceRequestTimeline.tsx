import { createReference, getReferenceString, ProfileResource } from '@medplum/core';
import { Attachment, Group, Patient, Reference, Resource, ServiceRequest } from '@medplum/fhirtypes';
import React from 'react';
import { ResourceTimeline } from '../ResourceTimeline/ResourceTimeline';

export interface ServiceRequestTimelineProps {
  serviceRequest: ServiceRequest | Reference<ServiceRequest>;
}

export function ServiceRequestTimeline(props: ServiceRequestTimelineProps): JSX.Element {
  return (
    <ResourceTimeline
      value={props.serviceRequest}
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
              url: `Communication?based-on=${getReferenceString(resource)}&_sort=-_lastUpdated`,
            },
          },
          {
            request: {
              method: 'GET',
              url: `Media?_count=100&based-on=${getReferenceString(resource)}&_sort=-_lastUpdated`,
            },
          },
          {
            request: {
              method: 'GET',
              url: `DiagnosticReport?based-on=${getReferenceString(resource)}&_sort=-_lastUpdated`,
            },
          },
        ],
      })}
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
