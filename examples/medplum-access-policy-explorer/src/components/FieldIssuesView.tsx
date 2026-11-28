// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Card, Code, Group, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import type { FieldIssue } from '../lib/analyze';
import { EntryLabel } from './EntryLabel';

export function FieldIssuesView({ issues }: { readonly issues: readonly FieldIssue[] }): JSX.Element {
  return (
    <Stack>
      <Text size="sm">
        <code>hiddenFields</code>, <code>readonlyFields</code> and <code>writeConstraint</code> come only from the first
        entry that matches a resource. A later entry's restrictions are skipped whenever an earlier, less restrictive
        entry also matches.
      </Text>
      {issues.length === 0 && <Alert color="green">No field rules are skipped by earlier entries.</Alert>}
      {issues.map((issue) => (
        <Card
          key={`${issue.resourceType}-${issue.interaction}-${issue.restricted.index}-${issue.winner.index}`}
          withBorder
          padding="sm"
        >
          <Group gap="xs" mb="xs">
            <Badge color={issue.severity === 'bypassed' ? 'red' : 'orange'}>
              {issue.severity === 'bypassed' ? 'always skipped' : 'skipped for some resources'}
            </Badge>
            <Text fw={600} size="sm">
              {issue.resourceType} · {issue.interaction}
            </Text>
          </Group>
          <Stack gap={6}>
            <Group gap={6}>
              <Text size="sm">Rules from</Text>
              <EntryLabel entry={issue.restricted} />
            </Group>
            <Group gap={6}>
              <Text size="sm">are skipped because</Text>
              <EntryLabel entry={issue.winner} />
              <Text size="sm">
                matches first
                {issue.severity === 'maybe-bypassed' && (
                  <>
                    {' '}
                    for resources matching{' '}
                    <Code>{issue.winner.entry.criteria ?? issue.winner.entry.compartment?.reference}</Code>
                  </>
                )}
                .
              </Text>
            </Group>
            <Lost label="Visible" values={issue.lostHiddenFields} />
            <Lost label="Writable" values={issue.lostReadonlyFields} />
            <Lost label="Unenforced constraint" values={issue.lostWriteConstraints} />
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}

function Lost({ label, values }: { readonly label: string; readonly values: string[] }): JSX.Element | null {
  if (values.length === 0) {
    return null;
  }
  return (
    <Group gap={4}>
      <Text size="sm" fw={500}>
        {label}:
      </Text>
      {values.map((v) => (
        <Code key={v}>{v}</Code>
      ))}
    </Group>
  );
}
