import { ActionIcon } from '@mantine/core';
import { IconCircleMinus } from '@tabler/icons-react';
import { MouseEventHandler } from 'react';

export interface ArrayRemoveButtonProps {
  readonly propertyDisplayName?: string;
  readonly onClick: MouseEventHandler;
  readonly testId?: string;
}

export function ArrayRemoveButton({ propertyDisplayName, onClick, testId }: ArrayRemoveButtonProps): JSX.Element {
  return (
    <ActionIcon
      title={propertyDisplayName ? `Remove ${propertyDisplayName}` : 'Remove'}
      color="red.5"
      data-testid={testId}
      variant="subtle"
      onClick={onClick}
    >
      <IconCircleMinus size="1.25rem" />
    </ActionIcon>
  );
}
