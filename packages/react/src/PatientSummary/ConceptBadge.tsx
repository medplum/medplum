import { ActionIcon, Badge } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { IconPencil } from '@tabler/icons-react';
import { ReactNode } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { killEvent } from '../utils/dom';

export interface ConceptBadgeProps<T extends Resource> {
  readonly resource: T;
  readonly display?: string;
  readonly onClick?: (resource: T) => void;
  readonly onEdit?: (resource: T) => void;
}

export function ConceptBadge<T extends Resource = Resource>(props: ConceptBadgeProps<T>): JSX.Element {
  const { resource, display, onClick, onEdit } = props;

  let rightSection: ReactNode | undefined = undefined;
  if (onEdit) {
    rightSection = (
      <ActionIcon variant="subtle" size={12} radius="xl">
        <IconPencil
          aria-label={`Edit ${getDisplayString(resource)}`}
          size={12}
          onClick={(e) => {
            killEvent(e);
            onEdit(resource);
          }}
        />
      </ActionIcon>
    );
  }

  return (
    <MedplumLink
      key={resource.id}
      to={onClick ? undefined : resource}
      onClick={onClick ? () => onClick(resource) : undefined}
    >
      <Badge variant="light" maw="100%" rightSection={rightSection} style={{ cursor: 'pointer' }}>
        {display ?? getDisplayString(resource)}
      </Badge>
    </MedplumLink>
  );
}
