import { Meta } from '@storybook/react';
import React from 'react';
import { SearchControl, SearchControlProps } from '../SearchControl';

export default {
  title: 'Medplum/SearchControl',
  component: SearchControl,
} as Meta;

export const Checkboxes = (args: SearchControlProps) => (
  <SearchControl
    search={{
      resourceType: 'Patient'
    }}
    onLoad={e => console.log('onLoad', e)}
    onChange={e => console.log('onChange', e)}
    onClick={e => console.log('onClick', e)}
    checkboxesEnabled={true}
  />
);

export const NoCheckboxes = (args: SearchControlProps) => (
  <SearchControl
    search={{
      resourceType: 'Patient'
    }}
    onLoad={e => console.log('onLoad', e)}
    onChange={e => console.log('onChange', e)}
    onClick={e => console.log('onClick', e)}
  />
);
