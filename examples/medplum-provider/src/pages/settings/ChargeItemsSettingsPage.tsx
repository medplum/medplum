// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, Table, Text } from '@mantine/core';
import { formatDateTime } from '@medplum/core';
import { MedplumLink, OperationOutcomeAlert } from '@medplum/react';
import { useSearchResources } from '@medplum/react-hooks';
import { IconPlus, IconReceipt2 } from '@tabler/icons-react';
import type { JSX } from 'react';
import { SettingsNote, SettingsPage, SettingsSection } from '../../components/settings/SettingsLayout';

const STATUS_COLORS: Record<string, string> = {
  active: 'green',
  draft: 'yellow',
  retired: 'gray',
};

export function ChargeItemsSettingsPage(): JSX.Element {
  const [definitions, loading, outcome] = useSearchResources('ChargeItemDefinition', {
    _sort: 'title',
    _count: '100',
  });

  return (
    <SettingsPage
      title="Charge Items"
      description="The fee schedule used to price charge items when you code an encounter."
    >
      <SettingsSection
        title="Charge item definitions"
        description="Each definition maps billing codes to prices."
        icon={<IconReceipt2 size={22} />}
        actions={
          <Button size="sm" leftSection={<IconPlus size={14} />} component={MedplumLink} to="/ChargeItemDefinition/new">
            New definition
          </Button>
        }
      >
        <OperationOutcomeAlert outcome={outcome} />
        {!loading && !definitions?.length && <SettingsNote>No charge item definitions yet.</SettingsNote>}
        {!!definitions?.length && (
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Title</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Rates</Table.Th>
                <Table.Th>Last updated</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {definitions.map((definition) => (
                <Table.Tr key={definition.id}>
                  <Table.Td>
                    <MedplumLink to={definition}>{definition.title ?? definition.url}</MedplumLink>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={STATUS_COLORS[definition.status] ?? 'gray'}>
                      {definition.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{definition.propertyGroup?.length ?? 0}</Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDateTime(definition.meta?.lastUpdated)}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </SettingsSection>
    </SettingsPage>
  );
}
