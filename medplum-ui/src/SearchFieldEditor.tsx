import { schema, SearchDefinition } from 'medplum';
import React from 'react';
import { Dialog } from './Dialog';
import { buildFieldNameString } from './SearchUtils';

interface SearchFieldEditorProps {
  visible: boolean;
  definition: SearchDefinition;
  onOk: (definition: SearchDefinition) => void;
  onCancel: () => void;
}

interface SearchFieldEditorState {
  definition: SearchDefinition;
}

export class SearchFieldEditor extends React.Component<SearchFieldEditorProps, SearchFieldEditorState> {
  availableRef: React.RefObject<HTMLSelectElement>;
  selectedRef: React.RefObject<HTMLSelectElement>;

  constructor(props: SearchFieldEditorProps) {
    super(props);

    this.state = {
      definition: JSON.parse(JSON.stringify(props.definition))
    };

    this.availableRef = React.createRef();
    this.selectedRef = React.createRef();
  }

  render() {
    if (!this.props.visible) {
      return null;
    }

    const resourceType = this.props.definition.resourceType;
    const typeDef = schema[resourceType];

    const selected = this.state.definition.fields ?? [];
    const available = Object.keys(typeDef.properties).filter(field => !selected?.includes(field)).sort();

    return (
      <Dialog
        visible={this.props.visible}
        onOk={() => this.props.onOk(this.state.definition)}
        onCancel={this.props.onCancel}>
        <div>
          <table style={{ margin: 'auto' }}>
            <thead>
              <tr>
                <th colSpan={2} align="center">Available</th>
                <th colSpan={2} align="center">Selected</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={2} align="center">
                  <select
                    ref={this.availableRef}
                    size={15}
                    tabIndex={1}
                    style={{ width: '200px' }}
                    onKeyDown={e => this.handleAvailableKeyDown_(e)}
                    onDoubleClick={() => this.handleAvailableDoubleClick_()}
                  >
                    {available.map(key => <option key={key} value={key}>{buildFieldNameString(resourceType, key)}</option>)}
                  </select>
                </td>
                <td colSpan={2} align="center">
                  <select
                    ref={this.selectedRef}
                    size={15}
                    tabIndex={4}
                    style={{ width: '200px' }}
                    onKeyDown={e => this.handleSelectedKeyDown_(e)}
                    onDoubleClick={() => this.handleSelectedDoubleClick_()}
                  >
                    {selected.map(key => <option key={key} value={key}>{buildFieldNameString(resourceType, key)}</option>)}
                  </select>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td align="center">
                  <button className="btn btn-small" tabIndex={2} onClick={() => this.onAddField_()}>Add</button>
                </td>
                <td align="center">
                  <button className="btn btn-small" tabIndex={3} onClick={() => this.onRemoveField_()}>Remove</button>
                </td>
                <td align="center">
                  <button className="btn btn-small" tabIndex={5} onClick={() => this.onMoveUp_()}>Up</button>
                </td>
                <td align="center">
                  <button className="btn btn-small" tabIndex={6} onClick={() => this.onMoveDown_()}>Down</button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Dialog>
    );
  }

  componentDidUpdate(prevProps: SearchFieldEditorProps) {
    if (!prevProps.visible && this.props.visible) {
      this.setState({
        definition: JSON.parse(JSON.stringify(this.props.definition))
      });
    }
  }

  /**
   * Handles a key down event on the "available" field.
   * If the user presses enter, it is a shortcut for the "Add" button.
   *
   * @param {KeyboardEvent} e The keyboard event.
   */
  private handleAvailableKeyDown_(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      this.onAddField_();
    }
  }

  /**
   * Handles a double click on the "available" field.
   * If the user double clicks an entry, it is a shortcut for the "Add" button.
   */
  private handleAvailableDoubleClick_() {
    this.onAddField_();
  }

  /**
   * Handles a key down event on the "available" field.
   * If the user presses enter, it is a shortcut for the "Add" button.
   *
   * @param {KeyboardEvent} e The keyboard event.
   */
  private handleSelectedKeyDown_(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      this.onRemoveField_();
    }
  }

  /**
   * Handles a double click on the "available" field.
   * If the user double clicks an entry, it is a shortcut for the "Add" button.
   */
  private handleSelectedDoubleClick_() {
    this.onRemoveField_();
  }

  /**
   * Handles a click on the "Add" button.
   * Moves the "available" selection into the "selected" list.
   */
  private onAddField_() {
    const currentField = this.state.definition.fields ?? [];
    var key = this.availableRef.current?.value;
    if (key) {
      let newFields = [...currentField, key];
      this.setState({
        definition: {
          ...this.state.definition,
          fields: newFields
        }
      });
    }
  }

  /**
   * Handles a click on the "Remove" button.
   * Moves the "selected" selection into the "available" list.
   */
  private onRemoveField_() {
    const currentField = this.state.definition.fields ?? [];
    var key = this.selectedRef.current?.value;
    if (key) {
      let newFields = [...currentField];
      newFields.splice(newFields.indexOf(key), 1);
      this.setState({
        definition: {
          ...this.state.definition,
          fields: newFields
        }
      });
    }
  }

  /**
   * Handles a click on the "Up" button.
   * Moves the selection up one position in the list.
   */
  private onMoveUp_() {
    const currentField = this.state.definition.fields ?? [];
    var field = this.selectedRef.current?.value;
    if (field) {
      let newFields = [...currentField];
      let index = newFields.indexOf(field);
      this.swapFields_(newFields, index, index - 1);

      this.setState({
        definition: {
          ...this.state.definition,
          fields: newFields
        }
      });
    }
  }

  /**
   * Handles a click on the "Down" button.
   * Moves the selection down one position in the list.
   */
  private onMoveDown_() {
    const currentField = this.state.definition.fields ?? [];
    var field = this.selectedRef.current?.value;
    if (field) {
      let newFields = [...currentField];
      let index = newFields.indexOf(field);
      this.swapFields_(newFields, index, index + 1);

      this.setState({
        definition: {
          ...this.state.definition,
          fields: newFields
        }
      });
    }
  }

  /**
   * Swaps two fields in the search.
   *
   * @param {number} i The index of the first field.
   * @param {number} j The index of the second field.
   */
  private swapFields_(fields: string[], i: number, j: number) {
    var temp = fields[i];
    fields[i] = fields[j];
    fields[j] = temp;
  }
}
