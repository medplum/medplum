import { ActionIcon, Badge } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { IconPencil } from '@tabler/icons-react';
import { JSX, ReactNode } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { killEvent } from '../utils/dom';

export interface ConceptBadgeProps<T extends Resource> {
  readonly resource: T;
  readonly display?: string;
  readonly onClick?: (resource: T) => void;
  readonly onEdit?: (resource: T) => void;
  readonly hideEditIcon?: boolean; // Add this new prop
}

export function ConceptBadge<T extends Resource = Resource>(props: ConceptBadgeProps<T>): JSX.Element {
  const { resource, display, onClick, onEdit, hideEditIcon } = props;

  let rightSection: ReactNode | undefined = undefined;
  if (onEdit && !hideEditIcon) {
    rightSection = (
      <ActionIcon variant="transparent" size={0} radius="xl" p={0} mx={0}>
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
      size="xs"
    >
      <Badge variant="light" maw="100%" rightSection={rightSection} style={{ cursor: 'pointer' }}>
        {display ?? getDisplayString(resource)}
      </Badge>
    </MedplumLink>
  );
}