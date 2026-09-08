// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Combobox, Group, InputBase, Text, useCombobox } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  filterTimeOptions,
  formatMinutesOfDay,
  isTimeQuery,
  nearestOption,
  timeOptions,
  typedTimes,
} from './ScheduleAvailabilityEditor.utils';

/**
 * Props for the TimeSelect component.
 * @param value - The selected time, as minutes from midnight
 * @param min - Earliest selectable time, as minutes from midnight
 * @param max - Latest selectable time, as minutes from midnight
 * @param label - Accessible label for the input
 * @param onChange - Called with the newly selected time
 * @param disabled - Whether the input is disabled
 * @param testId - Test id applied to the input
 * @param className - Class applied to the input wrapper, for the caller to place it
 */
export interface TimeSelectProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly label: string;
  readonly onChange: (value: number) => void;
  readonly disabled?: boolean;
  readonly testId?: string;
  readonly className?: string;
}

/** Imperative handle on a TimeSelect. */
export interface TimeSelectHandle {
  /** Flashes the input, drawing the eye to a value the editor changed on the user's behalf. */
  readonly flash: () => void;
}

// Long enough to notice, short enough not to linger over the next edit.
const FLASH_DURATION_MS = 700;

// The flash borrows the focus border rather than adding an outline of its own,
// so a value the editor changed looks like a field worth looking at rather than
// a field in error. Easing both ways keeps it from snapping; the transition
// stays on the input at all times so the fade out has something to animate.
const INPUT_STYLES = { input: { transition: 'border-color 450ms' } };

const FLASH_STYLES = {
  input: { ...INPUT_STYLES.input, borderColor: 'var(--mantine-primary-color-filled)' },
};

/**
 * Picks a time of day from a list, with typing as a way to jump through it.
 *
 * The caller decides which times are offered, so the list can be narrowed to the
 * hours still free on a given day. Typing filters that list rather than
 * accepting free text, which keeps every selectable value within the bounds.
 * @param props - The selected time, the bounds it may move within, and a change handler
 * @param ref - Handle for flashing the input
 * @returns A time picker
 */
export const TimeSelect = forwardRef<TimeSelectHandle, TimeSelectProps>(function TimeSelect(props, ref): JSX.Element {
  const { value, min, max, label, onChange, disabled, testId, className } = props;
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeOptionRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });

  // A counter rather than a flag, so a second flash while the first is still
  // showing restarts it rather than being swallowed. Undefined is not flashing.
  const [flashId, setFlashId] = useState<number>();
  const flashing = flashId !== undefined;

  // Called from the event handler that changed the value, so the flash is
  // batched into the same render and begins in the same paint as the new value.
  useImperativeHandle(ref, () => ({ flash: () => setFlashId((previous) => (previous ?? 0) + 1) }), []);

  useEffect(() => {
    if (flashId === undefined) {
      return undefined;
    }
    const timer = setTimeout(() => setFlashId(undefined), FLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [flashId]);

  // Open onto the current time rather than the top of the list, so the nearby
  // times are the ones in view. `useCombobox` returns a new store object every
  // render, so this keys off the opened flag and the store's stable callback
  // rather than the store itself.
  const { dropdownOpened, selectActiveOption } = combobox;
  useEffect(() => {
    if (!dropdownOpened) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      selectActiveOption();
      activeOptionRef.current?.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [dropdownOpened, selectActiveOption]);

  const display = formatMinutesOfDay(value);
  const typed = typing ? query : '';
  // The interval decides what is listed, not what is reachable. The current
  // time is listed whether or not it sits on the interval, so a time set
  // elsewhere is still shown as selected rather than looking unset, and a time
  // typed in full is listed so it can be picked like any other.
  const options = filterTimeOptions(timeOptions(min, max, [value, ...typedTimes(typed)]), typed, value);
  // Filtering can leave the current time out, and then there is nothing exact
  // to scroll to, so the list opens near it instead of at the top of the day.
  const scrollTo = options.includes(value) ? value : nearestOption(options, value);

  function handleSubmit(selected: number): void {
    onChange(selected);
    setQuery('');
    setTyping(false);
    combobox.closeDropdown();
    // The state above has not been applied yet, so the blur this causes would
    // otherwise see the old query and commit the same time a second time.
    submitting.current = true;
    inputRef.current?.blur();
    submitting.current = false;
  }

  // Tabbing to the next field is a common way to finish with this one, so a
  // typed time is taken rather than dropped. What gets taken is whatever the
  // list has highlighted, which is the same time Enter would have submitted.
  // Only a query that names a time counts: one that names none leaves the list
  // unnarrowed, and taking the top of it would silently move the value to the
  // earliest time of the day.
  function handleBlur(): void {
    if (!submitting.current && typing && isTimeQuery(query)) {
      const highlighted = options[combobox.getSelectedOptionIndex()] ?? options[0];
      if (highlighted !== undefined) {
        onChange(highlighted);
      }
    }
    setTyping(false);
    setQuery('');
    combobox.closeDropdown();
  }

  return (
    // A full day holds 97 options, and a week of them adds up, so closed
    // dropdowns are unmounted rather than left hidden in the DOM.
    <Combobox store={combobox} keepMounted={false} onOptionSubmit={(selected) => handleSubmit(Number(selected))}>
      <Combobox.Target>
        <InputBase
          ref={inputRef}
          component="input"
          type="text"
          className={className}
          w={132}
          value={typing ? query : display}
          placeholder={display}
          disabled={disabled}
          aria-label={label}
          data-testid={testId}
          data-flashing={flashing || undefined}
          styles={flashing ? FLASH_STYLES : INPUT_STYLES}
          rightSection={<Combobox.Chevron />}
          rightSectionPointerEvents="none"
          onChange={(e) => {
            setTyping(true);
            setQuery(e.currentTarget.value);
            combobox.openDropdown();
            combobox.selectFirstOption();
          }}
          onFocus={() => {
            setTyping(true);
            setQuery('');
            combobox.openDropdown();
          }}
          onBlur={handleBlur}
          onClick={() => combobox.openDropdown()}
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options mah={220} style={{ overflowY: 'auto' }}>
          {options.length === 0 ? (
            <Combobox.Empty>No matching time</Combobox.Empty>
          ) : (
            options.map((option) => (
              <Combobox.Option
                key={option}
                value={option.toString()}
                active={option === value}
                ref={option === scrollTo ? activeOptionRef : undefined}
              >
                <Group justify="space-between" gap="xs" wrap="nowrap">
                  {/* `inherit` keeps the option at the size Combobox sets rather than Text's own. */}
                  <Text span inherit>
                    {formatMinutesOfDay(option)}
                  </Text>
                  {option === value && <IconCheck size={14} stroke={1.8} />}
                </Group>
              </Combobox.Option>
            ))
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
});
