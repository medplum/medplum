import { IndexedStructureDefinition, SearchRequest } from '@medplum/core';
import { Meta } from '@storybook/react';
import React, { useState } from 'react';
import { Button } from '../Button';
import { SearchControl } from '../SearchControl';
import { SearchFieldEditor } from '../SearchFieldEditor';

export default {
  title: 'Medplum/SearchFieldEditor',
  component: SearchFieldEditor,
} as Meta;

export const Example = (): JSX.Element => {
  const [visible, setVisible] = useState<boolean>(false);
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
  });

  return (
    <>
      <Button onClick={() => setVisible(!visible)}>Fields</Button>
      <SearchControl
        search={search}
        checkboxesEnabled={true}
        onLoad={(e) => console.log('onLoad', e)}
        onClick={(e) => console.log('onClick', e)}
        onChange={(e) => {
          console.log('onChange', e);
          setSearch(e.definition);
        }}
      />
      <SearchFieldEditor
        schema={{} as IndexedStructureDefinition}
        search={search}
        visible={visible}
        onOk={(e) => setSearch(e)}
        onCancel={() => setVisible(false)}
      />
    </>
  );
};
