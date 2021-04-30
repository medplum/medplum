import { Meta } from '@storybook/react';
import React from 'react';
import { Autocomplete, AutocompleteProps } from '../Autocomplete';
import { AuthProvider } from '../AuthProvider';

export default {
  title: 'MedPlum/Autocomplete',
  component: Autocomplete,
} as Meta;

export const Basic = (args: AutocompleteProps) => (
  <AuthProvider>
    <Autocomplete id="foo" resourceType="Patient" />
  </AuthProvider>
);
