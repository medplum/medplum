// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ComboboxItem, OptionsFilter } from '@mantine/core';
import { ActionIcon, Button, Group, Input, MultiSelect, Stack, Text, VisuallyHidden } from '@mantine/core';
import { IconMinus, IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Fragment, useMemo } from 'react';
import classes from './AppointmentFinder.module.css';
import type { ActorRequirement, ScheduleCandidateGroup } from './AppointmentFinder.schedules';
import { candidateMatchesQuery, getRequirementLabel } from './AppointmentFinder.schedules';

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
  /**
   * Whether one row may name several actors, any one of which would do.
   *
   * Off, a row is a single actor and a second pick replaces the first, which is
   * the only shape the form offers today. On, a row becomes a choice — the state
   * it produces is the same either way, and `getActorCombinations` already
   * searches every way of resolving it.
   */
  readonly allowAlternatives?: boolean;
  readonly error?: string;
  readonly disabled?: boolean;
}

/**
 * Chooses the actors an appointment is held on for one role.
 *
 * Every requirement is a row of its own, numbered, with `AND` written between
 * one row and the next. The joiner is text rather than a control, so there is
 * nothing to flip while only `AND` is supported, and it is lettered like the
 * `OR` between alternatives so the two read as a pair.
 *
 * Rows are requirements, so everything chosen attends: `$find` intersects their
 * schedules, and adding a row narrows the times offered to the ones that actor
 * is also free for. Alternatives *within* a row widen the search instead, and
 * are gated behind `allowAlternatives`.
 *
 * @param props - The React props.
 * @returns The field for one role.
 */
export function AppointmentActorSelect(props: AppointmentActorSelectProps): JSX.Element {
  const { group, value, onChange, allowAlternatives, error, disabled } = props;
  const label = group.label.toLowerCase();

  const candidatesById = useMemo(
    () => new Map(group.candidates.map((candidate) => [candidate.schedule.id, candidate])),
    [group.candidates]
  );

  // Rows are the requirements themselves, so an empty field is one empty row:
  // there is no separate notion of a row that exists but holds nothing.
  const rows = value.length > 0 ? value : [EMPTY_REQUIREMENT];
  const chosen = new Set(rows.flatMap((requirement) => requirement.scheduleIds));
  // Stacking empty rows would leave the requirements they stand for ambiguous,
  // so a row has to be filled before it can be joined to another.
  const canAdd = rows[rows.length - 1].scheduleIds.length > 0 && chosen.size < group.candidates.length;

  // Narrows a row's list by what an actor does as well as by name, as it is
  // typed into. Mantine's own filter only matches the name.
  const filter: OptionsFilter = ({ options, search }) =>
    (options as ComboboxItem[]).filter((option) => {
      const candidate = candidatesById.get(option.value);
      return !!candidate && candidateMatchesQuery(candidate, search);
    });

  /**
   * Names a row, for its accessible name and for the button that drops it.
   *
   * Nothing draws this: a single row *is* the field and takes its label, and
   * numbering starts only once there is more than one row to tell apart. What
   * joins one row to the next is written between them instead of folded in here,
   * which would make a row's name read as the joiner.
   *
   * @param index - The row's position.
   * @returns The row's name.
   */
  function getRowLabel(index: number): string {
    return rows.length === 1 ? group.label : `${group.label} ${index + 1}`;
  }

  function setRow(index: number, scheduleIds: string[]): void {
    // Mantine appends what was picked, so keeping the last of them is what makes
    // a row without alternatives behave as a single select.
    const ids = allowAlternatives || scheduleIds.length <= 1 ? scheduleIds : scheduleIds.slice(-1);
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
          const rowLabel = getRowLabel(index);
          // An actor already asked for elsewhere is not on offer here: holding
          // the same schedule twice asks for times it is free from itself.
          const taken = new Set(rows.flatMap((entry, i) => (i === index ? [] : entry.scheduleIds)));

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
                  style={{ flex: 1, minWidth: 0 }}
                  // Named but not labelled: the field says `Provider` once at the
                  // top and `AND` between the rows, which is all a sighted
                  // reader needs. The number is still the only thing telling one
                  // row's list from another's to anyone who cannot see that.
                  aria-label={rowLabel}
                  // The asterisk beside the field's own label is not tied to any
                  // input. The first row is the one that carries the obligation:
                  // it is always there, and no later row can be added until it
                  // is filled.
                  aria-required={group.required && index === 0 ? true : undefined}
                  // The `OR` between the chips is the visual signal; this is the
                  // one screen readers get. Both follow the value rather than
                  // `allowAlternatives`, because a requirement naming several
                  // actors can also arrive from a caller.
                  classNames={{ pill: classes.alternativePill }}
                  // `OR` between the chips says this to anyone who can see it.
                  // Generated content is not dependably announced, so the same
                  // thing goes in the description, which Mantine wires to the
                  // input — hidden, and taking no space, so it costs the layout
                  // nothing. Follows the value rather than `allowAlternatives`,
                  // because a requirement naming several actors can also arrive
                  // from a caller.
                  description={
                    requirement.scheduleIds.length > 1 ? (
                      <VisuallyHidden>Any one of these will do.</VisuallyHidden>
                    ) : undefined
                  }
                  descriptionProps={{ style: { display: 'contents' } }}
                  // The wrapper prints the message; this is what makes the rows
                  // it is about look wrong and report themselves invalid. Passed
                  // as a flag so no row prints a second copy of it, and the row's
                  // own error slot is left out so an empty one cannot space the
                  // field out.
                  error={!!error}
                  inputWrapperOrder={['label', 'input', 'description']}
                  // Mantine spaces an input that has anything beside it in the
                  // wrapper, and matches on the sibling rather than on its box,
                  // so a boxless description still makes the row 5px taller than
                  // its neighbours. Nothing here is drawn above or below the
                  // input, so there is no spacing to keep.
                  styles={{ wrapper: { marginBlock: 0 } }}
                  placeholder={requirement.scheduleIds.length === 0 ? `Search ${label}s` : undefined}
                  data={group.candidates
                    .filter((candidate) => !taken.has(candidate.schedule.id))
                    .map((candidate) => ({ value: candidate.schedule.id, label: candidate.actorDisplay }))}
                  value={[...requirement.scheduleIds]}
                  disabled={disabled}
                  searchable
                  // The names on offer are only in the document while the list
                  // is open, so a name in the field means it was chosen.
                  comboboxProps={{ keepMounted: false }}
                  filter={filter}
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
