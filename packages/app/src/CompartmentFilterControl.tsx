// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Pill, Popover, Stack, Text } from '@mantine/core';
import { ReferenceInput, useMedplum } from '@medplum/react';
import { IconFilter, IconFilterFilled } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { getCompartmentFilters, setCompartmentFilters } from './compartmentFilter';

/**
 * Header control that sets one or more compartment filters applied to all FHIR searches.
 *
 * Selected compartments are combined with OR semantics: a single `_compartment=A,B` default
 * search param is set on the MedplumClient (see `compartmentFilter.ts`), scoping subsequent
 * list/search queries to resources in ANY of the selected compartments. This is a client-side
 * convenience only: the server still enforces the user's access policy, so it can only narrow
 * results within what the user may already read.
 *
 * The popover lets the user build up the list without side effects; "Apply" commits the change
 * and reloads the page so every query surface picks it up, matching the project switcher.
 * @returns The compartment filter control element.
 */
export function CompartmentFilterControl(): JSX.Element {
  const medplum = useMedplum();
  const [opened, setOpened] = useState(false);
  const active = getCompartmentFilters();

  // Draft list edited within the popover; only committed on "Apply".
  const [pending, setPending] = useState<string[]>(active);
  // Bump to remount the ReferenceInput (clearing it) after each add.
  const [inputKey, setInputKey] = useState(0);

  function addReference(reference: string | undefined): void {
    if (reference && !pending.includes(reference)) {
      setPending([...pending, reference]);
    }
    setInputKey((k) => k + 1);
  }

  function removeReference(reference: string): void {
    setPending(pending.filter((r) => r !== reference));
  }

  function apply(references: string[]): void {
    setCompartmentFilters(medplum, references);
    window.location.reload();
  }

  const dirty = pending.length !== active.length || pending.some((r, i) => r !== active[i]);

  let label = 'Compartment';
  if (active.length === 1) {
    label = active[0];
  } else if (active.length > 1) {
    label = `${active.length} compartments`;
  }

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" width={380} withArrow shadow="md">
      <Popover.Target>
        <Button
          variant={active.length ? 'light' : 'subtle'}
          color={active.length ? 'blue' : 'gray'}
          size="compact-sm"
          leftSection={active.length ? <IconFilterFilled size={16} /> : <IconFilter size={16} />}
          onClick={() => setOpened((o) => !o)}
          title="Filter all queries to one or more compartments"
        >
          {label}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <Text size="sm" fw={500}>
            Compartment filter
          </Text>
          <Text size="xs" c="dimmed">
            Scope all searches to one or more compartments (matches any). Pick any resource; the server still enforces
            your access policy.
          </Text>
          {pending.length > 0 && (
            <Pill.Group>
              {pending.map((reference) => (
                <Pill key={reference} withRemoveButton onRemove={() => removeReference(reference)}>
                  {reference}
                </Pill>
              ))}
            </Pill.Group>
          )}
          <ReferenceInput
            key={inputKey}
            name="compartment-filter"
            placeholder="Add a resource"
            onChange={(value) => addReference(value?.reference)}
          />
          <Group justify="space-between">
            <Button
              variant="subtle"
              size="compact-sm"
              color="gray"
              disabled={pending.length === 0}
              onClick={() => setPending([])}
            >
              Clear all
            </Button>
            <Button size="compact-sm" disabled={!dirty} onClick={() => apply(pending)}>
              Apply
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
