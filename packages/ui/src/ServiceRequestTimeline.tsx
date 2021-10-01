import { Attachment, createReference, getReferenceString, Operator, ProfileResource, Reference, Resource, ServiceRequest } from '@medplum/core';
import React from 'react';
import { ResourceTimeline } from './ResourceTimeline';

export interface ServiceRequestTimelineProps {
  serviceRequest: ServiceRequest | Reference;
}

export function ServiceRequestTimeline(props: ServiceRequestTimelineProps): JSX.Element {
  return (
    <ResourceTimeline
      value={props.serviceRequest}
      buildSearchRequests={(serviceRequest: Resource) => {
        const serviceRequestReference = getReferenceString(serviceRequest);
        return [
          {
            resourceType: 'Communication',
            filters: [{
              code: 'based-on',
              operator: Operator.EQUALS,
              value: serviceRequestReference
            }],
            count: 100
          },
          {
            resourceType: 'Media',
            filters: [{
              code: 'based-on',
              operator: Operator.EQUALS,
              value: serviceRequestReference
            }],
            count: 100
          },
          {
            resourceType: 'DiagnosticReport',
            filters: [{
              code: 'based-on',
              operator: Operator.EQUALS,
              value: serviceRequestReference
            }],
            count: 100
          }
        ];
      }}
      createCommunication={(resource: Resource, sender: ProfileResource, text: string) => ({
        resourceType: 'Communication',
        basedOn: [createReference(resource)],
        subject: (resource as ServiceRequest).subject,
        sender: createReference(sender),
        payload: [{ contentString: text }]
      })}
      createMedia={(resource: Resource, operator: ProfileResource, content: Attachment) => ({
        resourceType: 'Media',
        basedOn: [createReference(resource)],
        subject: (resource as ServiceRequest).subject,
        operator: createReference(operator),
        content
      })}
    />
  );
}
