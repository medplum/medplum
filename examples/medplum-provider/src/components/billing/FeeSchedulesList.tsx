// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge } from '@mantine/core';
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

/**
 * The payers' fee schedules. Each is a ChargeItemDefinition tagged as a fee schedule and naming its payer, so `$apply`
 * can price a line at the payer's rate to check what it allowed.
 * @returns The FeeSchedulesList React node.
 */
export function FeeSchedulesList(): JSX.Element {
  const navigate = useNavigate();
  const [search, setSearch] = useState<SearchRequest>(DEFAULT_SEARCH);

  return (
    <SearchControl
      search={search}
      hideFilters
      additionalColumns={COLUMNS}
      onChange={(e) => setSearch(e.definition)}
      onClick={(e) => navigate(`/ChargeItemDefinition/${e.resource.id}`)?.catch(console.error)}
    />
  );
}
