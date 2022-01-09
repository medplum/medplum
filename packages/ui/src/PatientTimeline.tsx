import { createReference, getReferenceString, ProfileResource } from '@medplum/core';
import { Attachment, Patient, Reference, Resource } from '@medplum/fhirtypes';
import React from 'react';
import { ResourceTimeline } from './ResourceTimeline';

export interface PatientTimelineProps {
  patient: Patient | Reference<Patient>;
}

const searches = [
  '$/_history',
  'Communication?subject=$',
  'Device?patient=$',
  'DeviceRequest?patient=$',
  'DiagnosticReport?subject=$',
  'Media?subject=$',
  'ServiceRequest?subject=$',
];

export function PatientTimeline(props: PatientTimelineProps): JSX.Element {
  return (
    <ResourceTimeline
      value={props.patient}
      buildSearchRequests={(resource: Resource) => ({
        resourceType: 'Bundle',
        type: 'batch',
        entry: searches.map((search) => ({
          request: {
            method: 'GET',
            url: search.replace('$', getReferenceString(resource)),
          },
        })),
      })}
      createCommunication={(resource: Patient, sender: ProfileResource, text: string) => ({
        resourceType: 'Communication',
        subject: createReference(resource),
        sender: createReference(sender),
        payload: [{ contentString: text }],
      })}
      createMedia={(resource: Patient, operator: ProfileResource, content: Attachment) => ({
        resourceType: 'Media',
        subject: createReference(resource),
        operator: createReference(operator),
        content,
      })}
    />
  );
}
