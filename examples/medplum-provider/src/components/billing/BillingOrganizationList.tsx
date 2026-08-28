// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Card, Group, Pagination, Stack, Table, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getIdentifier } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import { IconInfoCircle, IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import type { BillingOrganizations } from '../../hooks/useBillingOrganizations';
import { EIN_SYSTEM, NPI_SYSTEM } from '../../utils/billing';
import { CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM } from '../../utils/candid';

export interface BillingOrganizationListProps {
  readonly billingOrganizations: BillingOrganizations;
  readonly onNewOrganization: () => void;
  readonly onSelectOrganization: (organization: WithId<Organization>) => void;
}

export function BillingOrganizationList(props: BillingOrganizationListProps): JSX.Element {
  const { billingOrganizations, onNewOrganization, onSelectOrganization } = props;
  const { organizations, page, pageCount, setPage, candidBotId } = billingOrganizations;
  return (
    <Stack gap="sm">
      <Group justify="flex-end">
        <Button variant="outline" leftSection={<IconPlus size={16} />} onClick={onNewOrganization}>
          New organization
        </Button>
      </Group>

      {organizations.length === 0 ? (
        <Card withBorder p="md">
          <Text c="dimmed" size="sm">
            No billing organizations yet. Create one to bill claims under an organization NPI.
          </Text>
        </Card>
      ) : (
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>NPI</Table.Th>
              <Table.Th>Tax ID</Table.Th>
              <Table.Th>Location</Table.Th>
              <Table.Th>Phone</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {organizations.map((organization) => {
              const npi = getIdentifier(organization, NPI_SYSTEM);
              const address = organization.address?.[0];
              // Only meaningful where the registration bot is deployed; elsewhere Candid provider
              // registration is not part of the project at all.
              const unregistered =
                !!candidBotId && !getIdentifier(organization, CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM);
              return (
                <Table.Tr
                  key={organization.id}
                  onClick={() => onSelectOrganization(organization)}
                  style={{ cursor: 'pointer' }}
                >
                  <Table.Td>
                    <Text fw={600} size="sm">
                      {organization.name ?? organization.id}
                    </Text>
                    <Group gap={6} mt={4}>
                      {!npi && (
                        <Badge color="yellow" variant="light">
                          Missing NPI — hidden from the encounter billing picker
                        </Badge>
                      )}
                      {unregistered && (
                        <Badge color="yellow" variant="light">
                          Not registered with Candid — save again to retry
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>{npi}</Table.Td>
                  <Table.Td>{getIdentifier(organization, EIN_SYSTEM)}</Table.Td>
                  <Table.Td>{[address?.city, address?.state].filter(Boolean).join(', ')}</Table.Td>
                  <Table.Td>{organization.telecom?.find((t) => t.system === 'phone')?.value}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}

      {pageCount > 1 && (
        <Group justify="center">
          <Pagination value={page} total={pageCount} onChange={setPage} />
        </Group>
      )}

      <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
        {candidBotId
          ? 'Saving an organization here also registers it with Candid as an organization provider. Its payer contracts are still set up offline in the Candid portal.'
          : 'Candid requires the NPI and Tax ID entered here to match a provider registered in Candid with a payer contract, set up offline in the Candid portal.'}
      </Alert>
    </Stack>
  );
}
