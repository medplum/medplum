// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ComboboxItem, ComboboxProps } from '@mantine/core';
import { Combobox, Group, Loader, Pill, PillsInput, ScrollAreaAutosize, useCombobox } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import { IconCheck } from '@tabler/icons-react';
import type { JSX, KeyboardEvent, ReactNode, SyntheticEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { killEvent } from '../utils/dom';
import { AsyncAutocompleteTestIds } from './AsyncAutocomplete.utils';

export interface AsyncAutocompleteOption<T> extends ComboboxItem {
  readonly active?: boolean;
  readonly resource: T;
}

export interface AsyncAutocompleteProps<T> extends Omit<
  ComboboxProps,
  'data' | 'defaultValue' | 'loadOptions' | 'onChange' | 'onCreate' | 'searchable'
> {
  readonly name?: string;
  readonly label?: ReactNode;
  readonly description?: ReactNode;
  readonly error?: ReactNode;
  readonly defaultValue?: T | T[];
  readonly toOption: (item: T) => AsyncAutocompleteOption<T>;
  readonly loadOptions: (input: string, signal: AbortSignal) => Promise<T[]>;
  readonly itemComponent?: (props: AsyncAutocompleteOption<T>) => JSX.Element | ReactNode;
  readonly pillComponent?: (props: {
    item: AsyncAutocompleteOption<T>;
    disabled?: boolean;
    onRemove: () => void;
  }) => JSX.Element;
  readonly emptyComponent?: (props: { search: string }) => JSX.Element | ReactNode;
  readonly onChange: (item: T[]) => void;
  readonly onCreate?: (input: string) => T;
  readonly creatable?: boolean;
  readonly clearable?: boolean;
  readonly required?: boolean;
  readonly className?: string;
  readonly placeholder?: string;
  readonly leftSection?: ReactNode;
  readonly maxValues?: number;
  readonly optionsDropdownMaxHeight?: number;
  readonly minInputLength?: number; // minimum number of input characters required before executing loadOptions
  readonly inputWrapperOrder?: ('label' | 'input' | 'description' | 'error')[];
}

export function AsyncAutocomplete<T>(props: AsyncAutocompleteProps<T>): JSX.Element {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
    onDropdownOpen: () => combobox.updateSelectedOptionIndex('active'),
  });
  const {
    name,
    label,
    description,
    error,
    defaultValue,
    toOption,
    loadOptions,
    itemComponent,
    pillComponent,
    emptyComponent,
    onChange,
    onCreate,
    creatable,
    clearable,
    required,
    placeholder,
    leftSection,
    maxValues,
    optionsDropdownMaxHeight = 320,
    minInputLength = 0,
    inputWrapperOrder,
    ...rest
  } = props;
  const disabled = rest.disabled; // leave in rest so it also propagates to ComboBox
  const defaultItems = toDefaultItems(defaultValue);
  const [search, setSearch] = useState('');
  const [timer, setTimer] = useState<number>();
  const [abortController, setAbortController] = useState<AbortController>();
  const [autoSubmit, setAutoSubmit] = useState<boolean>();
  const [selected, setSelected] = useState(defaultItems.map(toOption));
  const [options, setOptions] = useState<AsyncAutocompleteOption<T>[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const ItemComponent = itemComponent ?? DefaultItemComponent;
  const PillComponent = pillComponent ?? DefaultPillComponent;
  const EmptyComponent = emptyComponent ?? DefaultEmptyComponent;

  const searchRef = useRef(search);
  const lastLoadOptionsRef = useRef<AsyncAutocompleteProps<T>['loadOptions']>(undefined);
  const lastValueRef = useRef<string>(undefined);
  const timerRef = useRef<number>(timer);
  const abortControllerRef = useRef<AbortController>(abortController);
  const autoSubmitRef = useRef<boolean>(autoSubmit);
  useLayoutEffect(() => {
    searchRef.current = search;
    timerRef.current = timer;
    abortControllerRef.current = abortController;
    autoSubmitRef.current = autoSubmit;
  });

  const handleTimer = useCallback((): void => {
    setTimer(undefined);

    if (searchRef.current === lastValueRef.current && loadOptions === lastLoadOptionsRef.current) {
      // Same search input and loadOptions function, move on
      return;
    }
    if ((searchRef.current?.length ?? 0) < minInputLength) {
      return;
    }

    lastValueRef.current = searchRef.current;
    lastLoadOptionsRef.current = loadOptions;

    const newAbortController = new AbortController();
    setAbortController(newAbortController);

    loadOptions(searchRef.current ?? '', newAbortController.signal)
      .then((newValues: T[]) => {
        if (!newAbortController.signal.aborted) {
          setLoadError(undefined);
          setOptions(newValues.map(toOption));
          if (autoSubmitRef.current) {
            if (newValues.length > 0) {
              onChange(newValues.slice(0, 1));
            }
            setAutoSubmit(false);
          } else if (newValues.length > 0) {
            combobox.openDropdown();
          }
        }
      })
      .catch((err) => {
        const message = normalizeErrorString(err);
        if (!(newAbortController.signal.aborted || message.includes('aborted'))) {
          setLoadError(message);
          // A failed search is not "already done" — allow the same input to retry on the next focus
          lastValueRef.current = undefined;
          // Disarm a pending Enter so it can't auto-select the first result of a later,
          // unrelated successful search
          setAutoSubmit(false);
        }
      })
      .finally(() => {
        if (!newAbortController.signal.aborted) {
          setAbortController(undefined);
        }
      });
  }, [
    combobox,
    loadOptions,
    onChange,
    toOption,
    minInputLength,
    setTimer,
    setAbortController,
    setOptions,
    setAutoSubmit,
    setLoadError,
  ]);

  const handleSearchChange = useCallback(
    (e: SyntheticEvent): void => {
      if ((options && options.length > 0) || creatable) {
        combobox.openDropdown();
      }

      combobox.updateSelectedOptionIndex();
      setSearch((e.currentTarget as HTMLInputElement).value);

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        setAbortController(undefined);
      }

      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
      }

      const newTimer = window.setTimeout(() => handleTimer(), 100);
      setTimer(newTimer);
    },
    [combobox, options, creatable, handleTimer, setSearch, setAbortController, setTimer]
  );

  const addSelected = useCallback(
    (newValue: string): void => {
      const alreadySelected = selected.some((v) => v.value === newValue);
      const newSelected = alreadySelected ? selected.filter((v) => v.value !== newValue) : [...selected];
      let option = options?.find((option) => option.value === newValue);
      if (!option && creatable !== false && onCreate) {
        const createdResource = onCreate(newValue);
        option = toOption(createdResource);
      }

      if (option) {
        // when maxValues is 0, still fire the onChange when an item is selected
        if (maxValues === 0) {
          onChange([option.resource]);

          // and clear selected if necessary
          if (selected.length > 0) {
            setSelected([]);
          }
          return;
        }

        if (!alreadySelected) {
          newSelected.push(option);
        }
      }

      if (maxValues !== undefined) {
        while (newSelected.length > maxValues) {
          // Remove from the front
          newSelected.shift();
        }
      }

      onChange(newSelected.map((v) => v.resource));
      setSelected(newSelected);
    },
    [creatable, options, selected, maxValues, onChange, onCreate, toOption, setSelected]
  );

  const handleValueSelect = useMemo(() => {
    if (disabled) {
      return undefined;
    }

    return (val: string): void => {
      if (disabled) {
        return;
      }
      if (maxValues === 1) {
        setSearch('');
        setOptions([]);
        combobox.closeDropdown();
      }
      lastValueRef.current = undefined;
      if (val === '$create') {
        setSearch('');
        addSelected(search);
      } else {
        addSelected(val);
      }
    };
  }, [addSelected, combobox, disabled, maxValues, search, setSearch, setOptions]);

  const handleValueRemove = useCallback(
    (item: AsyncAutocompleteOption<T>): void => {
      const newSelected = selected.filter((v) => v.value !== item.value);
      onChange(newSelected.map((v) => v.resource));
      setSelected(newSelected);
    },
    [selected, onChange, setSelected]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        if (timer || abortController) {
          // The user pressed enter, but we don't have results yet.
          // We need to wait for the results to come in.
          setAutoSubmit(true);
        }
      } else if (e.key === 'Backspace' && search.length === 0) {
        killEvent(e);
        handleValueRemove(selected[selected.length - 1]);
      }
    },
    [abortController, handleValueRemove, search.length, selected, timer, setAutoSubmit]
  );

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Based on Mantine MultiSelect:
  // https://github.com/mantinedev/mantine/blob/master/packages/%40mantine/core/src/components/MultiSelect/MultiSelect.tsx
  const clearButton = !disabled && clearable && selected.length > 0 && (
    <Combobox.ClearButton
      title="Clear all"
      size="sm"
      onClear={() => {
        setSearch('');
        setSelected([]);
        setLoadError(undefined);
        onChange([]);
        combobox.closeDropdown();
      }}
    />
  );

  const createVisible = creatable && search.trim().length > 0;
  const comboboxVisible = options.length > 0 || createVisible;

  const displayError =
    error && loadError ? (
      <>
        {error}
        <br />
        {loadError}
      </>
    ) : (
      error || loadError
    );

  return (
    <Combobox store={combobox} onOptionSubmit={handleValueSelect} withinPortal={true} shadow="xl" {...rest}>
      <Combobox.DropdownTarget>
        <PillsInput
          label={label}
          description={description}
          error={displayError}
          inputWrapperOrder={inputWrapperOrder}
          className={props.className}
          leftSection={leftSection}
          rightSection={abortController ? <Loader size={16} /> : clearButton}
          required={required}
          disabled={disabled}
        >
          <Pill.Group data-testid={AsyncAutocompleteTestIds.selectedItems}>
            {selected.map((item) => (
              <PillComponent
                key={item.value}
                item={item}
                disabled={disabled}
                onRemove={() => handleValueRemove(item)}
              />
            ))}
            {(maxValues === undefined || maxValues === 0 || selected.length < maxValues) && (
              <Combobox.EventsTarget>
                <PillsInput.Field
                  role="searchbox"
                  disabled={disabled}
                  name={name}
                  value={search}
                  placeholder={placeholder}
                  onFocus={handleSearchChange}
                  onBlur={() => {
                    combobox.closeDropdown();
                    setSearch('');
                    // A quiet empty field shouldn't keep showing the last search's failure;
                    // refocusing retries the search and restores the error if it still fails.
                    // Abort any in-flight search and pending timer so a late rejection can't
                    // repaint the error under the blurred field.
                    setLoadError(undefined);
                    if (abortControllerRef.current) {
                      abortControllerRef.current.abort();
                      setAbortController(undefined);
                    }
                    if (timerRef.current !== undefined) {
                      window.clearTimeout(timerRef.current);
                      setTimer(undefined);
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  onChange={handleSearchChange}
                />
              </Combobox.EventsTarget>
            )}
          </Pill.Group>
        </PillsInput>
      </Combobox.DropdownTarget>

      <Combobox.Dropdown hidden={!comboboxVisible} data-testid={AsyncAutocompleteTestIds.options}>
        <Combobox.Options>
          <ScrollAreaAutosize type="scroll" mah={optionsDropdownMaxHeight}>
            {options.map((item) => {
              const active = selected.some((v) => v.value === item.value);
              return (
                <Combobox.Option value={item.value} key={item.value} active={active}>
                  <ItemComponent {...item} active={active} />
                </Combobox.Option>
              );
            })}

            {createVisible && <Combobox.Option value="$create">+ Create {search}</Combobox.Option>}

            {!creatable && search.trim().length > 0 && options.length === 0 && <EmptyComponent search={search} />}
          </ScrollAreaAutosize>
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

function toDefaultItems<T>(defaultValue: T | T[] | undefined): T[] {
  if (!defaultValue) {
    return [];
  }
  if (Array.isArray(defaultValue)) {
    return defaultValue;
  }
  return [defaultValue];
}

function DefaultItemComponent<T>(props: AsyncAutocompleteOption<T>): JSX.Element {
  return (
    <Group gap="xs">
      {props.active && <IconCheck size={12} />}
      <span>{props.label}</span>
    </Group>
  );
}

function DefaultPillComponent<T>({
  item,
  disabled,
  onRemove,
}: {
  readonly item: AsyncAutocompleteOption<T>;
  readonly disabled?: boolean;
  readonly onRemove: () => void;
}): JSX.Element {
  return (
    <Pill withRemoveButton={!disabled} onRemove={onRemove}>
      {item.label}
    </Pill>
  );
}

function DefaultEmptyComponent(): JSX.Element {
  return <Combobox.Empty>Nothing found</Combobox.Empty>;
}
