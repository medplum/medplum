import { Combobox, ComboboxItem, ComboboxProps, Group, Loader, Pill, PillsInput, useCombobox } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { KeyboardEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { killEvent } from '../utils/dom';

export interface AsyncAutocompleteOption<T> extends ComboboxItem {
  resource: T;
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
  readonly onChange: (item: T[]) => void;
  readonly onCreate?: (input: string) => T;
  readonly creatable?: boolean;
  readonly clearable?: boolean;
  readonly required?: boolean;
  readonly className?: string;
  readonly placeholder?: string;
  readonly leftSection?: ReactNode;
  readonly maxValues?: number;
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
    onChange,
    onCreate,
    creatable,
    clearable,
    required,
    placeholder,
    leftSection,
    maxValues,
    ...rest
  } = props;
  const defaultItems = toDefaultItems(defaultValue);
  const [search, setSearch] = useState('');
  const [timer, setTimer] = useState<number>();
  const [abortController, setAbortController] = useState<AbortController>();
  const [autoSubmit, setAutoSubmit] = useState<boolean>();
  const [selected, setSelected] = useState<AsyncAutocompleteOption<T>[]>(defaultItems.map(toOption));
  const [options, setOptions] = useState<AsyncAutocompleteOption<T>[]>([]);
  const ItemComponent = itemComponent ?? DefaultItemComponent;

  const searchRef = useRef<string>();
  searchRef.current = search;

  const lastLoadOptionsRef = useRef<AsyncAutocompleteProps<T>['loadOptions']>();
  const lastValueRef = useRef<string>();

  const timerRef = useRef<number>();
  timerRef.current = timer;

  const abortControllerRef = useRef<AbortController>();
  abortControllerRef.current = abortController;

  const autoSubmitRef = useRef<boolean>();
  autoSubmitRef.current = autoSubmit;

  const optionsRef = useRef<AsyncAutocompleteOption<T>[]>();
  optionsRef.current = options;

  const handleTimer = useCallback((): void => {
    setTimer(undefined);

    if (searchRef.current === lastValueRef.current && loadOptions === lastLoadOptionsRef.current) {
      // Same search input and loadOptions function, move on
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
          setAbortController(undefined);
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
      });
  }, [combobox, loadOptions, onChange, toOption]);

  const handleSearchChange = useCallback(
    (e: React.SyntheticEvent): void => {
      if (options && options.length > 0) {
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
    [combobox, options, handleTimer]
  );

  const addSelected = useCallback(
    (newValue: string): void => {
      const result: T[] = [];
      const newSelected: AsyncAutocompleteOption<T>[] = [...selected];

      let option = options?.find((option) => option.value === newValue);
      let item = option?.resource;
      if (!item && creatable !== false && onCreate) {
        item = onCreate(newValue);
        option = toOption(item);
      }

      if (item) {
        result.push(item);
      }

      if (option) {
        newSelected.push(option);
      }

      if (maxValues !== undefined) {
        while (newSelected.length > maxValues) {
          // Remove from the front
          newSelected.shift();
        }
      }

      onChange(result);
      setSelected(newSelected);
    },
    [creatable, options, selected, maxValues, onChange, onCreate, toOption]
  );

  const handleValueSelect = (val: string): void => {
    setSearch('');
    setOptions([]);
    lastValueRef.current = undefined;
    if (val === '$create') {
      addSelected(search);
    } else {
      addSelected(val);
    }
  };

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
        if (!timer && !abortController) {
          killEvent(e);
          if (options && options.length > 0) {
            setOptions(options.slice(0, 1));
            addSelected(options[0].value);
          }
        } else {
          // The user pressed enter, but we don't have results yet.
          // We need to wait for the results to come in.
          setAutoSubmit(true);
        }
      } else if (e.key === 'Backspace' && search.length === 0) {
        killEvent(e);
        handleValueRemove(selected[selected.length - 1]);
      }
    },
    [search, selected, options, timer, abortController, addSelected, handleValueRemove]
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
  const clearButton = clearable && selected.length > 0 && (
    <Combobox.ClearButton
      title="Clear all"
      size={16}
      onClear={() => {
        setSearch('');
        setSelected([]);
        onChange([]);
      }}
    />
  );

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
        >
          <Pill.Group>
            {selected.map((item) => (
              <Pill key={item.value} withRemoveButton onRemove={() => handleValueRemove(item)}>
                {item.label}
              </Pill>
            ))}

            <Combobox.EventsTarget>
              <PillsInput.Field
                role="searchbox"
                name={name}
                value={search}
                placeholder={placeholder}
                onFocus={handleSearchChange}
                onBlur={() => combobox.closeDropdown()}
                onKeyDown={handleKeyDown}
                onChange={handleSearchChange}
              />
            </Combobox.EventsTarget>
          </Pill.Group>
        </PillsInput>
      </Combobox.DropdownTarget>

      <Combobox.Dropdown>
        <Combobox.Options>
          {options.map((item) => (
            <Combobox.Option value={item.value} key={item.value} active={selected.includes(item)}>
              <ItemComponent {...item} />
            </Combobox.Option>
          ))}

          {creatable && search.trim().length > 0 && (
            <Combobox.Option value="$create">+ Create {search}</Combobox.Option>
          )}

          {!creatable && search.trim().length > 0 && options.length === 0 && (
            <Combobox.Empty>Nothing found</Combobox.Empty>
          )}
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

function DefaultItemComponent(props: ComboboxItem): JSX.Element {
  return (
    <Group gap="sm">
      <span>{props.label}</span>
    </Group>
  );
}
