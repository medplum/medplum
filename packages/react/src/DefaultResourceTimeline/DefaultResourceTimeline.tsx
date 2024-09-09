import { MedplumClient } from '@medplum/core';
import { Reference, Resource, ResourceType } from '@medplum/fhirtypes';
import { ResourceTimeline, ResourceTimelineProps } from '../ResourceTimeline/ResourceTimeline';

export interface DefaultResourceTimelineProps extends Pick<ResourceTimelineProps<Resource>, 'getMenu'> {
  readonly resource: Resource | Reference;
}

export function DefaultResourceTimeline(props: DefaultResourceTimelineProps): JSX.Element {
  const { resource, ...rest } = props;
  return (
    <ResourceTimeline
      value={resource}
      loadTimelineResources={async (medplum: MedplumClient, resourceType: ResourceType, id: string) => {
        const ref = `${resourceType}/${id}`;
        const _count = 100;
        return Promise.allSettled([
          medplum.readHistory(resourceType, id),
          medplum.search('Task', { _filter: `based-on eq ${ref} or focus eq ${ref} or subject eq ${ref}`, _count }),
        ]);
      }}
      {...rest}
    />
  );
}
