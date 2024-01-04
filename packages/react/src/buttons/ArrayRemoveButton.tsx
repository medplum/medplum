import { ActionIcon } from '@mantine/core';
import { IconCircleMinus } from '@tabler/icons-react';

type ArrayRemoveButtonProps = Readonly<{
  propertyDisplayName?: string;
  onClick: React.MouseEventHandler;
  testId?: string;
}>;

export function ArrayRemoveButton({ propertyDisplayName, onClick, testId }: ArrayRemoveButtonProps): JSX.Element {
  return (
    <ActionIcon
      title={propertyDisplayName ? `Remove ${propertyDisplayName}` : 'Remove'}
      color="red.5"
      data-testid={testId}
      onClick={onClick}
    >
      <IconCircleMinus size="1.25rem" />
    </ActionIcon>
  );
}
