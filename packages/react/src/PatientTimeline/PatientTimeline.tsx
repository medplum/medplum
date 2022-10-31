import { createReference, getReferenceString, ProfileResource } from '@medplum/core';
import { Attachment, Patient, Reference, Resource } from '@medplum/fhirtypes';
import React from 'react';
import { ResourceTimeline } from '../ResourceTimeline/ResourceTimeline';

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
            url: search.replaceAll('$', getReferenceString(resource)),
          },
        })),
      })}
      createCommunication={(resource: Patient, sender: ProfileResource, text: string) => ({
        resourceType: 'Communication',
        status: 'completed',
        subject: createReference(resource),
        sender: createReference(sender),
        sent: new Date().toISOString(),
        payload: [{ contentString: text }],
      })}
      createMedia={(resource: Patient, operator: ProfileResource, content: Attachment) => ({
        resourceType: 'Media',
        status: 'completed',
        subject: createReference(resource),
        operator: createReference(operator),
        issued: new Date().toISOString(),
        content,
      })}
    />
  );
}
