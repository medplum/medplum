// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Button, Group, Input, MultiSelect, Stack, Text } from '@mantine/core';
import { IconMinus, IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Fragment } from 'react';
import classes from './AppointmentFinder.module.css';
import type { ActorRequirement, ScheduleCandidateGroup } from './AppointmentFinder.schedules';
import { getCandidateDisplay, getRequirementLabel, getSelectedCandidates } from './AppointmentFinder.schedules';

/**
 * A row that has been added but not filled.
 *
 * Nothing on offer can fill it, so `resolveRequirements` drops it and the search
 * behaves as though the row were not there.
 */
const EMPTY_REQUIREMENT: ActorRequirement = { scheduleIds: [] };

export interface AppointmentActorSelectProps {
  /** The role being filled, and the actors that can fill it. */
  readonly group: ScheduleCandidateGroup;
  /** The actors this role needs, one requirement per row, all of which attend. */
  readonly value: readonly ActorRequirement[];
  readonly onChange: (requirements: ActorRequirement[]) => void;
  readonly error?: string;
  readonly disabled?: boolean;
}

/**
 * Chooses the actors an appointment is held on for one role.
 *
 * Every requirement is a row of its own, with `AND` written between one row and
 * the next. The joiner is text rather than a control, so there is nothing to
 * flip while only `AND` is supported.
 *
 * Rows are requirements, so everything chosen attends: `$find` intersects their
 * schedules, and adding a row narrows the times offered to the ones that actor
 * is also free for. A row names one actor — `ActorRequirement` can carry several
 * as a choice between them, which `getActorCombinations` searches, but nothing
 * offers a way to build one yet.
 *
 * @param props - The React props.
 * @returns The field for one role.
 */
export function AppointmentActorSelect(props: AppointmentActorSelectProps): JSX.Element {
  const { group, value, onChange, error, disabled } = props;
  const label = group.label.toLowerCase();

  // Rows are the requirements themselves, so an empty field is one empty row:
  // there is no separate notion of a row that exists but holds nothing.
  const rows = value.length > 0 ? value : [EMPTY_REQUIREMENT];
  // An id nothing on offer can fill is not an actor asked for, which is the rule
  // the rest of the module follows. Counting one would leave a candidate free
  // with no room left to ask for it.
  const chosen = new Set(getSelectedCandidates(group, { [group.role]: rows }).map((c) => c.schedule.id));
  // Stacking empty rows would leave the requirements they stand for ambiguous,
  // so a row has to be filled before it can be joined to another.
  const canAdd = !!rows.at(-1)?.scheduleIds.length && chosen.size < group.candidates.length;

  function setRow(index: number, scheduleIds: string[]): void {
    // Mantine appends what was picked, so keeping the last of them is what makes
    // a row behave as a single select.
    const ids = scheduleIds.slice(-1);
    onChange(rows.map((requirement, i) => (i === index ? { scheduleIds: ids } : requirement)));
  }

  return (
    <Input.Wrapper
      label={group.label}
      labelElement="div"
      withAsterisk={group.required}
      description={group.required ? undefined : `Optional. Leave empty to search without a ${label}.`}
      error={error}
      data-testid={`actor-select-${group.role}`}
    >
      <Stack gap={6} mt={6}>
        {rows.map((requirement, index) => {
          const ids = requirement.scheduleIds;
          const rowLabel = rows.length > 1 ? `${group.label} ${index + 1}` : group.label;

          return (
            // Keyed by position, which is what a row is: `Provider 2` names the
            // second row, not a particular actor. Keying by content instead
            // would remount the field on every pick and close the list under it.
            <Fragment key={index}>
              {index > 0 && (
                <Text className={classes.joiner} size="xs" c="dimmed">
                  AND
                </Text>
              )}
              <Group gap="xs" wrap="nowrap" align="flex-end">
                <MultiSelect
                  flex={1}
                  miw={0}
                  aria-label={rowLabel}
                  aria-required={group.required && index === 0 ? true : undefined}
                  styles={{ wrapper: { marginBlock: 0 } }}
                  error={!!error}
                  placeholder={ids.length === 0 ? `Search ${label}s` : undefined}
                  data={group.candidates
                    .filter((candidate) => !chosen.has(candidate.schedule.id) || ids.includes(candidate.schedule.id))
                    .map((candidate) => ({ value: candidate.schedule.id, label: getCandidateDisplay(candidate) }))}
                  value={[...ids]}
                  disabled={disabled}
                  searchable
                  // The names on offer are only in the document while the list
                  // is open, so a name in the field means it was chosen.
                  comboboxProps={{ keepMounted: false }}
                  nothingFoundMessage={`No ${label}s found`}
                  maxDropdownHeight={240}
                  onChange={(ids) => setRow(index, ids)}
                />
                {rows.length > 1 && (
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="lg"
                    disabled={disabled}
                    // Named by who it drops, falling back to the row for one
                    // that holds nobody yet.
                    aria-label={`Remove ${getRequirementLabel(group, requirement) || rowLabel}`}
                    onClick={() => onChange(rows.filter((_, i) => i !== index))}
                  >
                    <IconMinus size={16} stroke={1.8} />
                  </ActionIcon>
                )}
              </Group>
            </Fragment>
          );
        })}

        <Button
          variant="subtle"
          size="compact-sm"
          w="fit-content"
          disabled={disabled || !canAdd}
          leftSection={<IconPlus size={14} stroke={1.8} />}
          onClick={() => onChange([...rows, EMPTY_REQUIREMENT])}
        >
          Add {label}
        </Button>
      </Stack>
    </Input.Wrapper>
  );
}
