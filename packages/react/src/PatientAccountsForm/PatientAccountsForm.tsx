// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { extractAccountReferences, normalizeErrorString } from '@medplum/core';
import type { Patient, Reference, ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconCheck, IconMinus, IconPlus, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { ReferenceInput } from '../ReferenceInput/ReferenceInput';
import { ResourceBadge } from '../ResourceBadge/ResourceBadge';

export interface PatientAccountsFormProps {
  readonly patient: Patient;
  readonly onSaved?: () => void;
}

const NOTIFICATION_ID = 'patient-accounts';
const NOTIFICATION_TITLE = 'Patient Accounts';
const ACCOUNT_TARGET_TYPES: ResourceType[] = ['Organization', 'HealthcareService', 'CareTeam'];

interface AccountChange {
  readonly reference: Reference;
  readonly type: 'addition' | 'removal';
}

export function PatientAccountsForm(props: PatientAccountsFormProps): JSX.Element {
  const { patient } = props;
  const medplum = useMedplum();
  const isAdmin = medplum.isProjectAdmin() || medplum.isSuperAdmin();

  const originalAccounts = useMemo<Reference[]>(() => extractAccountReferences(patient.meta) ?? [], [patient.meta]);

  const [pendingAccounts, setPendingAccounts] = useState<Reference[]>(originalAccounts);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [propagate, setPropagate] = useState(true);
  const [saving, setSaving] = useState(false);

  const changes = useMemo<AccountChange[]>(() => {
    const result: AccountChange[] = [];

    // Find additions (in pending but not in original)
    for (const account of pendingAccounts) {
      if (!originalAccounts.some((o) => o.reference === account.reference)) {
        result.push({ reference: account, type: 'addition' });
      }
    }

    // Find removals (in original but not in pending)
    for (const account of originalAccounts) {
      if (!pendingAccounts.some((p) => p.reference === account.reference)) {
        result.push({ reference: account, type: 'removal' });
      }
    }

    return result;
  }, [originalAccounts, pendingAccounts]);

  const hasChanges = changes.length > 0;

  const handleAddAccount = useCallback(
    (value: Reference | undefined) => {
      if (!value?.reference) {
        return;
      }
      // Don't add duplicates
      if (pendingAccounts.some((a) => a.reference === value.reference)) {
        return;
      }
      setPendingAccounts((prev) => [...prev, value]);
    },
    [pendingAccounts]
  );

  const handleRemoveAccount = useCallback((referenceString: string) => {
    setPendingAccounts((prev) => prev.filter((a) => a.reference !== referenceString));
  }, []);

  const handleSave = useCallback(async () => {
    const patientId = patient.id;
    if (!patientId) {
      notifications.show({
        id: NOTIFICATION_ID,
        title: NOTIFICATION_TITLE,
        color: 'red',
        message: 'Cannot update accounts: Patient resource has no ID.',
        icon: <IconX size="1rem" />,
        autoClose: false,
        withCloseButton: true,
      });
      return;
    }

    setSaving(true);
    setConfirmModalOpen(false);

    const url = medplum.fhirUrl('Patient', patientId, '$set-accounts');

    const parameters = {
      resourceType: 'Parameters' as const,
      parameter: [
        ...pendingAccounts.map((account) => ({
          name: 'accounts' as const,
          valueReference: { reference: account.reference },
        })),
        { name: 'propagate' as const, valueBoolean: propagate },
      ],
    };

    notifications.show({
      id: NOTIFICATION_ID,
      title: NOTIFICATION_TITLE,
      loading: true,
      message: propagate ? 'Saving account changes and propagating to compartment...' : 'Saving account changes...',
      autoClose: false,
      withCloseButton: false,
    });

    try {
      const headers: Record<string, string> = {};
      if (propagate) {
        headers['Prefer'] = 'respond-async';
      }
      await medplum.post(url, parameters, undefined, { headers });

      // Invalidate the cached Patient so useResource re-fetches with updated meta.accounts
      medplum.invalidateUrl(medplum.fhirUrl('Patient', patientId));

      notifications.update({
        id: NOTIFICATION_ID,
        title: NOTIFICATION_TITLE,
        color: 'green',
        message: propagate
          ? 'Account changes saved. Compartment updates are being applied.'
          : 'Account changes saved.',
        icon: <IconCheck size="1rem" />,
        loading: false,
        autoClose: true,
        withCloseButton: true,
      });

      props.onSaved?.();
    } catch (err) {
      notifications.update({
        id: NOTIFICATION_ID,
        title: NOTIFICATION_TITLE,
        color: 'red',
        message: normalizeErrorString(err),
        icon: <IconX size="1rem" />,
        loading: false,
        autoClose: false,
        withCloseButton: true,
      });
    } finally {
      setSaving(false);
    }
  }, [medplum, patient, pendingAccounts, propagate, props]);

  if (!isAdmin) {
    return (
      <Alert color="blue" title="Admin access required">
        You need project admin access to manage patient account assignments.
      </Alert>
    );
  }

  return (
    <>
      <Stack>
        <Title order={3}>Current Accounts</Title>
        {pendingAccounts.length === 0 ? (
          <Text c="dimmed">No accounts assigned to this patient.</Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Type</Table.Th>
                <Table.Th>Account</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pendingAccounts.map((account) => (
                <Table.Tr key={account.reference}>
                  <Table.Td>
                    <AccountTypeBadge reference={account} />
                  </Table.Td>
                  <Table.Td>
                    <ResourceBadge value={account} link />
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={`Remove ${account.reference}`}
                      onClick={() => handleRemoveAccount(account.reference as string)}
                    >
                      <IconX size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        <Divider />

        <Title order={4}>Add Account</Title>
        <ReferenceInput
          name="newAccount"
          placeholder="Search for Organization, HealthcareService, or CareTeam..."
          targetTypes={ACCOUNT_TARGET_TYPES}
          onChange={(value) => {
            if (value) {
              handleAddAccount(value);
            }
          }}
        />

        {hasChanges && (
          <>
            <Divider />
            <Title order={4}>Pending Changes</Title>
            <Stack gap="xs">
              {changes.map((change) => (
                <Group key={`${change.type}-${change.reference.reference}`} gap="xs">
                  {change.type === 'addition' ? (
                    <Badge color="green" variant="light" leftSection={<IconPlus size={12} />}>
                      Add
                    </Badge>
                  ) : (
                    <Badge color="red" variant="light" leftSection={<IconMinus size={12} />}>
                      Remove
                    </Badge>
                  )}
                  <ResourceBadge value={change.reference} link />
                </Group>
              ))}
            </Stack>
          </>
        )}

        <Box>
          <Button disabled={!hasChanges || saving} onClick={() => setConfirmModalOpen(true)}>
            Save Changes
          </Button>
        </Box>
      </Stack>

      <Modal
        opened={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title="Confirm Account Changes"
        size="md"
        keepMounted
      >
        <Stack>
          <Text>
            The following changes will be applied to Patient{' '}
            <strong>
              {patient.name?.[0]?.given?.join(' ')} {patient.name?.[0]?.family}
            </strong>
            :
          </Text>

          {changes.filter((c) => c.type === 'addition').length > 0 && (
            <Box>
              <Text fw={600} c="green">
                Adding:
              </Text>
              <Stack gap="xs" mt="xs">
                {changes
                  .filter((c) => c.type === 'addition')
                  .map((c) => (
                    <Group key={c.reference.reference} gap="xs">
                      <IconPlus size={14} color="green" />
                      <ResourceBadge value={c.reference} />
                    </Group>
                  ))}
              </Stack>
            </Box>
          )}

          {changes.filter((c) => c.type === 'removal').length > 0 && (
            <Box>
              <Text fw={600} c="red">
                Removing:
              </Text>
              <Stack gap="xs" mt="xs">
                {changes
                  .filter((c) => c.type === 'removal')
                  .map((c) => (
                    <Group key={c.reference.reference} gap="xs">
                      <IconMinus size={14} color="red" />
                      <ResourceBadge value={c.reference} />
                    </Group>
                  ))}
              </Stack>
            </Box>
          )}

          <Checkbox
            label="Propagate changes to all resources in this patient's compartment"
            checked={propagate}
            onChange={(event) => setPropagate(event.currentTarget.checked)}
          />

          <Group justify="right" mt="md">
            <Button variant="default" onClick={() => setConfirmModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              Confirm
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

function AccountTypeBadge({ reference }: { readonly reference: Reference }): JSX.Element {
  const type = reference.reference?.split('/')[0] ?? 'Unknown';
  const colorMap: Record<string, string> = {
    Organization: 'blue',
    HealthcareService: 'teal',
    CareTeam: 'violet',
  };
  return (
    <Badge variant="light" color={colorMap[type] ?? 'gray'} size="sm">
      {type}
    </Badge>
  );
}
