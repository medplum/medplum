import { Meta } from '@storybook/react';
import React from 'react';
import { Autocomplete, AutocompleteProps } from '../Autocomplete';
import { MedPlumProvider } from '../MedPlumProvider';
import { getMedPlumClient } from './util';

export default {
  title: 'MedPlum/Autocomplete',
  component: Autocomplete,
} as Meta;

export const Basic = (args: AutocompleteProps) => (
  <MedPlumProvider medplum={getMedPlumClient()}>
    <Autocomplete id="foo" resourceType="Patient" />
  </MedPlumProvider>
);
