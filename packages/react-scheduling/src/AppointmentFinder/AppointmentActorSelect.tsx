// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, CloseButton, Combobox, Group, Input, Paper, Stack, Text, useCombobox } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import type { ScheduleCandidateGroup } from './AppointmentFinder.utils';
import { candidateMatchesQuery, getSelectedCandidates } from './AppointmentFinder.utils';

export interface AppointmentActorSelectProps {
  /** The role being filled, and the actors that can fill it. */
  readonly group: ScheduleCandidateGroup;
  /** Chosen schedule ids, which all attend. */
  readonly value: readonly string[];
  readonly onChange: (scheduleIds: string[]) => void;
  readonly error?: string;
  readonly disabled?: boolean;
}

/**
 * Chooses the actors an appointment is held on for one role.
 *
 * Everyone chosen is listed on a line of their own, by name.
 *
 * Everything chosen attends. `$find` intersects their schedules, so adding
 * somebody narrows the times offered to the ones they are also free for; it
 * never offers a choice between them. Typing searches what the actors are as
 * well as what they are called, so a long list can be narrowed to the
 * anesthetists without a filter of its own.
 *
 * @param props - The React props.
 * @returns The field for one role.
 */
export function AppointmentActorSelect(props: AppointmentActorSelectProps): JSX.Element {
  const { group, value, onChange, error, disabled } = props;
  const [query, setQuery] = useState('');

  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setQuery('');
    },
    onDropdownOpen: () => combobox.focusSearchInput(),
  });

  const label = group.label.toLowerCase();
  const selected = getSelectedCandidates(group, { [group.role]: value });
  const options = group.candidates.filter(
    (candidate) => !value.includes(candidate.schedule.id) && candidateMatchesQuery(candidate, query)
  );

  function add(scheduleId: string): void {
    onChange([...value, scheduleId]);
    combobox.closeDropdown();
  }

  function remove(scheduleId: string): void {
    onChange(value.filter((id) => id !== scheduleId));
  }

  return (
    <Input.Wrapper
      label={group.label}
      labelElement="div"
      description={group.required ? undefined : `Optional. Leave empty to search without a ${label}.`}
      error={error}
      data-testid={`actor-select-${group.role}`}
    >
      <Stack gap={6} mt={6}>
        {selected.map((candidate) => (
          <Paper key={candidate.schedule.id} withBorder radius="sm" px="sm" py={6}>
            <Group gap="sm" wrap="nowrap">
              <Text size="sm" style={{ flex: 1, minWidth: 0 }}>
                {candidate.actorDisplay}
              </Text>
              <CloseButton
                size="sm"
                disabled={disabled}
                aria-label={`Remove ${candidate.actorDisplay}`}
                onClick={() => remove(candidate.schedule.id)}
              />
            </Group>
          </Paper>
        ))}

        {selected.length === 0 && !group.required && (
          <Text size="sm" c="dimmed">
            Any {label}
          </Text>
        )}

        {/* A closed list is unmounted rather than left hidden, so what is in the
            field is only ever what has been chosen. */}
        <Combobox store={combobox} withinPortal={false} keepMounted={false} onOptionSubmit={add}>
          {/* The target is a button rather than a text input, so it describes the
              list it opens itself instead of taking Mantine's combobox roles. It
              is wrapped because the list is sized against its target, and a list
              of names reads better across the field than across the button. */}
          <Combobox.Target withAriaAttributes={false}>
            <div>
              <Button
                variant="subtle"
                size="compact-sm"
                w="fit-content"
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={combobox.dropdownOpened}
                leftSection={<IconPlus size={14} stroke={1.8} />}
                onClick={() => combobox.toggleDropdown()}
              >
                Add {label}
              </Button>
            </div>
          </Combobox.Target>
          <Combobox.Dropdown>
            <Combobox.Search
              value={query}
              placeholder={`Search ${label}s`}
              aria-label={`Search ${label}s`}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                combobox.selectFirstOption();
              }}
            />
            <Combobox.Options mah={240} style={{ overflowY: 'auto' }}>
              {options.length === 0 ? (
                <Combobox.Empty>No {label} left to add</Combobox.Empty>
              ) : (
                options.map((candidate) => (
                  <Combobox.Option key={candidate.schedule.id} value={candidate.schedule.id}>
                    <Text size="sm">{candidate.actorDisplay}</Text>
                  </Combobox.Option>
                ))
              )}
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>
      </Stack>
    </Input.Wrapper>
  );
}
