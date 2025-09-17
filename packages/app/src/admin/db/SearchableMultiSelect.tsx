// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  CheckIcon,
  Combobox,
  Group,
  Pill,
  PillsInput,
  PillsInputFieldProps,
  PillsInputProps,
  useCombobox,
} from '@mantine/core';
import { JSX, useMemo, useState } from 'react';

const MAX_DISPLAYED_OPTIONS = 8;

interface SearchableMultiSelectProps {
  readonly pillInputProps?: PillsInputProps;
  readonly inputProps?: PillsInputFieldProps;
  readonly data: string[];
  readonly onChange?: (value: string[]) => void;
}

export function SearchableMultiSelect({
  pillInputProps,
  inputProps,
  data,
  onChange,
}: SearchableMultiSelectProps): JSX.Element {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
    onDropdownOpen: () => combobox.updateSelectedOptionIndex('active'),
  });

  const [search, setSearch] = useState('');
  const [value, setValue] = useState<string[]>([]);

  const handleValueSelect = (val: string): void => {
    const newValue = value.includes(val) ? value.filter((v) => v !== val) : [...value, val];
    setValue(newValue);
    if (onChange) {
      onChange(newValue);
    }
  };

  const handleValueRemove = (val: string): void => setValue((current) => current.filter((v) => v !== val));

  const valueDisplay = useMemo(
    () =>
      value.map((item) => (
        <Pill key={item} withRemoveButton onRemove={() => handleValueRemove(item)}>
          {item}
        </Pill>
      )),
    [value]
  );

  const filteredOptions = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.filter((item) => item.toLowerCase().includes(needle));
  }, [data, search]);

  const displayedOptions = useMemo(() => {
    const result: JSX.Element[] = new Array(Math.min(filteredOptions.length, MAX_DISPLAYED_OPTIONS));
    for (let i = 0; i < result.length; i++) {
      const item = filteredOptions[i];
      result[i] = (
        <Combobox.Option value={item} key={item} active={value.includes(item)}>
          <Group gap="sm">
            {value.includes(item) ? <CheckIcon size={12} /> : null}
            <span>{item}</span>
          </Group>
        </Combobox.Option>
      );
    }
    return result;
  }, [filteredOptions, value]);

  return (
    <Combobox store={combobox} onOptionSubmit={handleValueSelect} withinPortal={false}>
      <Combobox.DropdownTarget>
        <PillsInput onClick={() => combobox.openDropdown()} {...pillInputProps}>
          <Pill.Group>
            {valueDisplay}
            <Combobox.EventsTarget>
              <PillsInput.Field
                onFocus={() => combobox.openDropdown()}
                onBlur={() => {
                  combobox.closeDropdown();
                  setSearch('');
                }}
                value={search}
                onChange={(event) => {
                  combobox.updateSelectedOptionIndex();
                  setSearch(event.currentTarget.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Backspace' && search.length === 0 && value.length > 0) {
                    event.preventDefault();
                    handleValueRemove(value[value.length - 1]);
                  }
                }}
                {...inputProps}
              />
            </Combobox.EventsTarget>
          </Pill.Group>
        </PillsInput>
      </Combobox.DropdownTarget>

      <Combobox.Dropdown>
        <Combobox.Options>
          {displayedOptions.length > 0 ? displayedOptions : <Combobox.Empty>Nothing found...</Combobox.Empty>}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
