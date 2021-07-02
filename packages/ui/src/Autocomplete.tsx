import { Bundle, getDisplayString, Operator } from '@medplum/core';
import React, { useEffect, useRef, useState } from 'react';
import { useMedplum } from './MedplumProvider';
import './Autocomplete.css';

interface AutocompleteResource {
  id: string,
  name: string,
  url: string
}

export interface AutocompleteProps {
  id: string,
  resourceType: string,
  multiple?: boolean,
  autofocus?: boolean,
  defaultValue?: AutocompleteResource[],
  createNew?: string
}

interface AutocompleteState {
  focused: boolean,
  lastValue: string,
  dropDownVisible: boolean,
  values: AutocompleteResource[],
  options: AutocompleteResource[],
  selectedIndex: number
}

export function Autocomplete(props: AutocompleteProps) {
  const medplum = useMedplum();
  const inputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState({
    focused: false,
    lastValue: '',
    dropDownVisible: false,
    values: [],
    options: [],
    selectedIndex: -1
  } as AutocompleteState);

  const stateRef = useRef<AutocompleteState>(state);
  stateRef.current = state;

  useEffect(() => {
    const interval = window.setInterval(() => handleTimer(), 150);
    return () => window.clearInterval(interval);
  }, []);

  /**
   * Adds an resource to the list of selected resources.
   *
   * @param {!AutocompleteResource} resource The resource.
   */
  function addResource(resource: AutocompleteResource) {
    const inputElement = inputRef.current;
    if (!inputElement) {
      return;
    }

    if (props.createNew && resource.id === '__createNew') {
      const name = inputElement.value;
      const next = window.location.href;
      const url = props.createNew + '?name=' + encodeURIComponent(name) + '&next=' + encodeURIComponent(next);
      window.location.href = url;
      return true;
    }

    inputElement.value = '';

    setState({
      focused: true,
      dropDownVisible: false,
      lastValue: '',
      values: props.multiple ? [...state.values, resource] : [resource],
      options: [],
      selectedIndex: -1
    });
  }

  function handleClick() {
    const inputElement = inputRef.current;
    if (inputElement) {
      inputElement.focus();
    }
  }

  function handleFocus() {
    const state = stateRef.current;
    setState({ ...state, focused: true });
  }

  function handleBlur() {
    const state = stateRef.current;
    setState({ ...state, focused: false });
    dismissOnDelay();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'Enter':
        handleEnterKey(e);
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

      case 'Tab':
        handleTabKey(e);
        break;

      case ',':
      case ';':
        handleSeparatorKey(e);
    }
  }

  /**
   * Handles the "enter" key.  The enter key logic is:
   * Try to add an resource with tryAddResource.  On success, cancel event.
   * Otherwise, let the browser handle the enter key normally.
   *
   * @param {KeyboardEvent} e The key down event.
   */
  function handleEnterKey(e: React.KeyboardEvent) {
    const inputElement = inputRef.current;
    if (!inputElement) {
      return;
    }

    if (tryAddResource()) {
      e.preventDefault();
      e.stopPropagation();
      inputElement.focus();
    }
  }

  /**
   * Handles the "backspace" key.  The backspace key logic is:
   * If the input is empty and there is at least one item, delete the last item.
   * Otherwise, let the browser handle the backspace key normally.
   *
   * @param {KeyboardEvent} e The key down event.
   */
  function handleBackspaceKey(e: React.KeyboardEvent) {
    const inputElement = inputRef.current;
    if (!inputElement) {
      return;
    }

    const value = inputElement.value;
    if (value.length > 0) {
      // If there is still text in the input,
      // then handle backspace as normal.
      return;
    }

    const state = stateRef.current;
    if (state.values && state.values.length > 0) {
      // If there are selected items,
      // then delete the last item.
      setState({ ...state, values: state.values.slice(0, state.values.length - 1) });
      e.preventDefault();
      e.stopPropagation();
    }
  }

  /**
   * Handles the "tab" key.  The tab key logic is:
   * Try to add an resource with tryAddResource.  On success, cancel event.
   * Otherwise, let the browser handle the tab key normally.
   *
   * @param {KeyboardEvent} e The key down event.
   */
  function handleTabKey(e: React.KeyboardEvent) {
    const inputElement = inputRef.current;
    if (!inputElement) {
      return;
    }

    if (tryAddResource()) {
      e.preventDefault();
      e.stopPropagation();
      inputElement.focus();
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
   * @param {KeyboardEvent} e The key down event.
   */
  function handleSeparatorKey(e: React.KeyboardEvent) {
    const inputElement = inputRef.current;
    if (!inputElement) {
      return false;
    }

    tryAddResource();
    e.preventDefault();
    e.stopPropagation();
    inputElement.focus();
  }

  /**
   * Tries to capture the existing input as an resource.
   *
   * @return {boolean} True if captured an resource; false otherwise.
   */
  function tryAddResource() {
    const inputElement = inputRef.current;
    if (!inputElement) {
      return false;
    }

    let resource;

    const state = stateRef.current;
    if (state.selectedIndex >= 0 && state.selectedIndex < state.options.length) {
      // Currently highlighted row
      resource = state.options[state.selectedIndex];

    } else if (state.selectedIndex === -1 && state.options.length > 0) {
      // Default to first row
      resource = state.options[0];

    } else if (inputElement.value) {
      // Otherwise create an unstructured resource
      resource = {
        id: '',
        name: inputElement.value,
        url: ''
      };
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
   *
   */
  const handleTimer = () => {
    const inputElement = inputRef.current;
    if (!inputElement) {
      return;
    }

    const value = inputElement.value.trim();
    const state = stateRef.current;
    if (value === state.lastValue) {
      // Nothing has changed, move on
      return;
    }

    if (!value) {
      setState({
        ...state,
        dropDownVisible: false,
        lastValue: '',
        options: [],
        selectedIndex: -1
      });
      return;
    }

    setState({ ...state, lastValue: value });

    medplum.search({
      resourceType: props.resourceType,
      filters: [{
        code: 'name',
        operator: Operator.EQUALS,
        value: value
      }]
    })
      .then((e: Bundle) => handleResponse(e))
      .catch(console.log);
  };

  /**
   * Handles the HTTP response.
   *
   * @param {Object} response The HTTP response body in JSON.
   */
  function handleResponse(response: Bundle) {
    const resources = [];

    if (props.createNew) {
      resources.push({
        id: '__createNew',
        name: 'Create new...',
        url: 'https://static.medplum.com/img/plus.png'
      });
    }

    if (response.entry) {
      response.entry.forEach(entry => {
        if (entry.resource) {
          resources.push({
            id: entry.resource.id,
            name: getDisplayString(entry.resource),
            url: '',
          });
        }
      });
    }

    const state = stateRef.current;
    setState({
      ...state,
      dropDownVisible: resources.length > 0,
      options: resources
    });
  }

  /**
   * Moves the selected row.
   *
   * @param {number} delta The amount to move the selection, up is negative.
   */
  function moveSelection(delta: number) {
    const state = stateRef.current;
    const options = state.options;
    let index = state.selectedIndex + delta;

    if (index < 0) {
      index = 0;
    } else if (index >= options.length) {
      index = options.length - 1;
    }

    setState({
      ...state,
      selectedIndex: index
    });
  }

  /**
   * Handles a hover event.
   *
   * @param {MouseEvent} e The mouse event.
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

    const state = stateRef.current;
    setState({
      ...state,
      selectedIndex: parseInt(indexStr)
    });
  }

  /**
   * Handles a click event.
   *
   * @param {MouseEvent} e The mouse event.
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
    if (isNaN(index) || index < 0 || index >= state.options.length) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    addResource(state.options[index]);
  }

  /**
   * Dismisses the drop down menu after a slight delay.
   */
  function dismissOnDelay() {
    window.setTimeout(() => {
      const state = stateRef.current;
      setState({ ...state, dropDownVisible: false });
    }, 200);
  }

  return (
    <div
      className={'medplum-autocomplete-container' + (state.focused ? ' focused' : '')}
      onClick={() => handleClick()}>
      <input
        type="hidden"
        id={props.id}
        name={props.id}
        value={state.values.map(r => JSON.stringify(r)).join(',')} />
      <ul onClick={() => handleClick()}>
        {state.values.map(value => (
          <li
            key={value.id}
            className={value.id === '' ? 'unstructured choice' : 'choice'}>
            {value.name}
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
          />
        </li>
      </ul>
      {state.dropDownVisible && (
        <div className="medplum-autocomplete">
          {state.options.map((option, index) => (
            <div
              key={option.id}
              data-index={index}
              className={index === state.selectedIndex ? "medplum-autocomplete-row medplum-autocomplete-active" : "medplum-autocomplete-row"}
              onMouseOver={e => handleDropDownHover(e)}
              onClick={e => handleDropDownClick(e)}
            >
              <div className="medplum-autocomplete-icon"><img src={option.url} width="40" height="40" /></div>
              <div className="medplum-autocomplete-label"><p>{option.name}</p></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
