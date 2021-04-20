import React from 'react';
// import { Bundle, FhirClient } from './fhirclient';
import { Bundle, FhirClient } from 'medplum';
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

export class Autocomplete extends React.Component<AutocompleteProps, AutocompleteState> {
  inputRef: React.RefObject<HTMLInputElement>;

  constructor(props: AutocompleteProps) {
    super(props);

    this.state = {
      focused: false,
      lastValue: '',
      dropDownVisible: false,
      values: [],
      options: [],
      selectedIndex: -1
    };

    this.inputRef = React.createRef();
  }

  render() {
    return (
      <div
        className={'medplum-autocomplete-container' + (this.state.focused ? ' focused' : '')}
        onClick={() => this.handleClick_()}>
        <input
          type="hidden"
          id={this.props.id}
          name={this.props.id}
          value={this.state.values.map(r => JSON.stringify(r)).join(',')} />
        <ul onClick={() => this.handleClick_()}>
          {this.state.values.map(value => (
            <li
              key={value.id}
              className={value.id === '' ? 'unstructured choice' : 'choice'}>
              {value.name}
            </li>
          ))}
          <li>
            <input
              ref={this.inputRef}
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="true"
              onFocus={() => this.handleFocus_()}
              onBlur={() => this.handleBlur_()}
              onKeyDown={(e: React.KeyboardEvent) => this.handleKeyDown_(e)}
            />
          </li>
        </ul>
        {this.state.dropDownVisible && (
          <div className="medplum-autocomplete">
            {this.state.options.map((option, index) => (
              <div
                key={option.id}
                data-index={index}
                className={index === this.state.selectedIndex ? "medplum-autocomplete-row medplum-autocomplete-active" : "medplum-autocomplete-row"}
                onMouseOver={e => this.handleDropDownHover_(e)}
                onClick={e => this.handleDropDownClick_(e)}
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

  /**
   * Adds an resource to the list of selected resources.
   *
   * @param {!AutocompleteResource} resource The resource.
   */
  addResource(resource: AutocompleteResource) {
    const inputElement = this.inputRef.current;
    if (!inputElement) {
      return;
    }

    if (this.props.createNew && resource.id === '__createNew') {
      const name = inputElement.value;
      const next = window.location.href;
      const url = this.props.createNew + '?name=' + encodeURIComponent(name) + '&next=' + encodeURIComponent(next);
      window.location.href = url;
      return true;
    }

    inputElement.value = '';

    this.setState({
      focused: true,
      dropDownVisible: false,
      lastValue: '',
      values: this.props.multiple ? [...this.state.values, resource] : [resource],
      options: [],
      selectedIndex: -1
    });
  }

  /**
   * Called when component's element is known to be in the document.
   */
  componentDidMount() {
    window.setInterval(() => this.handleTimer_(), 150);

    if (this.props.autofocus) {
      const inputElement = this.inputRef.current;
      if (inputElement) {
        inputElement.focus();
      }
    }
  }

  handleClick_() {
    const inputElement = this.inputRef.current;
    if (inputElement) {
      inputElement.focus();
    }
  }

  handleFocus_() {
    this.setState({ focused: true });
  }

  handleBlur_() {
    this.setState({ focused: false });
    this.dismissOnDelay_();
  }

  handleKeyDown_(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'Enter':
        this.handleEnterKey_(e);
        break;

      case 'ArrowUp':
        this.moveSelection_(-1);
        e.preventDefault();
        e.stopPropagation();
        break;

      case 'ArrowDown':
        this.moveSelection_(1);
        e.preventDefault();
        e.stopPropagation();
        break;

      case 'Backspace':
        this.handleBackspaceKey_(e);
        break;

      case 'Tab':
        this.handleTabKey_(e);
        break;

      case ',':
      case ';':
        this.handleSeparatorKey_(e);
    }
  }

  /**
   * Handles the "enter" key.  The enter key logic is:
   * Try to add an resource with tryAddResource.  On success, cancel event.
   * Otherwise, let the browser handle the enter key normally.
   *
   * @param {KeyboardEvent} e The key down event.
   */
  private handleEnterKey_(e: React.KeyboardEvent) {
    const inputElement = this.inputRef.current;
    if (!inputElement) {
      return;
    }

    if (this.tryAddResource_()) {
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
  private handleBackspaceKey_(e: React.KeyboardEvent) {
    const inputElement = this.inputRef.current;
    if (!inputElement) {
      return;
    }

    var value = inputElement.value;
    if (value.length > 0) {
      // If there is still text in the input,
      // then handle backspace as normal.
      return;
    }

    if (this.state.values && this.state.values.length > 0) {
      // If there are selected items,
      // then delete the last item.
      this.setState({ values: this.state.values.slice(0, this.state.values.length - 1) })
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
  private handleTabKey_(e: React.KeyboardEvent) {
    const inputElement = this.inputRef.current;
    if (!inputElement) {
      return;
    }

    if (this.tryAddResource_()) {
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
  private handleSeparatorKey_(e: React.KeyboardEvent) {
    const inputElement = this.inputRef.current;
    if (!inputElement) {
      return false;
    }

    this.tryAddResource_();
    e.preventDefault();
    e.stopPropagation();
    inputElement.focus();
  }

  /**
   * Tries to capture the existing input as an resource.
   *
   * @return {boolean} True if captured an resource; false otherwise.
   */
  private tryAddResource_() {
    const inputElement = this.inputRef.current;
    if (!inputElement) {
      return false;
    }

    var resource = null;

    if (this.state.selectedIndex >= 0 && this.state.selectedIndex < this.state.options.length) {
      // Currently highlighted row
      resource = this.state.options[this.state.selectedIndex];

    } else if (this.state.selectedIndex === -1 && this.state.options.length > 0) {
      // Default to first row
      resource = this.state.options[0];

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

    this.addResource(resource);
    return true;
  }

  /**
   * Handles a timer tick event.
   * If the contents of the input have changed, sends xhr to the server
   * for updated contents.
   *
   */
  private handleTimer_() {
    const inputElement = this.inputRef.current;
    if (!inputElement) {
      return;
    }

    var value = inputElement.value.trim();
    if (value === this.state.lastValue) {
      // Nothing has changed, move on
      return;
    }

    if (!value) {
      this.setState({
        dropDownVisible: false,
        lastValue: '',
        options: [],
        selectedIndex: -1
      });
      return;
    }

    // const endpoint = 'autocomplete?resourceType=' + encodeURIComponent(this.props.resourceType) + '&token=' + encodeURIComponent(value);

    // FhirClient.fetch('GET', endpoint)
    //   .then(e => this.handleResponse_(e))
    //   .catch(console.log);

    FhirClient.search({
      resourceType: this.props.resourceType,
      filters: [{
        key: 'name',
        op: 'eq',
        value: value
      }]
    })
      .then((e: Bundle) => this.handleResponse_(e))
      .catch(console.log);

    this.setState({ lastValue: value });
  }

  /**
   * Handles the HTTP response.
   *
   * @param {Object} response The HTTP response body in JSON.
   */
  private handleResponse_(response: Bundle) {
    console.log('response', response);
    // var resources = response['resources'];
    const resources = [];

    if (this.props.createNew) {
      resources.push({
        id: '__createNew',
        name: 'Create new...',
        url: 'https://static.medplum.com/img/plus.png'
      });
    }

    response.entry.map(entry => {
      resources.push({
        id: entry.resource.id,
        name: JSON.stringify(entry.resource.name),
        url: '',
      });
    });

    this.setState({
      dropDownVisible: resources.length > 0,
      options: resources
    });
  }

  /**
   * Moves the selected row.
   *
   * @param {number} delta The amount to move the selection, up is negative.
   */
  moveSelection_(delta: number) {
    const options = this.state.options;
    let index = this.state.selectedIndex + delta;

    if (index < 0) {
      index = 0;
    } else if (index >= options.length) {
      index = options.length - 1;
    }

    this.setState({
      selectedIndex: index
    });
  }

  /**
   * Handles a hover event.
   *
   * @param {MouseEvent} e The mouse event.
   */
  private handleDropDownHover_(e: React.MouseEvent) {
    const target = e.currentTarget as HTMLElement;
    if (!target) {
      return;
    }

    const indexStr = target.dataset.index;
    if (!indexStr) {
      return;
    }

    this.setState({
      selectedIndex: parseInt(indexStr)
    });
  }

  /**
   * Handles a click event.
   *
   * @param {MouseEvent} e The mouse event.
   */
  private handleDropDownClick_(e: React.MouseEvent) {
    const target = e.currentTarget as HTMLElement;
    if (!target) {
      return;
    }

    const indexStr = target.dataset.index;
    if (!indexStr) {
      return;
    }

    const index = parseInt(indexStr);
    if (isNaN(index) || index < 0 || index >= this.state.options.length) {
      return;
    }

    this.addResource(this.state.options[index]);
  }

  /**
   * Dismisses the drop down menu after a slight delay.
   */
  private dismissOnDelay_() {
    window.setTimeout(() => this.setState({ dropDownVisible: false }), 200);
  }
}
