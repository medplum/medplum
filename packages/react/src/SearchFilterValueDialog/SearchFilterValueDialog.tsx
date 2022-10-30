import { Button, Modal } from '@mantine/core';
import { Filter } from '@medplum/core';
import { SearchParameter } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { Form } from '../Form/Form';
import { SearchFilterValueInput } from '../SearchFilterValueInput/SearchFilterValueInput';

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
    <Modal title={props.title} size="xl" opened={props.visible} onClose={props.onCancel}>
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
      <Button onClick={onOk}>OK</Button>
    </Modal>
  );
}
