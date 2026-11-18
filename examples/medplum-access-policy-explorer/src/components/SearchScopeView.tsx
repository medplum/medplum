// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Card, Code, Group, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import type { SearchScope } from '../lib/analyze';
import { searchScope } from '../lib/analyze';
import type { MergedEntry } from '../lib/merge';
import { EntryLabel } from './EntryLabel';

export function SearchScopeView({
  entries,
  resourceTypes,
}: {
  readonly entries: readonly MergedEntry[];
  readonly resourceTypes: readonly string[];
}): JSX.Element {
  return (
    <Stack>
      <Text size="sm">
        Every entry that allows <code>search</code> on a type adds its criteria to the search filter, joined with OR.
        One entry without criteria removes the filter entirely, whatever the other entries say. Field rules on each
        result still come from the first entry that matches that resource.
      </Text>
      {resourceTypes.map((type) => {
        const scope = searchScope(entries, type);
        return (
          <Card key={type} withBorder padding="sm">
            <Group gap="xs" mb="xs">
              <Text fw={600}>{type}</Text>
              <ScopeBadge scope={scope} />
            </Group>
            <Stack gap={6}>
              {scope.invalid.map((e) => (
                <Alert key={e.index} color="red" p="xs">
                  <Group gap={6}>
                    <EntryLabel entry={e} />
                    <Text size="sm">
                      has criteria <Code>{e.entry.criteria}</Code> that does not start with{' '}
                      <Code>{e.entry.resourceType}?</Code>; the server rejects the search instead of ignoring it.
                    </Text>
                  </Group>
                </Alert>
              ))}
              {scope.unrestrictedBy && (
                <Group gap={6}>
                  <Text size="sm">No filter, because of</Text>
                  <EntryLabel entry={scope.unrestrictedBy} />
                  {scope.clauses.length > 0 && (
                    <Text size="sm" c="dimmed">
                      ({scope.clauses.length} other clause{scope.clauses.length === 1 ? '' : 's'} have no effect)
                    </Text>
                  )}
                </Group>
              )}
              {!scope.unrestrictedBy &&
                scope.clauses.map((clause, i) => (
                  <Group key={clause.entry.index} gap={6} wrap="nowrap">
                    <Text size="sm" c="dimmed" w={24}>
                      {i === 0 ? '' : 'OR'}
                    </Text>
                    <Code>{clause.criteria ?? `compartment = ${clause.compartment}`}</Code>
                    <EntryLabel entry={clause.entry} />
                  </Group>
                ))}
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}

function ScopeBadge({ scope }: { readonly scope: SearchScope }): JSX.Element {
  if (scope.invalid.length > 0) {
    return <Badge color="red">every search fails (403)</Badge>;
  }
  if (scope.denied) {
    return <Badge color="gray">no results</Badge>;
  }
  if (scope.unrestrictedBy) {
    return <Badge color="green">unrestricted</Badge>;
  }
  const n = scope.clauses.length;
  return <Badge color="yellow">{`${n} OR'd clause${n === 1 ? '' : 's'}`}</Badge>;
}
