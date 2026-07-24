// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Modal } from '@mantine/core';
import type { Filter } from '@medplum/core';
import type { SearchParameter } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useState } from 'react';
import { Form } from '../Form/Form';
import { ModalActionsFooter } from '../ModalActionsFooter/ModalActionsFooter';
import { ModalContentLayout } from '../ModalContentLayout/ModalContentLayout';
import { SearchFilterValueInput } from '../SearchFilterValueInput/SearchFilterValueInput';

export interface SearchFilterValueDialogProps {
  readonly title: string;
  readonly visible: boolean;
  readonly resourceType: string;
  readonly searchParam?: SearchParameter;
  readonly filter?: Filter;
  readonly defaultValue?: string;
  readonly onOk: (filter: Filter) => void;
  readonly onCancel: () => void;
}

export function SearchFilterValueDialog(props: SearchFilterValueDialogProps): JSX.Element | null {
  const [value, setValue] = useState(props.defaultValue ?? '');

  if (!props.searchParam || !props.filter) {
    return null;
  }

  function onOk(): void {
    props.onOk({ ...(props.filter as Filter), value });
  }

  return (
    <Modal title={props.title} size="xl" opened={props.visible} onClose={props.onCancel}>
      <Form onSubmit={onOk}>
        <ModalContentLayout
          footer={
            <ModalActionsFooter>
              <Button type="submit" fullWidth>
                OK
              </Button>
            </ModalActionsFooter>
          }
        >
          <SearchFilterValueInput
            resourceType={props.resourceType}
            searchParam={props.searchParam}
            defaultValue={value}
            autoFocus={true}
            onChange={setValue}
          />
        </ModalContentLayout>
      </Form>
    </Modal>
  );
}
