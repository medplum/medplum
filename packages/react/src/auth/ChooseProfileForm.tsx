import { Avatar, Combobox, Flex, Group, Stack, Text, TextInput, Title, useCombobox } from '@mantine/core';
import { LoginAuthenticationResponse, normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome, ProjectMembership } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useState } from 'react';
import { Logo } from '../Logo/Logo';
import { OperationOutcomeAlert } from '../OperationOutcomeAlert/OperationOutcomeAlert';

export interface ChooseProfileFormProps {
  readonly login: string;
  readonly memberships: ProjectMembership[];
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
}

export function ChooseProfileForm(props: ChooseProfileFormProps): JSX.Element {
  const medplum = useMedplum();
  const combobox = useCombobox();
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState<OperationOutcome>();

  function filterDisplay(display: string | undefined): boolean {
    return !!display?.toLowerCase()?.includes(search.toLowerCase());
  }

  function filterMembership(membership: ProjectMembership): boolean {
    return filterDisplay(membership.profile?.display) || filterDisplay(membership.project?.display);
  }

  function handleValueSelect(membershipId: string): void {
    medplum
      .post('auth/profile', {
        login: props.login,
        profile: membershipId,
      })
      .then(props.handleAuthResponse)
      .catch((err) => setOutcome(normalizeOperationOutcome(err)));
  }

  const options = props.memberships
    .filter(filterMembership)
    .slice(0, 10)
    .map((item) => (
      <Combobox.Option value={item.id as string} key={item.id}>
        <SelectOption {...item} />
      </Combobox.Option>
    ));

  return (
    <Stack>
      <Flex gap="md" mb="md" justify="center" align="center" direction="column" wrap="nowrap">
        <Logo size={32} />
        <Title order={3}>Choose profile</Title>
      </Flex>
      <OperationOutcomeAlert outcome={outcome} />
      <Combobox store={combobox} onOptionSubmit={handleValueSelect}>
        <Combobox.EventsTarget>
          <TextInput
            placeholder="Search"
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              combobox.updateSelectedOptionIndex();
            }}
          />
        </Combobox.EventsTarget>

        <div>
          <Combobox.Options>
            {options.length > 0 ? options : <Combobox.Empty>Nothing found...</Combobox.Empty>}
          </Combobox.Options>
        </div>
      </Combobox>
    </Stack>
  );
}

function SelectOption(membership: ProjectMembership): JSX.Element {
  return (
    <Group>
      <Avatar radius="xl" />
      <div>
        <Text fz="sm" fw={500}>
          {membership.profile?.display}
        </Text>
        <Text fz="xs" opacity={0.6}>
          {membership.project?.display}
        </Text>
      </div>
    </Group>
  );
}
