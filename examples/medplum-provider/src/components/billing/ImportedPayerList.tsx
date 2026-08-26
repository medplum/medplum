// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Card, Group, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { formatPayerCategory, getPayerCategory, getPayerId } from '../../utils/billing';

export interface ImportedPayerListProps {
  readonly payers: WithId<Organization>[];
  /** Called when a payer card is tapped to view details. */
  readonly onSelectPayer: (payer: WithId<Organization>) => void;
}

export function ImportedPayerList(props: ImportedPayerListProps): JSX.Element {
  const { payers, onSelectPayer } = props;
  return (
    <Stack gap="sm">
      <Text fw={600} size="lg" mt="xs">
        Imported payers
      </Text>
      {payers.length === 0 ? (
        <Card withBorder p="md">
          <Text c="dimmed" size="sm">
            No payers imported yet. Search the payer directory to import the payers you bill.
          </Text>
        </Card>
      ) : (
        payers.map((payer) => <PayerCard key={payer.id} payer={payer} onClick={() => onSelectPayer(payer)} />)
      )}
    </Stack>
  );
}

function PayerCard(props: { payer: WithId<Organization>; onClick: () => void }): JSX.Element {
  const { payer, onClick } = props;
  const payerId = getPayerId(payer);
  const category = getPayerCategory(payer);
  return (
    <Card
      withBorder
      p="md"
      component="button"
      type="button"
      onClick={onClick}
      style={{ cursor: 'pointer', textAlign: 'left', width: '100%' }}
      aria-label={`View ${payer.name ?? payer.id}`}
    >
      <Group justify="space-between">
        <Group gap="sm">
          <Text fw={600}>{payer.name ?? payer.id}</Text>
          {category && (
            <Badge color="blue" variant="light">
              {formatPayerCategory(category)}
            </Badge>
          )}
          {payer.active === false && (
            <Badge color="gray" variant="light">
              Inactive — not in payer directory
            </Badge>
          )}
        </Group>
        {payerId && (
          <Text size="sm" c="dimmed">
            Payer ID {payerId}
          </Text>
        )}
      </Group>
    </Card>
  );
}
