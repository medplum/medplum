import { Filter } from '@medplum/core';
import { SearchParameter } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { Dialog } from './Dialog';
import { Form } from './Form';
import { SearchFilterValueInput } from './SearchFilterValueInput';

export interface SearchFilterValueDialogProps {
  title: string;
  visible: boolean;
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

  function onOk(): void {
    props.onOk({ ...(props.filter as Filter), value });
  }

  return (
    <Dialog title={props.title} visible={props.visible} onOk={onOk} onCancel={props.onCancel}>
      <div style={{ width: 500 }}>
        <Form onSubmit={onOk}>
          <SearchFilterValueInput
            resourceType={props.resourceType}
            searchParam={props.searchParam}
            defaultValue={value}
            autoFocus={true}
            onChange={setValue}
          />
        </Form>
      </div>
    </Dialog>
  );
}
