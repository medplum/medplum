// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Table, Text, Title } from '@mantine/core';
import type { ConceptMap, ConceptMapGroup, ConceptMapGroupElement } from '@medplum/fhirtypes';
import { Document } from '@medplum/react';
import type { JSX } from 'react';
import classes from './ConceptMapMappingsDisplay.module.css';

export interface ConceptMapMappingsDisplayProps {
  readonly conceptMap: ConceptMap;
}

interface MappingRow {
  sourceCode: string;
  sourceDisplay: string;
  targetCode: string;
  targetDisplay: string;
  equivalence: string;
  comment: string;
  isFirstTargetForSource: boolean;
  sourceRowSpan: number;
}

function buildRows(element: ConceptMapGroupElement): MappingRow[] {
  const sourceCode = element.code ?? '';
  const sourceDisplay = element.display ?? '';

  if (!element.target || element.target.length === 0) {
    return [
      {
        sourceCode,
        sourceDisplay,
        targetCode: '—',
        targetDisplay: '—',
        equivalence: '—',
        comment: '',
        isFirstTargetForSource: true,
        sourceRowSpan: 1,
      },
    ];
  }

  return element.target.map((target, index) => ({
    sourceCode,
    sourceDisplay,
    targetCode: target.code ?? '—',
    targetDisplay: target.display ?? '—',
    equivalence: target.equivalence ?? '—',
    comment: target.comment ?? '',
    isFirstTargetForSource: index === 0,
    sourceRowSpan: element.target?.length ?? 1,
  }));
}

interface GroupSectionProps {
  readonly group: ConceptMapGroup;
  readonly groupIndex: number;
}

function GroupSection({ group, groupIndex }: GroupSectionProps): JSX.Element {
  const rows = group.element.flatMap((element) => buildRows(element));

  const sourceLabel = group.source
    ? `${group.source}${group.sourceVersion ? ` (v${group.sourceVersion})` : ''}`
    : '(unspecified source)';

  const targetLabel = group.target
    ? `${group.target}${group.targetVersion ? ` (v${group.targetVersion})` : ''}`
    : '(unspecified target)';

  const unmapped = group.unmapped;

  return (
    <Stack gap="xs">
      <Title order={4}>Group {groupIndex + 1}</Title>
      <Text size="sm">
        <span className={classes.systemUri}>{sourceLabel}</span>
        <Text component="span" size="sm" c="dimmed" mx="xs">
          →
        </Text>
        <span className={classes.systemUri}>{targetLabel}</span>
      </Text>

      <Table className={classes.mappingTable}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Source Code</Table.Th>
            <Table.Th>Source Display</Table.Th>
            <Table.Th>Equivalence</Table.Th>
            <Table.Th>Target Code</Table.Th>
            <Table.Th>Target Display</Table.Th>
            <Table.Th>Comment</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row, rowIndex) => (
            <Table.Tr key={rowIndex}>
              {row.isFirstTargetForSource && (
                <>
                  <Table.Td rowSpan={row.sourceRowSpan} className={classes.sourceCell}>
                    <Text size="sm" ff="monospace">
                      {row.sourceCode || '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td rowSpan={row.sourceRowSpan} className={classes.sourceCell}>
                    <Text size="sm">{row.sourceDisplay || '—'}</Text>
                  </Table.Td>
                </>
              )}
              <Table.Td>
                <Text size="sm">{row.equivalence}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" ff="monospace">
                  {row.targetCode}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{row.targetDisplay}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" c="dimmed">
                  {row.comment}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      {unmapped && (
        <Text size="sm" c="dimmed" className={classes.unmappedNote}>
          <Text component="span" fw={600}>
            Unmapped:{' '}
          </Text>
          mode={unmapped.mode}
          {unmapped.code && `, code=${unmapped.code}`}
          {unmapped.display && ` (${unmapped.display})`}
          {unmapped.url && `, fallback map=${unmapped.url}`}
        </Text>
      )}
    </Stack>
  );
}

/**
 * Displays the mapping groups of a ConceptMap resource as a 2D table.
 * Each group (same source+target system pair) is rendered as a separate section
 * with a header showing the system URIs and a table of source→target concept mappings.
 *
 * @param props - Component props
 * @param props.conceptMap - The ConceptMap resource to display
 * @returns JSX element displaying the grouped mappings
 */
export function ConceptMapMappingsDisplay({ conceptMap }: ConceptMapMappingsDisplayProps): JSX.Element {
  const groups = conceptMap.group ?? [];

  if (groups.length === 0) {
    return (
      <Document>
        <Text c="dimmed">No mappings defined in this ConceptMap.</Text>
      </Document>
    );
  }

  return (
    <Document>
      <Stack gap="xl">
        {groups.map((group, index) => (
          <GroupSection key={index} group={group} groupIndex={index} />
        ))}
      </Stack>
    </Document>
  );
}
