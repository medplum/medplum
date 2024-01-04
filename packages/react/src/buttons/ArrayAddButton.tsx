import { Button, ActionIcon } from '@mantine/core';
import { IconCirclePlus } from '@tabler/icons-react';

export type ArrayAddButtonProps = Readonly<{
  propertyDisplayName?: string;
  onClick: React.MouseEventHandler;
  testId?: string;
}>;

export function ArrayAddButton({ propertyDisplayName, onClick, testId }: ArrayAddButtonProps): JSX.Element {
  const text = propertyDisplayName ? `Add ${propertyDisplayName}` : 'Add';

  return propertyDisplayName ? (
    <Button
      title={text}
      size="sm"
      color="green.6"
      variant="subtle"
      data-testid={testId}
      leftSection={<IconCirclePlus size="1.25rem" />}
      onClick={onClick}
    >
      {text}
    </Button>
  ) : (
    <ActionIcon title={text} color="green.6" data-testid={testId} onClick={onClick}>
      <IconCirclePlus size="1.25rem" />
    </ActionIcon>
  );
}
