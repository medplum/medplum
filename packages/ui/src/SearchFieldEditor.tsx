import { IndexedStructureDefinition, SearchRequest } from '@medplum/core';
import React, { useRef, useState } from 'react';
import { Dialog } from './Dialog';
import { buildFieldNameString } from './SearchUtils';

interface SearchFieldEditorProps {
  schema: IndexedStructureDefinition;
  visible: boolean;
  definition: SearchRequest;
  onOk: (definition: SearchRequest) => void;
  onCancel: () => void;
}

export function SearchFieldEditor(props: SearchFieldEditorProps) {
  const [state, setState] = useState({
    definition: JSON.parse(JSON.stringify(props.definition)) as SearchRequest
  });

  const availableRef = useRef<HTMLSelectElement>(null);
  const selectedRef = useRef<HTMLSelectElement>(null);

  /**
   * Handles a key down event on the "available" field.
   * If the user presses enter, it is a shortcut for the "Add" button.
   *
   * @param {KeyboardEvent} e The keyboard event.
   */
   function handleAvailableKeyDown_(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      onAddField_();
    }
  }

  /**
   * Handles a double click on the "available" field.
   * If the user double clicks an entry, it is a shortcut for the "Add" button.
   */
  function handleAvailableDoubleClick_() {
    onAddField_();
  }

  /**
   * Handles a key down event on the "available" field.
   * If the user presses enter, it is a shortcut for the "Add" button.
   *
   * @param {KeyboardEvent} e The keyboard event.
   */
  function handleSelectedKeyDown_(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      onRemoveField_();
    }
  }

  /**
   * Handles a double click on the "available" field.
   * If the user double clicks an entry, it is a shortcut for the "Add" button.
   */
  function handleSelectedDoubleClick_() {
    onRemoveField_();
  }

  /**
   * Handles a click on the "Add" button.
   * Moves the "available" selection into the "selected" list.
   */
  function onAddField_() {
    const currentField = state.definition.fields ?? [];
    const key = availableRef.current?.value;
    if (key) {
      const newFields = [...currentField, key];
      setState({
        definition: {
          ...state.definition,
          fields: newFields
        }
      });
    }
  }

  /**
   * Handles a click on the "Remove" button.
   * Moves the "selected" selection into the "available" list.
   */
  function onRemoveField_() {
    const currentField = state.definition.fields ?? [];
    const key = selectedRef.current?.value;
    if (key) {
      const newFields = [...currentField];
      newFields.splice(newFields.indexOf(key), 1);
      setState({
        definition: {
          ...state.definition,
          fields: newFields
        }
      });
    }
  }

  /**
   * Handles a click on the "Up" button.
   * Moves the selection up one position in the list.
   */
  function onMoveUp_() {
    const currentField = state.definition.fields ?? [];
    const field = selectedRef.current?.value;
    if (field) {
      const newFields = [...currentField];
      const index = newFields.indexOf(field);
      swapFields_(newFields, index, index - 1);

      setState({
        definition: {
          ...state.definition,
          fields: newFields
        }
      });
    }
  }

  /**
   * Handles a click on the "Down" button.
   * Moves the selection down one position in the list.
   */
  function onMoveDown_() {
    const currentField = state.definition.fields ?? [];
    const field = selectedRef.current?.value;
    if (field) {
      const newFields = [...currentField];
      const index = newFields.indexOf(field);
      swapFields_(newFields, index, index + 1);

      setState({
        definition: {
          ...state.definition,
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
  function swapFields_(fields: string[], i: number, j: number) {
    const temp = fields[i];
    fields[i] = fields[j];
    fields[j] = temp;
  }

  if (!props.visible) {
    return null;
  }

  const resourceType = props.definition.resourceType;
  const typeDef = props.schema.types[resourceType];

  const selected = state.definition.fields ?? [];
  const available = Object.keys(typeDef.properties).filter(field => !selected?.includes(field)).sort();

  return (
    <Dialog
      visible={props.visible}
      onOk={() => props.onOk(state.definition)}
      onCancel={props.onCancel}>
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
                  ref={availableRef}
                  size={15}
                  tabIndex={1}
                  style={{ width: '200px' }}
                  onKeyDown={e => handleAvailableKeyDown_(e)}
                  onDoubleClick={() => handleAvailableDoubleClick_()}
                >
                  {available.map(key => <option key={key} value={key}>{buildFieldNameString(props.schema, resourceType, key)}</option>)}
                </select>
              </td>
              <td colSpan={2} align="center">
                <select
                  ref={selectedRef}
                  size={15}
                  tabIndex={4}
                  style={{ width: '200px' }}
                  onKeyDown={e => handleSelectedKeyDown_(e)}
                  onDoubleClick={() => handleSelectedDoubleClick_()}
                >
                  {selected.map(key => <option key={key} value={key}>{buildFieldNameString(props.schema, resourceType, key)}</option>)}
                </select>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td align="center">
                <button className="btn btn-small" tabIndex={2} onClick={() => onAddField_()}>Add</button>
              </td>
              <td align="center">
                <button className="btn btn-small" tabIndex={3} onClick={() => onRemoveField_()}>Remove</button>
              </td>
              <td align="center">
                <button className="btn btn-small" tabIndex={5} onClick={() => onMoveUp_()}>Up</button>
              </td>
              <td align="center">
                <button className="btn btn-small" tabIndex={6} onClick={() => onMoveDown_()}>Down</button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Dialog>
  );
}
