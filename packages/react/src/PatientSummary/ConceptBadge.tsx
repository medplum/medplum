import { Badge } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { IconEdit } from '@tabler/icons-react';
import { ReactNode } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { killEvent } from '../utils/dom';

export interface ConceptBadgeProps<T extends Resource> {
  readonly resource: T;
  readonly onEdit?: (resource: T) => void;
}

export function ConceptBadge<T extends Resource = Resource>(props: ConceptBadgeProps<T>): JSX.Element {
  const { resource, onEdit } = props;

  let rightSection: ReactNode | undefined = undefined;
  if (onEdit) {
    rightSection = (
      <IconEdit
        aria-label={`Edit ${getDisplayString(resource)}`}
        size={12}
        onClick={(e) => {
          killEvent(e);
          onEdit(resource);
        }}
      />
    );
  }

  return (
    <MedplumLink key={resource.id} to={resource}>
      <Badge variant="light" maw="100%" rightSection={rightSection}>
        {getDisplayString(resource)}
      </Badge>
    </MedplumLink>
  );
}
