import { createReference, MedplumClient, ProfileResource } from '@medplum/core';
import { Attachment, Group, Patient, Reference, ResourceType, ServiceRequest } from '@medplum/fhirtypes';
import { ResourceTimeline, ResourceTimelineProps } from '../ResourceTimeline/ResourceTimeline';

export interface ServiceRequestTimelineProps extends Pick<ResourceTimelineProps<ServiceRequest>, 'getMenu'> {
  readonly serviceRequest: ServiceRequest | Reference<ServiceRequest>;
}

export function ServiceRequestTimeline(props: ServiceRequestTimelineProps): JSX.Element {
  const { serviceRequest, ...rest } = props;
  return (
    <ResourceTimeline
      value={serviceRequest}
      loadTimelineResources={async (medplum: MedplumClient, resourceType: ResourceType, id: string) => {
        const ref = `${resourceType}/${id}`;
        const _count = 100;
        return Promise.allSettled([
          medplum.readHistory('ServiceRequest', id),
          medplum.search('Communication', { 'based-on': ref, _count }),
          medplum.search('DiagnosticReport', { 'based-on': ref, _count }),
          medplum.search('Media', { 'based-on': ref, _count }),
          medplum.search('DocumentReference', { related: ref, _count }),
          medplum.search('Task', { _filter: `based-on eq ${ref} or focus eq ${ref} or subject eq ${ref}`, _count }),
        ]);
      }}
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
      {...rest}
    />
  );
}
