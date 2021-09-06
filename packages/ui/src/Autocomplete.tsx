import React, { useEffect, useRef, useState } from 'react';
import { killEvent } from './utils/dom';
import './Autocomplete.css';

export interface AutocompleteProps<T> {
  name: string;
  multiple?: boolean;
  autofocus?: boolean;
  defaultValue?: T[];
  className?: string;
  placeholder?: string;
  loadOptions: (input: string) => Promise<T[]>;
  buildUnstructured?: (input: string) => T;
  getId: (item: T) => string;
  getIcon?: (item: T) => JSX.Element;
  getDisplay: (item: T) => JSX.Element;
  onChange?: (values: T[]) => void;
  onCreateNew?: () => void;
}

export function Autocomplete<T>(props: AutocompleteProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [lastValue, setLastValue] = useState('');
  const [dropDownVisible, setDropDownVisible] = useState(false);
  const [values, setValues] = useState(props.defaultValue ?? []);
  const [options, setOptions] = useState<T[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const lastValueRef = useRef<string>();
  lastValueRef.current = lastValue;

  useEffect(() => {
    const interval = setInterval(handleTimer, 150);
    return () => clearInterval(interval);
  }, []);

  /**
   * Adds an option to the list of selected options.
   * @param option The option.
   */
  function addOption(option: T): void {
    const inputElement = inputRef.current as HTMLInputElement;
    inputElement.value = '';

    const newValues = props.multiple ? [...values, option] : [option];
    setFocused(true);
    setDropDownVisible(false);
    setLastValue('');
    setValues(newValues);
    setOptions([]);
    setSelectedIndex(-1);

    if (props.onChange) {
      props.onChange(newValues);
    }
  }

  function handleClick(): void {
    inputRef.current?.focus();
  }

  function handleFocus(): void {
    setFocused(true);
  }

  function handleBlur(): void {
    setFocused(false);
    dismissOnDelay();
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    switch (e.key) {
      case 'Enter':
      case 'Tab':
        handleSelectKey(e);
        break;

      case 'ArrowUp':
        moveSelection(-1);
        killEvent(e);
        break;

      case 'ArrowDown':
        moveSelection(1);
        killEvent(e);
        break;

      case 'Backspace':
        handleBackspaceKey(e);
        break;

      case ',':
      case ';':
        handleSeparatorKey(e);
    }
  }

  /**
   * Handles the "enter" or "tab" keys.  The enter key logic is:
   * Try to add an option with tryAddOption.  On success, cancel event.
   * Otherwise, let the browser handle the enter key normally.
   *
   * @param e The key down event.
   */
  function handleSelectKey(e: React.KeyboardEvent): void {
    if (tryAddOption()) {
      killEvent(e);
      inputRef.current?.focus();
    }
  }

  /**
   * Handles the "backspace" key.  The backspace key logic is:
   * If the input is empty and there is at least one item, delete the last item.
   * Otherwise, let the browser handle the backspace key normally.
   *
   * @param e The key down event.
   */
  function handleBackspaceKey(e: React.KeyboardEvent): void {
    if (inputRef.current?.value) {
      // If there is still text in the input,
      // then handle backspace as normal.
      return;
    }

    if (values.length > 0) {
      // If there are selected items,
      // then delete the last item.
      killEvent(e);
      setValues(values.slice(0, values.length - 1));
    }
  }

  /**
   * Handles a "separator" key (comma, semicolon, others?).
   *
   * The separator key logic is:
   * If the drop down is visible and something is selected, choose that.
   * If the drop down is visible but nothing is selected, choose the first.
   * If there is content in the input, use that as a "gray" option.
   * Otherwise, ignore.
   *
   * @param e The key down event.
   */
  function handleSeparatorKey(e: React.KeyboardEvent): void {
    tryAddOption();
    killEvent(e);
    inputRef.current?.focus();
  }

  /**
   * Tries to capture the existing input as an option.
   *
   * @return True if captured an option; false otherwise.
   */
  function tryAddOption(): boolean {
    let option: T | undefined;

    if (selectedIndex >= 0 && selectedIndex < options.length) {
      // Currently highlighted row
      option = options[selectedIndex];

    } else if (selectedIndex === -1 && options.length > 0) {
      // Default to first row
      option = options[0];

    } else if (props.buildUnstructured && inputRef.current?.value) {
      // Build semi-structured item
      option = props.buildUnstructured(inputRef.current.value);
    }

    if (!option) {
      return false;
    }

    addOption(option);
    return true;
  }

  /**
   * Handles a timer tick event.
   * If the contents of the input have changed, sends xhr to the server
   * for updated contents.
   */
  function handleTimer() {
    const value = inputRef.current?.value?.trim() || '';
    if (value === lastValueRef.current) {
      // Nothing has changed, move on
      return;
    }

    if (!value) {
      setDropDownVisible(false);
      setLastValue('');
      setOptions([]);
      setSelectedIndex(-1);
      return;
    }

    setLastValue(value);

    props.loadOptions(value)
      .then((newOptions: T[]) => {
        setDropDownVisible(newOptions.length > 0);
        setOptions(newOptions);
      })
      .catch(console.log);
  }

  /**
   * Moves the selected row.
   * @param delta The amount to move the selection, up is negative.
   */
  function moveSelection(delta: number) {
    let index = selectedIndex + delta;

    if (index < 0) {
      index = 0;
    } else if (index >= options.length) {
      index = options.length - 1;
    }

    setSelectedIndex(index);
  }

  /**
   * Handles a hover event.
   * @param e The mouse event.
   * @param index The drop down option index.
   */
  function handleDropDownHover(e: React.MouseEvent, index: number): void {
    setSelectedIndex(index);
  }

  /**
   * Handles a click event.
   * @param e The mouse event.
   * @param option The drop down option.
   */
  function handleDropDownClick(e: React.MouseEvent, option: T): void {
    killEvent(e);
    addOption(option);
  }

  /**
   * Dismisses the drop down menu after a slight delay.
   */
  function dismissOnDelay() {
    window.setTimeout(() => {
      setDropDownVisible(false);
    }, 200);
  }

  const baseClassName = props.className ?? 'medplum-autocomplete-container';

  return (
    <div
      data-testid="autocomplete"
      className={baseClassName + (focused ? ' focused' : '')}
      onClick={() => handleClick()}>
      <input
        type="hidden"
        id={props.name}
        name={props.name}
        data-testid="hidden"
        value={values.map(r => JSON.stringify(r)).join(',')} />
      <ul onClick={() => handleClick()}>
        {values.map(value => (
          <li
            key={props.getId(value)}
            data-testid="selected"
            className="choice">
            {props.getDisplay(value)}
          </li>
        ))}
        <li>
          <input
            type="text"
            autoFocus={props.autofocus}
            placeholder={values.length === 0 ? props.placeholder : undefined}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck="true"
            onFocus={() => handleFocus()}
            onBlur={() => handleBlur()}
            onKeyDown={(e: React.KeyboardEvent) => handleKeyDown(e)}
            ref={inputRef}
            data-testid="input-element"
          />
        </li>
      </ul>
      {dropDownVisible && (
        <div className="medplum-autocomplete" data-testid="dropdown">
          {options.map((option, index) => (
            <div
              key={props.getId(option)}
              className={index === selectedIndex ? "medplum-autocomplete-row medplum-autocomplete-active" : "medplum-autocomplete-row"}
              onMouseOver={e => handleDropDownHover(e, index)}
              onClick={e => handleDropDownClick(e, option)}
            >
              {props.getIcon && (
                <div className="medplum-autocomplete-icon">{props.getIcon(option)}</div>
              )}
              <div className="medplum-autocomplete-label">{props.getDisplay(option)}</div>
            </div>
          ))}
          {props.onCreateNew && (
            <div className="medplum-autocomplete-row" onClick={props.onCreateNew}>
              <div className="medplum-autocomplete-label">Create new...</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
