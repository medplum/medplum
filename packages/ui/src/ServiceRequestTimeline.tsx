import { Attachment, createReference, getReferenceString, Group, Operator, Patient, ProfileResource, Reference, Resource, ServiceRequest } from '@medplum/core';
import React from 'react';
import { ResourceTimeline } from './ResourceTimeline';

export interface ServiceRequestTimelineProps {
  serviceRequest: ServiceRequest | Reference<ServiceRequest>;
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
      createCommunication={(resource: ServiceRequest, sender: ProfileResource, text: string) => ({
        resourceType: 'Communication',
        basedOn: [createReference(resource)],
        subject: resource.subject as Reference<Group | Patient>,
        sender: createReference(sender),
        payload: [{ contentString: text }]
      })}
      createMedia={(resource: ServiceRequest, operator: ProfileResource, content: Attachment) => ({
        resourceType: 'Media',
        basedOn: [createReference(resource)],
        subject: resource.subject,
        operator: createReference(operator),
        content
      })}
    />
  );
}
