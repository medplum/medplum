// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Card, Group, Pagination, Stack, Table, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getIdentifier } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useState } from 'react';
import { formatPayerCategory, getPayerCategory } from '../../utils/billing';
import { CHC_PAYER_ID_SYSTEM, CMS_PAYER_ID_SYSTEM } from '../../utils/candid';

const PAGE_SIZE = 10;

export interface ImportedPayerListProps {
  readonly payers: WithId<Organization>[];
  readonly onSelectPayer: (payer: WithId<Organization>) => void;
}

export function ImportedPayerList(props: ImportedPayerListProps): JSX.Element {
  const { payers, onSelectPayer } = props;
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(payers.length / PAGE_SIZE);
  // Clamp rather than reset so a refetch (e.g. after import or refresh) keeps the current page.
  const currentPage = Math.min(page, Math.max(totalPages, 1));
  const visiblePayers = payers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  return (
    <Stack gap="sm">
      {payers.length === 0 ? (
        <Card withBorder p="md">
          <Text c="dimmed" size="sm">
            No payers imported yet. Search the payer directory to import the payers you bill.
          </Text>
        </Card>
      ) : (
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Payer ID</Table.Th>
              <Table.Th>Category</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visiblePayers.map((payer) => {
              const category = getPayerCategory(payer);
              return (
                <Table.Tr key={payer.id} onClick={() => onSelectPayer(payer)} style={{ cursor: 'pointer' }}>
                  <Table.Td>
                    <Text fw={600} size="sm">
                      {payer.name ?? payer.id}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {getIdentifier(payer, CHC_PAYER_ID_SYSTEM) ?? getIdentifier(payer, CMS_PAYER_ID_SYSTEM)}
                  </Table.Td>
                  <Table.Td>{category && formatPayerCategory(category)}</Table.Td>
                  <Table.Td>
                    {payer.active === false && (
                      <Badge color="gray" variant="light">
                        Inactive — not in payer directory
                      </Badge>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}
      {totalPages > 1 && (
        <Group justify="center">
          <Pagination value={currentPage} total={totalPages} onChange={setPage} />
        </Group>
      )}
    </Stack>
  );
}
