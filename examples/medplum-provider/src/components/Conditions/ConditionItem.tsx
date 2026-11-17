// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Flex, Select, Stack, Text } from '@mantine/core';
import type { Condition } from '@medplum/fhirtypes';
import { IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { ConditionStatusBadge } from './ConditionStatusBadge';

interface ConditionItemProps {
  condition: Condition;
  rank: number;
  total: number;
  onChange?: (condition: Condition, value: string) => void;
  onRemove?: (condition: Condition) => void;
}

export default function ConditionItem(props: ConditionItemProps): JSX.Element {
  const { condition, rank, total, onChange, onRemove } = props;
  const coding = condition.code?.coding?.[0];
  const note = condition.note?.[0]?.text;

  return (
    <Flex align="center" gap="md" px="md" py="sm">
      <Text size="sm" fw={600} w={80}>
        {coding?.code ?? ''}
      </Text>
      <Stack gap={2} flex={1} miw={0}>
        <Text size="sm">{coding?.display ?? ''}</Text>
        {note && (
          <Text size="xs" c="dimmed">
            {note}
          </Text>
        )}
      </Stack>
      <ConditionStatusBadge clinicalStatus={condition.clinicalStatus} />
      <Select
        w={70}
        size="xs"
        aria-label="Rank"
        value={rank.toString()}
        data={Array.from({ length: total }, (_, i) => (i + 1).toString())}
        onChange={(value) => {
          if (value) {
            onChange?.(condition, value);
          }
        }}
      />
      <ActionIcon
        variant="subtle"
        color="gray"
        aria-label="Remove diagnosis"
        onClick={() => {
          onRemove?.(condition);
        }}
      >
        <IconX size={16} />
      </ActionIcon>
    </Flex>
  );
}
