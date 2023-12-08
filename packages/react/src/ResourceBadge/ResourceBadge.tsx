import { Group } from '@mantine/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import { ResourceName } from '../ResourceName/ResourceName';

export interface ResourceBadgeProps {
  value?: Reference | Resource;
  link?: boolean;
}

export function ResourceBadge(props: ResourceBadgeProps): JSX.Element {
  return (
    <Group spacing="xs">
      <ResourceAvatar size={24} radius={12} value={props.value} link={props.link} />
      <ResourceName value={props.value} link={props.link} />
    </Group>
  );
}
