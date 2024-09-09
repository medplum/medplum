import { createReference, MedplumClient, ProfileResource } from '@medplum/core';
import { Attachment, Patient, Reference, ResourceType } from '@medplum/fhirtypes';
import { useCallback } from 'react';
import { ResourceTimeline, ResourceTimelineProps } from '../ResourceTimeline/ResourceTimeline';

export interface PatientTimelineProps extends Pick<ResourceTimelineProps<Patient>, 'getMenu'> {
  readonly patient: Patient | Reference<Patient>;
}

export function PatientTimeline(props: PatientTimelineProps): JSX.Element {
  const { patient, ...rest } = props;

  const loadTimelineResources = useCallback((medplum: MedplumClient, resourceType: ResourceType, id: string) => {
    const ref = `${resourceType}/${id}`;
    const _count = 100;
    return Promise.allSettled([
      medplum.readHistory('Patient', id),
      medplum.search('Communication', { subject: ref, _count }),
      medplum.search('Device', { patient: ref, _count }),
      medplum.search('DeviceRequest', { patient: ref, _count }),
      medplum.search('DiagnosticReport', { subject: ref, _count }),
      medplum.search('Media', { subject: ref, _count }),
      medplum.search('ServiceRequest', { subject: ref, _count }),
      medplum.search('Task', { subject: ref, _count }),
    ]);
  }, []);

  return (
    <ResourceTimeline
      value={patient}
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
      {...rest}
    />
  );
}
