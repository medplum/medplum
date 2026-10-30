// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Checkbox, Group, Modal, Stack, Table, Text, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { InviteRequest } from '@medplum/core';
import { formatDateTime, isOperationOutcome, normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import {
  Form,
  getErrorsForInput,
  OperationOutcomeAlert,
  ResourceAvatar,
  ResourceName,
  SubmitButton,
  useMedplum,
} from '@medplum/react';
import { useSearchResources } from '@medplum/react-hooks';
import { IconUserPlus, IconUsers } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { SettingsPage, SettingsSection } from '../../components/settings/SettingsLayout';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';

export function MembersSettingsPage(): JSX.Element {
  const medplum = useMedplum();
  const isAdmin = medplum.isProjectAdmin();
  const [inviteOpened, inviteHandlers] = useDisclosure(false);
  const [members, loading, outcome] = useSearchResources('ProjectMembership', {
    'profile-type': 'Practitioner',
    _sort: '-_lastUpdated',
    _count: '100',
  });

  return (
    <SettingsPage title="Members" description="Practitioners who can sign in to this project.">
      {!isAdmin && (
        <Alert variant="light" color="gray">
          Only project admins can view and invite members.
        </Alert>
      )}
      {isAdmin && (
        <SettingsSection
          title={members ? `${members.length} members` : 'Members'}
          description="Admins can invite members and change project settings."
          icon={<IconUsers size={22} />}
          actions={
            <Button size="sm" leftSection={<IconUserPlus size={14} />} onClick={inviteHandlers.open}>
              Invite member
            </Button>
          }
        >
          <OperationOutcomeAlert outcome={outcome} />
          {!loading && (
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Role</Table.Th>
                  <Table.Th>Last updated</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {members?.map((member) => (
                  <Table.Tr key={member.id}>
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <ResourceAvatar value={member.profile} size={28} radius="xl" />
                        <ResourceName value={member.profile} link />
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      {member.admin ? (
                        <Badge variant="light">Admin</Badge>
                      ) : (
                        <Text size="sm" c="dimmed">
                          Member
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{formatDateTime(member.meta?.lastUpdated)}</Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </SettingsSection>
      )}
      <Modal title="Invite member" opened={inviteOpened} onClose={inviteHandlers.close} centered>
        <InviteForm onSuccess={inviteHandlers.close} />
      </Modal>
    </SettingsPage>
  );
}

function InviteForm(props: { readonly onSuccess: () => void }): JSX.Element {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();

  async function handleSubmit(formData: Record<string, string>): Promise<void> {
    setOutcome(undefined);
    const body: InviteRequest = {
      resourceType: 'Practitioner',
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      sendEmail: formData.sendEmail === 'on',
      admin: formData.admin === 'on',
    };
    try {
      const result = await medplum.invite(medplum.getProject()?.id as string, body);
      medplum.invalidateSearches('ProjectMembership');
      if (isOperationOutcome(result)) {
        showErrorNotification('Member created, but the invite email could not be sent');
      } else {
        showSuccessNotification({ message: `Invited ${body.firstName} ${body.lastName}` });
      }
      props.onSuccess();
    } catch (err) {
      setOutcome(normalizeOperationOutcome(err));
    }
  }

  return (
    <Form onSubmit={handleSubmit}>
      <Stack>
        <OperationOutcomeAlert outcome={outcome} />
        <Group grow>
          <TextInput name="firstName" label="First name" required autoFocus />
          <TextInput name="lastName" label="Last name" required />
        </Group>
        <TextInput name="email" type="email" label="Email" required error={getErrorsForInput(outcome, 'email')} />
        <Checkbox name="sendEmail" label="Send invite email" defaultChecked />
        <Checkbox name="admin" label="Project admin" />
        <Group justify="flex-end">
          <SubmitButton>Send invite</SubmitButton>
        </Group>
      </Stack>
    </Form>
  );
}
