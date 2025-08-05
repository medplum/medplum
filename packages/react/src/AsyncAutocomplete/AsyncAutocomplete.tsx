// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Combobox,
  ComboboxItem,
  ComboboxProps,
  Group,
  Loader,
  Pill,
  PillsInput,
  ScrollAreaAutosize,
  useCombobox,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { IconCheck } from '@tabler/icons-react';
import {
  JSX,
  KeyboardEvent,
  ReactNode,
  SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { killEvent } from '../utils/dom';
import { AsyncAutocompleteTestIds } from './AsyncAutocomplete.utils';

export interface AsyncAutocompleteOption<T> extends ComboboxItem {
  readonly active?: boolean;
  readonly resource: T;
}

export interface AsyncAutocompleteProps<T>
  extends Omit<ComboboxProps, 'data' | 'defaultValue' | 'loadOptions' | 'onChange' | 'onCreate' | 'searchable'> {
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
    ...rest
  } = props;
  const disabled = rest.disabled; // leave in rest so it also propagates to ComboBox
  const defaultItems = toDefaultItems(defaultValue);
  const [search, setSearch] = useState('');
  const [timer, setTimer] = useState<number>();
  const [abortController, setAbortController] = useState<AbortController>();
  const [autoSubmit, setAutoSubmit] = useState<boolean>();
  const [selected, setSelected] = useState<AsyncAutocompleteOption<T>[]>(defaultItems.map(toOption));
  const [options, setOptions] = useState<AsyncAutocompleteOption<T>[]>([]);
  const ItemComponent = itemComponent ?? DefaultItemComponent;
  const PillComponent = pillComponent ?? DefaultPillComponent;
  const EmptyComponent = emptyComponent ?? DefaultEmptyComponent;

  const searchRef = useRef<string>(search);
  searchRef.current = search;

  const lastLoadOptionsRef = useRef<AsyncAutocompleteProps<T>['loadOptions']>(undefined);
  const lastValueRef = useRef<string>(undefined);

  const timerRef = useRef<number>(timer);
  timerRef.current = timer;

  const abortControllerRef = useRef<AbortController>(abortController);
  abortControllerRef.current = abortController;

  const autoSubmitRef = useRef<boolean>(autoSubmit);
  autoSubmitRef.current = autoSubmit;

  const optionsRef = useRef<AsyncAutocompleteOption<T>[]>(options);
  optionsRef.current = options;

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
        if (!(newAbortController.signal.aborted || err.message.includes('aborted'))) {
          showNotification({ color: 'red', message: normalizeErrorString(err) });
        }
      })
      .finally(() => {
        if (!newAbortController.signal.aborted) {
          setAbortController(undefined);
        }
      });
  }, [combobox, loadOptions, onChange, toOption, minInputLength]);

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
    [combobox, options, creatable, handleTimer]
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
    [creatable, options, selected, maxValues, onChange, onCreate, toOption]
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
  }, [addSelected, combobox, disabled, maxValues, search]);

  const handleValueRemove = useCallback(
    (item: AsyncAutocompleteOption<T>): void => {
      const newSelected = selected.filter((v) => v.value !== item.value);
      onChange(newSelected.map((v) => v.resource));
      setSelected(newSelected);
    },
    [selected, onChange]
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
    [abortController, handleValueRemove, search.length, selected, timer]
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
        onChange([]);
        combobox.closeDropdown();
      }}
    />
  );

  const createVisible = creatable && search.trim().length > 0;
  const comboboxVisible = options.length > 0 || createVisible;

  return (
    <Combobox store={combobox} onOptionSubmit={handleValueSelect} withinPortal={true} shadow="xl" {...rest}>
      <Combobox.DropdownTarget>
        <PillsInput
          label={label}
          description={description}
          error={error}
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
            {!disabled && (maxValues === undefined || maxValues === 0 || selected.length < maxValues) && (
              <Combobox.EventsTarget>
                <PillsInput.Field
                  role="searchbox"
                  name={name}
                  value={search}
                  placeholder={placeholder}
                  onFocus={handleSearchChange}
                  onBlur={() => {
                    combobox.closeDropdown();
                    setSearch('');
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
