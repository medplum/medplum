// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Code, Group, Stack, Text } from '@mantine/core';
import type { AccessPolicyResource } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { describeInteractions } from '../lib/analyze';
import type { EntrySourceKind, MergedEntry } from '../lib/merge';

const SOURCE_COLORS: Record<EntrySourceKind, string> = {
  policy: 'blue',
  legacy: 'red',
  default: 'gray',
  admin: 'grape',
  'bot-system': 'orange',
};

const SOURCE_NAMES: Record<EntrySourceKind, string> = {
  policy: 'policy',
  legacy: 'legacy',
  default: 'server default',
  admin: 'admin rule',
  'bot-system': 'Bot.system rule',
};

/**
 * Short label for a merged entry: its position, where it came from, and its resource type.
 * @param props - The component props.
 * @param props.entry - The merged entry.
 * @returns The label.
 */
export function EntryLabel({ entry }: { readonly entry: MergedEntry }): JSX.Element {
  const { source } = entry;
  return (
    <Group gap={6} wrap="nowrap">
      <Badge variant="filled" color="dark" size="sm">
        #{entry.index + 1}
      </Badge>
      <Badge variant="light" color={SOURCE_COLORS[source.kind]} size="sm">
        {SOURCE_NAMES[source.kind]}
      </Badge>
      <Text size="sm" fw={500}>
        {source.label}
        {source.entryIndex !== undefined && (
          <Text span size="xs" c="dimmed">
            {' '}
            [resource {source.entryIndex}]
          </Text>
        )}
      </Text>
    </Group>
  );
}

export function EntryRules({ entry }: { readonly entry: AccessPolicyResource }): JSX.Element {
  return (
    <Stack gap={2}>
      <Text size="xs">
        <b>{entry.resourceType}</b> · {describeInteractions(entry)}
      </Text>
      {entry.criteria && <Code>{entry.criteria}</Code>}
      {entry.compartment?.reference && <Code>compartment: {entry.compartment.reference}</Code>}
      <FieldList label="hidden" values={entry.hiddenFields} color="red" />
      <FieldList label="readonly" values={entry.readonlyFields} color="yellow" />
      <FieldList label="constraint" values={entry.writeConstraint?.map((c) => c.expression ?? '')} color="violet" />
    </Stack>
  );
}

function FieldList({
  label,
  values,
  color,
}: {
  readonly label: string;
  readonly values: string[] | undefined;
  readonly color: string;
}): JSX.Element | null {
  if (!values?.length) {
    return null;
  }
  return (
    <Group gap={4}>
      <Text size="xs" c="dimmed">
        {label}:
      </Text>
      {values.map((v) => (
        <Badge key={v} size="xs" variant="outline" color={color} style={{ textTransform: 'none' }}>
          {v}
        </Badge>
      ))}
    </Group>
  );
}
