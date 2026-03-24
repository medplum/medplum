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
import { extractAccountReferences, normalizeErrorString, resolveId } from '@medplum/core';
import type { Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconCheck, IconMinus, IconPlus, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { ResourceBadge } from '../ResourceBadge/ResourceBadge';
import { ReferenceInput } from '../ReferenceInput/ReferenceInput';

export interface PatientTenantsFormProps {
  readonly patient: Patient;
}

const NOTIFICATION_ID = 'patient-tenants';
const NOTIFICATION_TITLE = 'Patient Tenants';
const TENANT_TARGET_TYPES = ['Organization', 'HealthcareService', 'CareTeam'];

interface TenantChange {
  readonly reference: Reference;
  readonly type: 'addition' | 'removal';
}

export function PatientTenantsForm(props: PatientTenantsFormProps): JSX.Element {
  const { patient } = props;
  const medplum = useMedplum();
  const isAdmin = medplum.isProjectAdmin() || medplum.isSuperAdmin();

  const originalAccounts = useMemo<Reference[]>(
    () => extractAccountReferences(patient.meta) ?? [],
    [patient.meta]
  );

  const [pendingAccounts, setPendingAccounts] = useState<Reference[]>(originalAccounts);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [propagate, setPropagate] = useState(true);
  const [saving, setSaving] = useState(false);

  const changes = useMemo<TenantChange[]>(() => {
    const result: TenantChange[] = [];

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

  const handleAddTenant = useCallback(
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

  const handleRemoveTenant = useCallback((referenceString: string) => {
    setPendingAccounts((prev) => prev.filter((a) => a.reference !== referenceString));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setConfirmModalOpen(false);

    const patientId = resolveId(patient) as string;
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
      message: propagate ? 'Saving tenant changes and propagating to compartment...' : 'Saving tenant changes...',
      autoClose: false,
      withCloseButton: false,
    });

    try {
      const headers: Record<string, string> = {};
      if (propagate) {
        headers['Prefer'] = 'respond-async';
      }
      await medplum.post(url, parameters, undefined, { headers });

      notifications.update({
        id: NOTIFICATION_ID,
        title: NOTIFICATION_TITLE,
        color: 'green',
        message: propagate
          ? 'Tenant changes saved. Compartment updates are being applied.'
          : 'Tenant changes saved.',
        icon: <IconCheck size="1rem" />,
        loading: false,
        autoClose: true,
        withCloseButton: true,
      });
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
  }, [medplum, patient, pendingAccounts, propagate]);

  if (!isAdmin) {
    return (
      <Alert color="blue" title="Admin access required">
        You need project admin access to manage patient tenant assignments.
      </Alert>
    );
  }

  return (
    <>
      <Stack>
        <Title order={3}>Current Tenants</Title>
        {pendingAccounts.length === 0 ? (
          <Text c="dimmed">No tenants assigned to this patient.</Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Type</Table.Th>
                <Table.Th>Tenant</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pendingAccounts.map((account) => (
                <Table.Tr key={account.reference}>
                  <Table.Td>
                    <TenantTypeBadge reference={account} />
                  </Table.Td>
                  <Table.Td>
                    <ResourceBadge value={account} link />
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={`Remove ${account.reference}`}
                      onClick={() => handleRemoveTenant(account.reference as string)}
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

        <Title order={4}>Add Tenant</Title>
        <ReferenceInput
          name="newTenant"
          placeholder="Search for Organization, HealthcareService, or CareTeam..."
          targetTypes={TENANT_TARGET_TYPES}
          onChange={(value) => {
            if (value) {
              handleAddTenant(value);
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
        title="Confirm Tenant Changes"
        size="md"
      >
        <Stack>
          <Text>
            The following changes will be applied to Patient <strong>{patient.name?.[0]?.given?.join(' ')}{' '}{patient.name?.[0]?.family}</strong>:
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

function TenantTypeBadge({ reference }: { readonly reference: Reference }): JSX.Element {
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
