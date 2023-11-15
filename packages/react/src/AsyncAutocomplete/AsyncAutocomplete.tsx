import { Combobox, ComboboxItem, Group, Loader, MultiSelectProps, Pill, PillsInput, useCombobox } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { KeyboardEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { killEvent } from '../utils/dom';

export interface AsyncAutocompleteOption<T> extends ComboboxItem {
  resource: T;
}

export interface AsyncAutocompleteProps<T>
  extends Omit<MultiSelectProps, 'data' | 'defaultValue' | 'loadOptions' | 'onChange' | 'onCreate' | 'searchable'> {
  readonly defaultValue?: T | T[];
  readonly toOption: (item: T) => AsyncAutocompleteOption<T>;
  readonly loadOptions: (input: string, signal: AbortSignal) => Promise<T[]>;
  readonly itemComponent?: (props: AsyncAutocompleteOption<T>) => JSX.Element | ReactNode;
  readonly onChange: (item: T[]) => void;
  readonly onCreate?: (input: string) => T;
  readonly creatable?: boolean;
}

export function AsyncAutocomplete<T>(props: AsyncAutocompleteProps<T>): JSX.Element {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
    onDropdownOpen: () => combobox.updateSelectedOptionIndex('active'),
  });
  const { defaultValue, toOption, loadOptions, onChange, onCreate, creatable } = props;
  const defaultItems = toDefaultItems(defaultValue);
  const [search, setSearch] = useState('');
  // const [lastValue, setLastValue] = useState<string>();
  const [timer, setTimer] = useState<number>();
  const [abortController, setAbortController] = useState<AbortController>();
  const [autoSubmit, setAutoSubmit] = useState<boolean>();
  const [selected, setSelected] = useState<AsyncAutocompleteOption<T>[]>(defaultItems.map(toOption));
  const [options, setOptions] = useState<AsyncAutocompleteOption<T>[]>([]);
  const ItemComponent = props.itemComponent ?? DefaultItemComponent;

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

  const handleChange = useCallback(
    (values: string[]): void => {
      const result: T[] = [];
      const newSelected: AsyncAutocompleteOption<T>[] = [];
      for (const value of values) {
        let option = options?.find((option) => option.value === value);
        let item = option?.resource;
        if (!item && creatable !== false && onCreate) {
          item = onCreate(value);
          option = toOption(item);
        }

        if (item) {
          result.push(item);
        }

        if (option) {
          newSelected.push(option);
        }
      }
      onChange(result);
      setSelected(newSelected);
    },
    [creatable, options, onChange, onCreate, toOption]
  );

  const handleValueSelect = (val: string): void => {
    setSearch('');
    setOptions([]);
    lastValueRef.current = undefined;
    if (val === '$create') {
      handleChange([search]);
    } else {
      handleChange([val]);
    }
  };

  const handleValueRemove = useCallback((item: AsyncAutocompleteOption<T>): void => {
    setSelected((current) => current.filter((v) => v.value !== item.value));
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        if (!timer && !abortController) {
          killEvent(e);
          if (options && options.length > 0) {
            setOptions(options.slice(0, 1));
            handleChange([options[0].value]);
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
    [search, selected, options, timer, abortController, handleChange, handleValueRemove]
  );

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return (
    <Combobox store={combobox} onOptionSubmit={handleValueSelect} withinPortal={true} shadow="xl">
      <Combobox.DropdownTarget>
        <PillsInput
          className={props.className}
          leftSection={props.leftSection}
          rightSection={abortController ? <Loader size={16} /> : null}
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
                value={search}
                placeholder={props.placeholder}
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
