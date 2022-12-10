import { Loader, MultiSelect, MultiSelectProps, SelectItem } from '@mantine/core';
import React, { useEffect, useRef, useState } from 'react';
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
  onChange?: (item: T[]) => void;
  onCreate?: (input: string) => T;
}

export function AsyncAutocomplete<T>(props: AsyncAutocompleteProps<T>): JSX.Element {
  const { defaultValue, toKey, toOption, loadOptions, onChange, onCreate, ...rest } = props;
  const defaultItems = defaultValue ? (Array.isArray(defaultValue) ? defaultValue : [defaultValue]) : [];
  const inputRef = useRef<HTMLInputElement>(null);
  const [lastValue, setLastValue] = useState<string | undefined>(undefined);
  const [timer, setTimer] = useState<number>();
  const [abortController, setAbortController] = useState<AbortController>();
  const [autoSubmit, setAutoSubmit] = useState<boolean>();
  const [options, setOptions] = useState<AsyncAutocompleteOption<T>[]>(defaultItems?.map(toOption));

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

  function handleSearchChange(): void {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setAbortController(undefined);
    }

    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
    }

    const newTimer = window.setTimeout(() => handleTimer(), 100);
    setTimer(newTimer);
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') {
      if (!timerRef.current && !abortControllerRef.current) {
        killEvent(e);
        if (options.length > 0) {
          setOptions(options.slice(0, 1));
          handleChange([options[0].value]);
        }
      } else {
        // The user pressed enter, but we don't have results yet.
        // We need to wait for the results to come in.
        setAutoSubmit(true);
      }
    }
  }

  /**
   * Handles a timer tick event.
   * If the contents of the input have changed, sends xhr to the server
   * for updated contents.
   */
  function handleTimer(): void {
    setTimer(undefined);

    const value = inputRef.current?.value?.trim() || '';
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
              emitChange(newValues.slice(0, 1) as T[]);
            }
            setAutoSubmit(false);
          }
        }
      })
      .catch(console.log);
  }

  function handleChange(values: string[]): void {
    if (onChange) {
      const result: T[] = [];
      for (const value of values) {
        let item = optionsRef.current?.find((option) => option.value === value)?.resource;
        if (!item) {
          item = (onCreate as (input: string) => T)(value);
        }
        result.push(item);
      }
      emitChange(result);
    }
  }

  function emitChange(selectedValues: T[]): void {
    if (onChange) {
      onChange(selectedValues);
    }
  }

  function handleCreate(input: string): AsyncAutocompleteOption<T> {
    const option = toOption((onCreate as (input: string) => T)(input));
    setOptions([...(optionsRef.current as AsyncAutocompleteOption<T>[]), option]);
    return option;
  }

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
      data={options}
      onFocus={handleTimer}
      onChange={handleChange}
      onCreate={handleCreate}
      rightSectionWidth={40}
      rightSection={abortController ? <Loader size={16} /> : null}
      filter={(_value: string, selected: boolean) => !selected}
    />
  );
}
