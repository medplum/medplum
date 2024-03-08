import { Badge } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { IconEdit } from '@tabler/icons-react';
import { ReactNode } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { killEvent } from '../utils/dom';

export interface ConceptBadgeProps {
  readonly resource: Resource;
  readonly onEdit?: (resource: Resource) => void;
}

export function ConceptBadge(props: ConceptBadgeProps): JSX.Element {
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
