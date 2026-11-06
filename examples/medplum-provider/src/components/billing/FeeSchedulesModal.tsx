// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Modal, Stack, Text } from '@mantine/core';
import type { SearchRequest } from '@medplum/core';
import { formatDate, Operator } from '@medplum/core';
import type { ChargeItemDefinition, Resource } from '@medplum/fhirtypes';
import { SearchControl } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { FEE_SCHEDULE_TAG_VALUE, getFeeSchedulePayer } from './feeSchedules';

const DEFAULT_SEARCH: SearchRequest = {
  resourceType: 'ChargeItemDefinition',
  filters: [{ code: '_tag', operator: Operator.EQUALS, value: FEE_SCHEDULE_TAG_VALUE }],
  fields: ['title'],
  sortRules: [{ code: 'title' }],
  count: 20,
  offset: 0,
};

const STATUS_COLORS: Record<string, string> = { active: 'green', draft: 'blue', retired: 'gray', unknown: 'gray' };

const COLUMNS = [
  {
    name: 'Payer',
    renderCell: (resource: Resource) => getFeeSchedulePayer(resource as ChargeItemDefinition) ?? '—',
  },
  {
    name: 'Status',
    renderCell: (resource: Resource) => {
      const status = (resource as ChargeItemDefinition).status;
      return (
        <Badge color={STATUS_COLORS[status] ?? 'gray'} variant="light">
          {status}
        </Badge>
      );
    },
  },
  {
    name: 'Effective',
    renderCell: (resource: Resource) => {
      const period = (resource as ChargeItemDefinition).effectivePeriod;
      return [formatDate(period?.start), formatDate(period?.end)].filter(Boolean).join(' – ') || '—';
    },
  },
];

export interface FeeSchedulesModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
}

/**
 * The payers' fee schedules, in a modal over the billing worklist. Each is a ChargeItemDefinition tagged as a fee
 * schedule and naming its payer, so `$apply` can price a line at the payer's rate to check what it allowed.
 * @param props - The FeeSchedulesModal React props.
 * @returns The FeeSchedulesModal React node.
 */
export function FeeSchedulesModal(props: FeeSchedulesModalProps): JSX.Element {
  const { opened, onClose } = props;
  const navigate = useNavigate();
  const [search, setSearch] = useState<SearchRequest>(DEFAULT_SEARCH);

  return (
    <Modal opened={opened} onClose={onClose} title="Fee Schedules" size="xl">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          What each payer agreed to pay per code, used to check the allowed amounts on remits. What you bill is your
          chargemaster, under Settings › Charge Items.
        </Text>
        <SearchControl
          search={search}
          hideFilters
          additionalColumns={COLUMNS}
          onChange={(e) => setSearch(e.definition)}
          onClick={(e) => {
            onClose();
            navigate(`/ChargeItemDefinition/${e.resource.id}`)?.catch(console.error);
          }}
        />
      </Stack>
    </Modal>
  );
}
