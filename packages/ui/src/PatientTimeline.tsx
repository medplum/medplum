import { Attachment, createReference, getReferenceString, Patient, ProfileResource, Reference, Resource } from '@medplum/core';
import React from 'react';
import { ResourceTimeline } from './ResourceTimeline';

export interface PatientTimelineProps {
  patient: Patient | Reference<Patient>;
}

export function PatientTimeline(props: PatientTimelineProps): JSX.Element {
  return (
    <ResourceTimeline
      value={props.patient}
      buildSearchRequests={(resource: Resource) => ({
        resourceType: 'Bundle',
        type: 'batch',
        entry: [
          {
            request: {
              method: 'GET',
              url: `${getReferenceString(resource)}/_history`
            }
          },
          {
            request: {
              method: 'GET',
              url: `Communication?subject=${getReferenceString(resource)}`
            }
          },
          {
            request: {
              method: 'GET',
              url: `Media?subject=${getReferenceString(resource)}`
            }
          },
          {
            request: {
              method: 'GET',
              url: `ServiceRequest?subject=${getReferenceString(resource)}`
            }
          },
          {
            request: {
              method: 'GET',
              url: `DiagnosticReport?subject=${getReferenceString(resource)}`
            }
          }
        ]
      })}
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
