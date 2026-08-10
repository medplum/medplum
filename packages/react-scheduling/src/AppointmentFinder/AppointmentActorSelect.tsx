// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, CloseButton, Combobox, Group, Input, Paper, Stack, Text, useCombobox } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import type { ActorRequirement, ScheduleCandidateGroup } from './AppointmentFinder.schedules';
import { candidateMatchesQuery, getRequirementLabel } from './AppointmentFinder.schedules';

export interface AppointmentActorSelectProps {
  /** The role being filled, and the actors that can fill it. */
  readonly group: ScheduleCandidateGroup;
  /** The actors this role needs, one requirement each, all of which attend. */
  readonly value: readonly ActorRequirement[];
  readonly onChange: (requirements: ActorRequirement[]) => void;
  readonly error?: string;
  readonly disabled?: boolean;
}

/**
 * Chooses the actors an appointment is held on for one role.
 *
 * Every requirement is listed on a line of its own, by name.
 *
 * Adding an actor adds a requirement, so everything chosen attends: `$find`
 * intersects their schedules, and adding somebody narrows the times offered to
 * the ones they are also free for.
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
  // Requirements nothing on offer can fill are left out rather than shown as a
  // blank line, which is what `getSelectedCandidates` does with the same ids.
  const selected = value
    .map((requirement) => ({ requirement, label: getRequirementLabel(group, requirement) }))
    .filter((line) => line.label);
  const taken = new Set(value.flatMap((requirement) => requirement.scheduleIds));
  const options = group.candidates.filter(
    (candidate) => !taken.has(candidate.schedule.id) && candidateMatchesQuery(candidate, query)
  );

  function add(scheduleId: string): void {
    onChange([...value, { scheduleIds: [scheduleId] }]);
    combobox.closeDropdown();
  }

  function remove(requirement: ActorRequirement): void {
    onChange(value.filter((entry) => entry !== requirement));
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
        {selected.map((line) => (
          <Paper key={line.requirement.scheduleIds.join('+')} withBorder radius="sm" px="sm" py={6}>
            <Group gap="sm" wrap="nowrap">
              <Text size="sm" style={{ flex: 1, minWidth: 0 }}>
                {line.label}
              </Text>
              <CloseButton
                size="sm"
                disabled={disabled}
                aria-label={`Remove ${line.label}`}
                onClick={() => remove(line.requirement)}
              />
            </Group>
          </Paper>
        ))}

        {selected.length === 0 && !group.required && (
          <Text size="sm" c="dimmed">
            No {label} held
          </Text>
        )}

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
