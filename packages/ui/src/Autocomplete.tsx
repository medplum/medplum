import React, { useEffect, useRef, useState } from 'react';
import './Autocomplete.css';

export interface AutocompleteProps<T> {
  name: string;
  multiple?: boolean;
  autofocus?: boolean;
  defaultValue?: T[];
  loadOptions: (input: string) => Promise<T[]>;
  getId: (item: T) => string;
  getIcon?: (item: T) => JSX.Element;
  getDisplay: (item: T) => JSX.Element;
  onChange?: (values: T[]) => void;
  onCreateNew?: () => void;
}

interface AutocompleteState<T> {
  focused: boolean,
  lastValue: string,
  dropDownVisible: boolean,
  values: T[],
  options: T[],
  selectedIndex: number
}

export function Autocomplete<T>(props: AutocompleteProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState({
    focused: false,
    lastValue: '',
    dropDownVisible: false,
    values: props.defaultValue ?? [],
    options: [],
    selectedIndex: -1
  } as AutocompleteState<T>);

  const stateRef = useRef<AutocompleteState<T>>(state);
  stateRef.current = state;

  useEffect(() => {
    const interval = setInterval(() => handleTimer(), 150);
    return () => clearInterval(interval);
  }, []);

  /**
   * Adds an resource to the list of selected resources.
   * @param resource The resource.
   */
  function addResource(resource: T): void {
    const inputElement = inputRef.current as HTMLInputElement;
    inputElement.value = '';

    const newValues = props.multiple ? [...state.values, resource] : [resource];

    setState({
      focused: true,
      dropDownVisible: false,
      lastValue: '',
      values: newValues,
      options: [],
      selectedIndex: -1
    });

    if (props.onChange) {
      props.onChange(newValues);
    }
  }

  function handleClick(): void {
    inputRef.current?.focus();
  }

  function handleFocus(): void {
    setState({ ...stateRef.current, focused: true });
  }

  function handleBlur(): void {
    setState({ ...stateRef.current, focused: false });
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
        e.preventDefault();
        e.stopPropagation();
        break;

      case 'ArrowDown':
        moveSelection(1);
        e.preventDefault();
        e.stopPropagation();
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
   * Try to add an resource with tryAddResource.  On success, cancel event.
   * Otherwise, let the browser handle the enter key normally.
   *
   * @param e The key down event.
   */
  function handleSelectKey(e: React.KeyboardEvent): void {
    if (tryAddResource()) {
      e.preventDefault();
      e.stopPropagation();
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

    const currState = stateRef.current;
    if (currState.values && currState.values.length > 0) {
      // If there are selected items,
      // then delete the last item.
      setState({ ...currState, values: currState.values.slice(0, currState.values.length - 1) });
      e.preventDefault();
      e.stopPropagation();
    }
  }

  /**
   * Handles a "separator" key (comma, semicolon, others?).
   *
   * The separator key logic is:
   * If the drop down is visible and something is selected, choose that.
   * If the drop down is visible but nothing is selected, choose the first.
   * If there is content in the input, use that as a "gray" resource.
   * Otherwise, ignore.
   *
   * @param e The key down event.
   */
  function handleSeparatorKey(e: React.KeyboardEvent): void {
    tryAddResource();
    e.preventDefault();
    e.stopPropagation();
    inputRef.current?.focus();
  }

  /**
   * Tries to capture the existing input as an resource.
   *
   * @return True if captured an resource; false otherwise.
   */
  function tryAddResource(): boolean {
    let resource: T | undefined;

    const currState = stateRef.current;
    if (currState.selectedIndex >= 0 && currState.selectedIndex < currState.options.length) {
      // Currently highlighted row
      resource = currState.options[currState.selectedIndex];

    } else if (currState.selectedIndex === -1 && currState.options.length > 0) {
      // Default to first row
      resource = currState.options[0];
    }

    if (!resource) {
      return false;
    }

    addResource(resource);
    return true;
  }

  /**
   * Handles a timer tick event.
   * If the contents of the input have changed, sends xhr to the server
   * for updated contents.
   */
  function handleTimer() {
    const value = inputRef.current?.value?.trim() || '';
    const currState = stateRef.current;
    if (value === currState.lastValue) {
      // Nothing has changed, move on
      return;
    }

    if (!value) {
      setState({
        ...currState,
        dropDownVisible: false,
        lastValue: '',
        options: [],
        selectedIndex: -1
      });
      return;
    }

    setState({ ...currState, lastValue: value });

    props.loadOptions(value)
      .then((resources: T[]) => {
        setState({
          ...stateRef.current,
          dropDownVisible: resources.length > 0,
          options: resources
        });
      })
      .catch(console.log);
  }

  /**
   * Moves the selected row.
   * @param delta The amount to move the selection, up is negative.
   */
  function moveSelection(delta: number) {
    const currState = stateRef.current;
    const options = currState.options;
    let index = currState.selectedIndex + delta;

    if (index < 0) {
      index = 0;
    } else if (index >= options.length) {
      index = options.length - 1;
    }

    setState({
      ...currState,
      selectedIndex: index
    });
  }

  /**
   * Handles a hover event.
   * @param e The mouse event.
   */
  function handleDropDownHover(e: React.MouseEvent) {
    const target = e.currentTarget as HTMLElement;
    if (!target) {
      return;
    }

    const indexStr = target.dataset.index;
    if (!indexStr) {
      return;
    }

    setState({
      ...stateRef.current,
      selectedIndex: parseInt(indexStr)
    });
  }

  /**
   * Handles a click event.
   * @param e The mouse event.
   */
  function handleDropDownClick(e: React.MouseEvent) {
    const target = e.currentTarget as HTMLElement;
    if (!target) {
      return;
    }

    const indexStr = target.dataset.index;
    if (!indexStr) {
      return;
    }

    const index = parseInt(indexStr);
    if (isNaN(index) || index < 0) {
      return;
    }

    const options = stateRef.current.options;
    if (index >= options.length) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    addResource(options[index]);
  }

  /**
   * Dismisses the drop down menu after a slight delay.
   */
  function dismissOnDelay() {
    window.setTimeout(() => {
      setState({ ...stateRef.current, dropDownVisible: false });
    }, 200);
  }

  return (
    <div
      data-testid="autocomplete"
      className={'medplum-autocomplete-container' + (state.focused ? ' focused' : '')}
      onClick={() => handleClick()}>
      <input
        type="hidden"
        id={props.name}
        name={props.name}
        data-testid="hidden"
        value={state.values.map(r => JSON.stringify(r)).join(',')} />
      <ul onClick={() => handleClick()}>
        {state.values.map(value => (
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
      {state.dropDownVisible && (
        <div className="medplum-autocomplete" data-testid="dropdown">
          {state.options.map((option, index) => (
            <div
              key={props.getId(option)}
              data-index={index}
              className={index === state.selectedIndex ? "medplum-autocomplete-row medplum-autocomplete-active" : "medplum-autocomplete-row"}
              onMouseOver={e => handleDropDownHover(e)}
              onClick={e => handleDropDownClick(e)}
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
