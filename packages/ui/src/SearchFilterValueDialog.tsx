import { Filter, IndexedStructureDefinition } from '@medplum/core';
import { SearchParameter } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { Dialog } from './Dialog';
import { SearchFilterValueInput } from './SearchFilterValueInput';

export interface SearchFilterValueDialogProps {
  title: string;
  visible: boolean;
  schema: IndexedStructureDefinition;
  resourceType: string;
  searchParam?: SearchParameter;
  filter?: Filter;
  defaultValue?: string;
  onOk: (filter: Filter) => void;
  onCancel: () => void;
}

export function SearchFilterValueDialog(props: SearchFilterValueDialogProps): JSX.Element | null {
  const [value, setValue] = useState<string>(props.defaultValue ?? '');

  if (!props.visible || !props.searchParam || !props.filter) {
    return null;
  }

  return (
    <Dialog
      title={props.title}
      visible={props.visible}
      onOk={() => props.onOk({ ...(props.filter as Filter), value })}
      onCancel={props.onCancel}
    >
      <div style={{ width: 500 }}>
        <SearchFilterValueInput
          schema={props.schema}
          resourceType={props.resourceType}
          searchParam={props.searchParam}
          defaultValue={value}
          onChange={setValue}
        />
      </div>
    </Dialog>
  );
}
