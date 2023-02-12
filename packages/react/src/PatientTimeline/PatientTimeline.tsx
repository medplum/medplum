import { createReference, MedplumClient, ProfileResource } from '@medplum/core';
import { Attachment, Patient, Reference, ResourceType } from '@medplum/fhirtypes';
import React, { useCallback } from 'react';
import { ResourceTimeline } from '../ResourceTimeline/ResourceTimeline';

export interface PatientTimelineProps {
  patient: Patient | Reference<Patient>;
}

export function PatientTimeline(props: PatientTimelineProps): JSX.Element {
  const loadTimelineResources = useCallback((medplum: MedplumClient, _resourceType: ResourceType, id: string) => {
    return Promise.allSettled([
      medplum.readHistory('Patient', id),
      medplum.search('Communication', 'subject=Patient/' + id),
      medplum.search('Device', 'patient=Patient/' + id),
      medplum.search('DeviceRequest', 'patient=Patient/' + id),
      medplum.search('DiagnosticReport', 'subject=Patient/' + id),
      medplum.search('Media', 'subject=Patient/' + id),
      medplum.search('ServiceRequest', 'subject=Patient/' + id),
    ]);
  }, []);

  return (
    <ResourceTimeline
      value={props.patient}
      loadTimelineResources={loadTimelineResources}
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
