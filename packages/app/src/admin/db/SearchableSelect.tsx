// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Combobox, InputBase, InputBaseProps, PolymorphicComponentProps, useCombobox } from '@mantine/core';
import { JSX, useMemo, useState } from 'react';

const MAX_DISPLAYED_OPTIONS = 8;

interface SearchableSelectProps {
  readonly inputProps?: PolymorphicComponentProps<'input', InputBaseProps>;
  readonly data: string[];
  readonly onChange?: (value: string) => void;
}

export function SearchableSelect({ inputProps, data, onChange }: SearchableSelectProps): JSX.Element {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const [value, setValue] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filteredOptions = useMemo(() => {
    return data.filter((item) => item.toLowerCase().includes(search.toLowerCase().trim()));
  }, [data, search]);

  const displayedOptions = useMemo(() => {
    const result: JSX.Element[] = new Array(Math.min(filteredOptions.length, MAX_DISPLAYED_OPTIONS));
    for (let i = 0; i < result.length; i++) {
      const item = filteredOptions[i];
      result[i] = (
        <Combobox.Option value={item} key={item}>
          {item}
        </Combobox.Option>
      );
    }
    return result;
  }, [filteredOptions]);

  return (
    <Combobox
      store={combobox}
      withinPortal={false}
      onOptionSubmit={(val) => {
        if (onChange) {
          onChange(val);
        }
        setValue(val);
        setSearch(val);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <InputBase
          rightSection={<Combobox.Chevron />}
          value={search}
          onChange={(event) => {
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
            setSearch(event.currentTarget.value);
          }}
          onClick={() => combobox.openDropdown()}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => {
            combobox.closeDropdown();
            setSearch(value || '');
          }}
          rightSectionPointerEvents="none"
          {...inputProps}
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          {displayedOptions.length > 0 ? displayedOptions : <Combobox.Empty>Nothing found</Combobox.Empty>}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
