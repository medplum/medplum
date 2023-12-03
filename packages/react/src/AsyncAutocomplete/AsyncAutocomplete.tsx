import { Loader, MultiSelect, MultiSelectProps, SelectItem } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { killEvent } from '../utils/dom';

export interface AsyncAutocompleteOption<T> extends SelectItem {
  resource: T;
}

export interface AsyncAutocompleteProps<T>
  extends Omit<MultiSelectProps, 'data' | 'defaultValue' | 'loadOptions' | 'onChange' | 'onCreate' | 'searchable'> {
  defaultValue?: T | T[];
  toKey: (item: T) => string;
  toOption: (item: T) => AsyncAutocompleteOption<T>;
  loadOptions: (input: string, signal: AbortSignal) => Promise<T[]>;
  onChange: (item: T[]) => void;
  onCreate?: (input: string) => T;
  creatable?: boolean;
}

export function AsyncAutocomplete<T>(props: AsyncAutocompleteProps<T>): JSX.Element {
  const { defaultValue, toKey, toOption, loadOptions, onChange, onCreate, creatable, ...rest } = props;
  const defaultItems = toDefaultItems(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const [lastValue, setLastValue] = useState<string>();
  const [timer, setTimer] = useState<number>();
  const [abortController, setAbortController] = useState<AbortController>();
  const [autoSubmit, setAutoSubmit] = useState<boolean>();
  const [selected, setSelected] = useState<AsyncAutocompleteOption<T>[]>(defaultItems.map(toOption));
  const [options, setOptions] = useState<AsyncAutocompleteOption<T>[]>([]);

  const lastValueRef = useRef<string>();
  lastValueRef.current = lastValue;

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

    const value = inputRef.current?.value.trim() || '';
    if (value === lastValueRef.current) {
      // Nothing has changed, move on
      return;
    }

    setLastValue(value);

    const newAbortController = new AbortController();
    setAbortController(newAbortController);

    loadOptions(value, newAbortController.signal)
      .then((newValues: T[]) => {
        if (!newAbortController.signal.aborted) {
          setOptions(newValues.map(toOption));
          setAbortController(undefined);
          if (autoSubmitRef.current) {
            if (newValues.length > 0) {
              onChange(newValues.slice(0, 1));
            }
            setAutoSubmit(false);
          }
        }
      })
      .catch((err) => {
        if (!(newAbortController.signal.aborted || err.message.includes('aborted'))) {
          showNotification({ color: 'red', message: normalizeErrorString(err) });
        }
      });
  }, [loadOptions, onChange, toOption]);

  const handleSearchChange = useCallback((): void => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setAbortController(undefined);
    }

    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
    }

    const newTimer = window.setTimeout(() => handleTimer(), 100);
    setTimer(newTimer);
  }, [handleTimer]);

  const handleChange = useCallback(
    (values: string[]): void => {
      const result: T[] = [];
      const newSelected: AsyncAutocompleteOption<T>[] = [];
      for (const value of values) {
        let option = optionsRef.current?.find((option) => option.value === value);
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
    [creatable, onChange, onCreate, toOption]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        if (!timerRef.current && !abortControllerRef.current) {
          killEvent(e);
          if (optionsRef.current && optionsRef.current.length > 0) {
            setOptions(optionsRef.current.slice(0, 1));
            handleChange([optionsRef.current[0].value]);
          }
        } else {
          // The user pressed enter, but we don't have results yet.
          // We need to wait for the results to come in.
          setAutoSubmit(true);
        }
      }
    },
    [handleChange]
  );

  const handleCreate = useCallback(
    (input: string): AsyncAutocompleteOption<T> => {
      const option = toOption((onCreate as (input: string) => T)(input));
      setOptions([...(optionsRef.current as AsyncAutocompleteOption<T>[]), option]);
      return option;
    },
    [onCreate, setOptions, toOption]
  );

  const handleFilter = useCallback((_value: string, selected: boolean) => !selected, []);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return (
    <MultiSelect
      {...rest}
      ref={inputRef}
      defaultValue={defaultItems.map(toKey)}
      searchable
      onKeyDown={handleKeyDown}
      onSearchChange={handleSearchChange}
      data={[...selected, ...options]}
      onFocus={handleTimer}
      onChange={handleChange}
      onCreate={handleCreate}
      rightSectionWidth={40}
      rightSection={abortController ? <Loader size={16} /> : null}
      filter={handleFilter}
      creatable
      withinPortal={true}
    />
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
