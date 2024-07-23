import { Button, Stack, Title } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { IconEdit } from '@tabler/icons-react';

export function PatientActions(): JSX.Element {
  const navigate = useNavigate();

  return (
    <Stack p="xs" m="xs">
      <Title>Patient Actions</Title>
      <Button leftSection={<IconEdit size={16} />} onClick={() => navigate('/')}>
        Action
      </Button>
    </Stack>
  );
}
