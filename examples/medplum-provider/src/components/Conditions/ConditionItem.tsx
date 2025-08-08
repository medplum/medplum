// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Condition } from '@medplum/fhirtypes';
import { ActionIcon, Select, Group, Flex, Text } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { JSX } from 'react';

interface ConditionItemProps {
  condition: Condition;
  rank: number;
  total: number;
  onChange?: (condition: Condition, value: string) => void;
  onRemove?: (condition: Condition) => void;
}

export default function ConditionItem(props: ConditionItemProps): JSX.Element {
  const { condition, rank, total, onChange, onRemove } = props;

  return (
    <Flex justify="space-between">
      <Group>
        <Group>
          <Select
            w={80}
            value={rank.toString()}
            data={Array.from({ length: total }, (_, i) => (i + 1).toString())}
            onChange={(value) => {
              if (value) {
                onChange?.(condition, value);
              }
            }}
          />
          <Text>{condition?.code?.coding?.[0]?.display || ''}</Text>
        </Group>
      </Group>
      <ActionIcon
        variant="subtle"
        color="gray"
        onClick={() => {
          onRemove?.(condition);
        }}
      >
        <IconX size={16} />
      </ActionIcon>
    </Flex>
  );
}
