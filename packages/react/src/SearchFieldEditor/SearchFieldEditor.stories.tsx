// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SearchRequest } from '@medplum/core';
import { Meta } from '@storybook/react';
import { JSX, useState } from 'react';
import { SearchFieldEditor } from './SearchFieldEditor';

export default {
  title: 'Medplum/SearchFieldEditor',
  component: SearchFieldEditor,
} as Meta;

export const Basic = (): JSX.Element => {
  const [curSearch, setCurSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
    fields: ['name'],
  });

  return (
    <SearchFieldEditor search={curSearch} visible={true} onOk={setCurSearch} onCancel={() => console.log('onCancel')} />
  );
};
