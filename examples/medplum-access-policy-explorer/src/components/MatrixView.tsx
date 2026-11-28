// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Group, Stack, Table, TagsInput, Text, Tooltip, UnstyledButton } from '@mantine/core';
import type { AccessPolicyInteraction } from '@medplum/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { JSX } from 'react';
import type { CellStatus, MatrixCell } from '../lib/analyze';
import { INTERACTIONS, matrixCell } from '../lib/analyze';
import type { MergedEntry } from '../lib/merge';

const CELL_STYLE: Record<CellStatus, { color: string; label: string }> = {
  all: { color: 'green', label: 'all' },
  conditional: { color: 'yellow', label: 'some' },
  denied: { color: 'gray', label: '—' },
  protected: { color: 'dark', label: 'system' },
};

export interface MatrixViewProps {
  readonly entries: readonly MergedEntry[];
  readonly resourceTypes: readonly string[];
  readonly extraTypes: string[];
  readonly onExtraTypesChange: (types: string[]) => void;
  readonly onSelect: (resourceType: string, interaction: AccessPolicyInteraction) => void;
}

export function MatrixView(props: MatrixViewProps): JSX.Element {
  const { entries, resourceTypes } = props;
  return (
    <Stack>
      <Text size="sm">
        <Badge color="green" size="sm">
          all
        </Badge>{' '}
        an entry without criteria grants it;{' '}
        <Badge color="yellow" size="sm">
          some
        </Badge>{' '}
        only entries with criteria grant it; <IconAlertTriangle size={14} color="orange" /> matching entries disagree on
        field rules, so which fields are hidden or read-only depends on the resource. Click a cell for details.
      </Text>
      <TagsInput
        label="Also show resource types"
        description="Types not named in any entry are only reachable through wildcard entries"
        placeholder="e.g. Patient"
        value={props.extraTypes}
        onChange={props.onExtraTypesChange}
      />
      <Table.ScrollContainer minWidth={700}>
        <Table withTableBorder withColumnBorders verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Resource type</Table.Th>
              {INTERACTIONS.map((i) => (
                <Table.Th key={i} ta="center">
                  {i}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {resourceTypes.map((type) => (
              <Table.Tr key={type}>
                <Table.Td>
                  <Text size="sm" fw={500} fs={type.startsWith('(') ? 'italic' : undefined}>
                    {type}
                  </Text>
                </Table.Td>
                {INTERACTIONS.map((interaction) => (
                  <Table.Td key={interaction} ta="center">
                    <Cell
                      cell={matrixCell(entries, type, interaction)}
                      onClick={() => props.onSelect(type, interaction)}
                    />
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  );
}

function Cell({ cell, onClick }: { readonly cell: MatrixCell; readonly onClick: () => void }): JSX.Element {
  const style = CELL_STYLE[cell.status];
  let tooltip = 'No entry grants this';
  if (cell.status === 'protected') {
    tooltip = 'Only the system account can access this type';
  } else if (cell.candidates.length) {
    tooltip = `Matching entries: ${cell.candidates.map((c) => `#${c.index + 1}`).join(', ')}`;
  }
  return (
    <Tooltip label={tooltip} withArrow>
      <UnstyledButton onClick={onClick} aria-label={`${style.label}: ${tooltip}`}>
        <Group gap={2} justify="center" wrap="nowrap">
          <Badge color={style.color} variant={cell.status === 'denied' ? 'outline' : 'light'} size="sm">
            {style.label}
          </Badge>
          {cell.fieldRulesVary && <IconAlertTriangle size={14} color="orange" />}
        </Group>
      </UnstyledButton>
    </Tooltip>
  );
}
