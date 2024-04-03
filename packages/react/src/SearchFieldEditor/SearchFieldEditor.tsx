import { Button, Group, Modal, MultiSelect, Stack } from '@mantine/core';
import {
  InternalTypeSchema,
  SearchRequest,
  getDataType,
  getSearchParameters,
  sortStringArray,
  stringify,
} from '@medplum/core';
import { SearchParameter } from '@medplum/fhirtypes';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildFieldNameString } from '../SearchControl/SearchUtils';

export interface SearchFieldEditorProps {
  readonly visible: boolean;
  readonly search: SearchRequest;
  readonly onOk: (search: SearchRequest) => void;
  readonly onCancel: () => void;
}

export function SearchFieldEditor(props: SearchFieldEditorProps): JSX.Element | null {
  const wasDropdownOpen = useRef(false);
  const [state, setState] = useState({
    search: JSON.parse(stringify(props.search)) as SearchRequest,
  });

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    setState({ search: props.search });
  }, [props.search]);

  const allFields = useMemo(() => {
    if (!props.visible) {
      return [];
    }

    const resourceType = props.search.resourceType;
    const typeSchema = getDataType(resourceType);
    const searchParams = getSearchParameters(resourceType);
    return sortStringArray(getFieldsList(typeSchema, searchParams)).map((field) => {
      return { value: field, label: buildFieldNameString(field) };
    });
  }, [props.visible, props.search.resourceType]);

  if (!props.visible) {
    return null;
  }

  function handleChange(newFields: string[]): void {
    setState({ search: { ...state.search, fields: newFields } });
  }

  return (
    <Modal
      title="Fields"
      closeButtonProps={{ 'aria-label': 'Close' }}
      opened={props.visible}
      onClose={() => {
        props.onCancel();
      }}
      size="auto"
      /*
      By default, the MultiSelect dropdown does not interact well with Modal's closeOnClickOutside:
      When the MultiSelect's dropdown is opened and the user clicks outside of the dropdown to close it
      (and outside the modal, i.e. clicks on the Modal's overlay), the Modal is undesirably also closed
      from the same click.

      Due to the sequencing of the events fired during a click on the overlay and when React
      rerenders of various components occur, it is not possible to simply do something such as setting
      closeOnClickOutside={!isDropdownOpened}:

      * user begins a click on the overlay which triggers
      * mousedown event on the overlay which triggers
      * blur event on the MultiSelect's input element which invokes
      * the MultiSelect.onDropdownClose callback which calls setIsDropdownOpen(false) which causes
      * rerender of SearchFieldEditor with isDropdownOpen set to false
      * the user ends the click which triggers
      * click event on the Modal which activates the closeOnClickOutside logic
      * since isDropdownOpen is false, closeOnClickOutside is true, so the Modal closes

      Instead, emulate closeOnClickOutside's behavior only when the MultiSelect dropdown
      was not open at the beginning of the click
      */
      withOverlay
      closeOnClickOutside={false}
      overlayProps={{
        onMouseDownCapture: () => {
          // capture whether the MultiSelect dropdown is open when a click on the overlay begins (i.e. mousedown)
          wasDropdownOpen.current = isDropdownOpen;
        },
        onClick: () => {
          if (!wasDropdownOpen.current) {
            // invoke onCancel callback since the dropdown wasn't open at the start of the click on the overlay
            props.onCancel();
          }

          // not strictly needed since onMouseDownCapture should always precede onClick, but reset the ref
          wasDropdownOpen.current = false;
        },
        children: <div data-testid="overlay-child" />, // can't specify testid on the overlay itself
      }}
    >
      <Stack>
        <MultiSelect
          // withinPortal={true}
          style={{ width: 550 }}
          placeholder="Select fields to display"
          data={allFields}
          value={state.search.fields ?? []}
          onChange={handleChange}
          onDropdownOpen={() => setIsDropdownOpen(true)}
          onDropdownClose={() => setIsDropdownOpen(false)}
          /* shows at most ~6.5 items; the extra half to provide a hint that there are more entries to scroll through */
          maxDropdownHeight="250px"
          // dropdownPosition="bottom"
          clearButtonProps={{ 'aria-label': 'Clear selection' }}
          clearable
          searchable
        />
        <Group justify="flex-end">
          <Button onClick={() => props.onOk(state.search)}>OK</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/**
 * Returns a list of fields/columns available for a type.
 * The result is the union of properties and search parameters.
 * @param typeSchema - The type definition.
 * @param searchParams - The search parameters.
 * @returns A list of fields/columns available for a resource type.
 */
function getFieldsList(
  typeSchema: InternalTypeSchema,
  searchParams: Record<string, SearchParameter> | undefined
): string[] {
  const result = [] as string[];
  const keys = new Set<string>();
  const names = new Set<string>();

  // Add properties first
  for (const key of Object.keys(typeSchema.elements)) {
    result.push(key);
    keys.add(key.toLowerCase());
    names.add(buildFieldNameString(key));
  }

  // Add search parameters if unique
  if (searchParams) {
    for (const code of Object.keys(searchParams)) {
      const name = buildFieldNameString(code);
      if (!keys.has(code) && !names.has(name)) {
        result.push(code);
        keys.add(code);
        names.add(name);
      }
    }
  }

  return result;
}
