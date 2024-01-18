import { Avatar, Center, Group, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { LoginAuthenticationResponse, normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome, ProjectMembership } from '@medplum/fhirtypes';
import { useState } from 'react';
import { Logo } from '../Logo/Logo';
import { useMedplum } from '@medplum/react-hooks';
import { OperationOutcomeAlert } from '../OperationOutcomeAlert/OperationOutcomeAlert';

export interface ChooseProfileFormProps {
  login: string;
  memberships: ProjectMembership[];
  handleAuthResponse: (response: LoginAuthenticationResponse) => void;
}

export function ChooseProfileForm(props: ChooseProfileFormProps): JSX.Element {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  return (
    <Stack>
      <Center style={{ flexDirection: 'column' }}>
        <Logo size={32} />
        <Title order={3}>Choose profile</Title>
      </Center>
      <OperationOutcomeAlert outcome={outcome} />
      {props.memberships.map((membership: ProjectMembership) => (
        <UnstyledButton
          key={membership.id}
          onClick={() => {
            medplum
              .post('auth/profile', {
                login: props.login,
                profile: membership.id,
              })
              .then(props.handleAuthResponse)
              .catch((err) => setOutcome(normalizeOperationOutcome(err)));
          }}
        >
          <Group>
            <Avatar radius="xl" />
            <div style={{ flex: 1 }}>
              <Text size="sm" fw={500}>
                {membership.profile?.display}
              </Text>
              <Text c="dimmed" size="xs">
                {membership.project?.display}
              </Text>
            </div>
          </Group>
        </UnstyledButton>
      ))}
    </Stack>
  );
}
