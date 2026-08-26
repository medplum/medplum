// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Card, Group, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconInfoCircle, IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import {
  BILLING_ORGANIZATION_IDENTIFIER_VALUE,
  EIN_SYSTEM,
  MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM,
  NPI_SYSTEM,
} from '../../utils/billing';
import { showErrorNotification } from '../../utils/notifications';
import { BillingOrganizationModal } from './BillingOrganizationModal';

export function BillingOrganizationList(): JSX.Element {
  const medplum = useMedplum();
  const [organizations, setOrganizations] = useState<WithId<Organization>[]>([]);
  const [reload, setReload] = useState(0);
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [editingOrganization, setEditingOrganization] = useState<WithId<Organization> | undefined>(undefined);

  useEffect(() => {
    // Filter on the provider-app marker identifier (stamped on save by the modal), not on
    // organization type: projects can hold hundreds of unrelated Organizations. No NPI filter —
    // misconfigured organizations must stay visible here so they can be fixed.
    medplum
      .searchResources('Organization', {
        identifier: `${MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM}|${BILLING_ORGANIZATION_IDENTIFIER_VALUE}`,
        _count: '100',
        _sort: 'name',
      })
      .then(setOrganizations)
      .catch(showErrorNotification);
  }, [medplum, reload]);

  const handleNew = (): void => {
    setEditingOrganization(undefined);
    openModal();
  };

  const handleEdit = (organization: WithId<Organization>): void => {
    setEditingOrganization(organization);
    openModal();
  };

  return (
    <Stack gap="sm">
      <Group justify="flex-end">
        <Button variant="outline" leftSection={<IconPlus size={16} />} onClick={handleNew}>
          New organization
        </Button>
      </Group>

      {organizations.length === 0 && (
        <Card withBorder p="md">
          <Text c="dimmed" size="sm">
            No billing providers yet. Create one to bill claims under an organization NPI.
          </Text>
        </Card>
      )}

      {organizations.map((organization) => (
        <OrganizationCard key={organization.id} organization={organization} onEdit={handleEdit} />
      ))}

      <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
        Candid requires the NPI and Tax ID entered here to match a provider registered in Candid with a payer contract,
        set up offline in the Candid portal. Stedi needs no pre-registration.
      </Alert>

      <BillingOrganizationModal
        organization={editingOrganization}
        opened={modalOpened}
        onClose={closeModal}
        onSaved={() => setReload((r) => r + 1)}
      />
    </Stack>
  );
}

function OrganizationCard(props: {
  organization: WithId<Organization>;
  onEdit: (organization: WithId<Organization>) => void;
}): JSX.Element {
  const { organization, onEdit } = props;
  const npi = organization.identifier?.find((id) => id.system === NPI_SYSTEM)?.value;
  const ein = organization.identifier?.find((id) => id.system === EIN_SYSTEM)?.value;
  const phone = organization.telecom?.find((t) => t.system === 'phone')?.value;
  const address = organization.address?.[0];
  const addressLine = address ? [address.city, address.state].filter(Boolean).join(', ') : undefined;
  const meta = [npi && `NPI ${npi}`, ein && `EIN ${ein}`, addressLine, phone].filter(Boolean).join(' · ');

  return (
    <Card withBorder p="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fw={600}>{organization.name ?? organization.id}</Text>
          {meta && (
            <Text size="sm" c="dimmed">
              {meta}
            </Text>
          )}
          {!npi && (
            <Badge color="yellow" variant="light" mt={6}>
              Missing NPI — hidden from encounter billing picker
            </Badge>
          )}
        </div>
        <Button variant="subtle" onClick={() => onEdit(organization)}>
          Edit
        </Button>
      </Group>
    </Card>
  );
}
