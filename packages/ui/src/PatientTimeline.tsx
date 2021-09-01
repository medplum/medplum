import { Attachment, createReference, getReferenceString, Operator, Patient, ProfileResource, Reference, Resource } from '@medplum/core';
import React from 'react';
import { ResourceTimeline } from './ResourceTimeline';

export interface PatientTimelineProps {
  patient: Patient | Reference;
}

export function PatientTimeline(props: PatientTimelineProps): JSX.Element {
  return (
    <ResourceTimeline
      value={props.patient}
      buildSearchRequests={(patient: Resource) => {
        const patientReference = getReferenceString(patient);
        return [
          {
            resourceType: 'Communication',
            filters: [{
              code: 'subject',
              operator: Operator.EQUALS,
              value: patientReference
            }],
            count: 100
          },
          {
            resourceType: 'Media',
            filters: [{
              code: 'subject',
              operator: Operator.EQUALS,
              value: patientReference
            }],
            count: 100
          }
        ];
      }}
      createCommunication={(resource: Resource, sender: ProfileResource, text: string) => ({
        resourceType: 'Communication',
        subject: createReference(resource),
        sender: createReference(sender),
        payload: [{ contentString: text }]
      })}
      createMedia={(resource: Resource, operator: ProfileResource, content: Attachment) => ({
        resourceType: 'Media',
        subject: createReference(resource),
        operator: createReference(operator),
        content
      })}
    />
  );
}
