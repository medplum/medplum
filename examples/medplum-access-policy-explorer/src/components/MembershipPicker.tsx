// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Select, Text } from '@mantine/core';
import type { ComboboxItem, ComboboxItemGroup } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import type { ProjectMembership } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';

const MAX_MEMBERSHIPS = 1000;

export interface MembershipPickerProps {
  readonly onSelect: (membership: ProjectMembership) => void;
}

export function MembershipPicker({ onSelect }: MembershipPickerProps): JSX.Element {
  const medplum = useMedplum();
  const [memberships, setMemberships] = useState<ProjectMembership[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    medplum
      .searchResources('ProjectMembership', { _count: String(MAX_MEMBERSHIPS) })
      .then((result) => setMemberships([...result]))
      .catch((err) => setError(normalizeErrorString(err)));
  }, [medplum]);

  const data = useMemo(() => groupMemberships(memberships ?? []), [memberships]);
  const byId = useMemo(() => new Map((memberships ?? []).map((m) => [m.id as string, m])), [memberships]);

  return (
    <Select
      label="Load from a project membership"
      placeholder={memberships ? `Search ${memberships.length} memberships` : 'Loading memberships…'}
      description={
        memberships?.length === MAX_MEMBERSHIPS ? `Showing the first ${MAX_MEMBERSHIPS} memberships` : undefined
      }
      error={error}
      data={data}
      value={null}
      searchable
      clearable
      limit={200}
      nothingFoundMessage="No matching memberships"
      disabled={!memberships}
      onChange={(id) => {
        const membership = id ? byId.get(id) : undefined;
        if (membership) {
          onSelect(membership);
        }
      }}
      renderOption={({ option }) => {
        const membership = byId.get(option.value);
        return (
          <div>
            <Text size="sm">{option.label}</Text>
            <Text size="xs" c="dimmed">
              {membership ? describeMembership(membership) : ''}
            </Text>
          </div>
        );
      }}
    />
  );
}

function groupMemberships(memberships: ProjectMembership[]): ComboboxItemGroup<ComboboxItem>[] {
  const groups = new Map<string, ComboboxItem[]>();
  for (const membership of memberships) {
    const group = membership.profile?.reference?.split('/')[0] ?? 'No profile';
    const items = groups.get(group) ?? [];
    items.push({ value: membership.id as string, label: membershipLabel(membership) });
    groups.set(group, items);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, items]) => ({ group, items: items.sort((a, b) => a.label.localeCompare(b.label)) }));
}

function membershipLabel(membership: ProjectMembership): string {
  // Labels double as search text, so include the reference to keep duplicates distinct and searchable.
  const display = membership.profile?.display;
  const reference = membership.profile?.reference ?? `ProjectMembership/${membership.id}`;
  return display ? `${display} (${reference})` : reference;
}

function describeMembership(membership: ProjectMembership): string {
  const policyCount = (membership.accessPolicy ? 1 : 0) + (membership.access?.length ?? 0);
  return [
    membership.admin ? 'admin' : undefined,
    policyCount === 0 ? 'no policies (full access)' : `${policyCount} ${policyCount === 1 ? 'policy' : 'policies'}`,
    membership.userName,
  ]
    .filter(Boolean)
    .join(' · ');
}
