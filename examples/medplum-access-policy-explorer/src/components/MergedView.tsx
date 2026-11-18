// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Code, CopyButton, Group, SegmentedControl, Stack, Table, Text } from '@mantine/core';
import type { AccessPolicy } from '@medplum/fhirtypes';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import type { DeadEntry } from '../lib/analyze';
import type { MergeResult } from '../lib/merge';
import { EntryLabel, EntryRules } from './EntryLabel';

export function MergedView({
  merged,
  dead,
}: {
  readonly merged: MergeResult;
  readonly dead: readonly DeadEntry[];
}): JSX.Element {
  const [view, setView] = useState('table');
  const json = useMemo(() => {
    // The single policy the server ends up enforcing, after substitution, defaults and admin rules.
    const effective: AccessPolicy = {
      resourceType: 'AccessPolicy',
      ...(merged.compartment ? { compartment: merged.compartment } : {}),
      resource: merged.entries.map((e) => e.entry),
    };
    return JSON.stringify(effective, null, 2);
  }, [merged]);
  const deadByIndex = new Map(dead.map((d) => [d.entry.index, d]));
  return (
    <Stack>
      <Text size="sm">
        The server concatenates every policy's <code>resource</code> entries in membership order, then appends its own
        rules. For any resource and interaction, the <b>first</b> matching entry decides access and field rules.
      </Text>
      {merged.compartment?.reference && (
        <Text size="sm">
          Effective compartment for new resources: <code>{merged.compartment.reference}</code>
        </Text>
      )}
      {merged.warnings.map((w, i) => (
        // Messages repeat when the same policy is added twice
        <Alert key={i} color="orange">
          {w.message}
        </Alert>
      ))}
      <Group justify="space-between">
        <SegmentedControl
          size="xs"
          value={view}
          onChange={setView}
          data={[
            { label: 'Table', value: 'table' },
            { label: 'JSON', value: 'json' },
          ]}
        />
        {view === 'json' && (
          <CopyButton value={json}>
            {({ copied, copy }) => (
              <Button
                size="compact-xs"
                variant="subtle"
                leftSection={copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                onClick={copy}
              >
                {copied ? 'Copied' : 'Copy JSON'}
              </Button>
            )}
          </CopyButton>
        )}
      </Group>
      {view === 'json' ? (
        <Code block style={{ fontSize: 12, maxHeight: '70vh', overflow: 'auto' }}>
          {json}
        </Code>
      ) : (
        <Table striped withTableBorder verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Entry</Table.Th>
              <Table.Th>Rules</Table.Th>
              <Table.Th>Notes</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {merged.entries.map((e) => {
              const deadEntry = deadByIndex.get(e.index);
              return (
                <Table.Tr key={e.index} style={deadEntry ? { opacity: 0.6 } : undefined}>
                  <Table.Td>
                    <EntryLabel entry={e} />
                  </Table.Td>
                  <Table.Td>
                    <EntryRules entry={e.entry} />
                  </Table.Td>
                  <Table.Td>
                    {deadEntry && (
                      <Stack gap={2}>
                        <Badge color="gray" size="sm">
                          never used
                        </Badge>
                        <Text size="xs" c="dimmed">
                          Earlier unconditional entr
                          {new Set(Object.values(deadEntry.shadowedBy).map((s) => s.index)).size > 1 ? 'ies' : 'y'}{' '}
                          {[...new Set(Object.values(deadEntry.shadowedBy).map((s) => `#${s.index + 1}`))].join(', ')}{' '}
                          always match first.
                        </Text>
                      </Stack>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
