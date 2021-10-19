import { Attachment, createReference, getReferenceString, Operator, Patient, ProfileResource, Reference, Resource } from '@medplum/core';
import React from 'react';
import { ResourceTimeline } from './ResourceTimeline';

export interface PatientTimelineProps {
  patient: Patient | Reference<Patient>;
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
          },
          {
            resourceType: 'ServiceRequest',
            filters: [{
              code: 'subject',
              operator: Operator.EQUALS,
              value: patientReference
            }],
            count: 100
          },
          {
            resourceType: 'DiagnosticReport',
            filters: [{
              code: 'subject',
              operator: Operator.EQUALS,
              value: patientReference
            }],
            count: 100
          }
        ];
      }}
      createCommunication={(resource: Patient, sender: ProfileResource, text: string) => ({
        resourceType: 'Communication',
        subject: createReference(resource),
        sender: createReference(sender),
        payload: [{ contentString: text }]
      })}
      createMedia={(resource: Patient, operator: ProfileResource, content: Attachment) => ({
        resourceType: 'Media',
        subject: createReference(resource),
        operator: createReference(operator),
        content
      })}
    />
  );
}
