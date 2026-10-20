// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SimpleGrid, Text, UnstyledButton } from '@mantine/core';
import { formatMoney } from '@medplum/core';
import type { JSX } from 'react';
import { AGING_BUCKETS } from './claimQueues';
import classes from './ClaimsAgingSummary.module.css';
import type { AgingTotal } from './useClaimsAging';

export interface ClaimsAgingSummaryProps {
  readonly totals: AgingTotal[] | undefined;
  /** The ID of the selected bucket, if any. */
  readonly selected?: string;
  readonly onSelect: (bucketId: string | undefined) => void;
}

/**
 * The aging buckets as cards. Clicking a bucket selects it, and clicking it again clears the selection.
 * @param props - The ClaimsAgingSummary React props.
 * @returns The ClaimsAgingSummary React node.
 */
export function ClaimsAgingSummary(props: ClaimsAgingSummaryProps): JSX.Element {
  const { totals, selected, onSelect } = props;
  return (
    <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
      {AGING_BUCKETS.map((bucket, i) => (
        <UnstyledButton
          key={bucket.id}
          className={classes.bucket}
          aria-pressed={selected === bucket.id}
          data-active={selected === bucket.id || undefined}
          onClick={() => onSelect(selected === bucket.id ? undefined : bucket.id)}
        >
          <Text size="sm">{bucket.label}</Text>
          <Text size="xl" fw={800}>
            {totals ? formatMoney({ value: totals[i].amount, currency: 'USD' }) : '–'}
          </Text>
          <Text size="xs" c="dimmed">
            {totals ? `${totals[i].count} ${totals[i].count === 1 ? 'Claim' : 'Claims'}` : ' '}
          </Text>
        </UnstyledButton>
      ))}
    </SimpleGrid>
  );
}
