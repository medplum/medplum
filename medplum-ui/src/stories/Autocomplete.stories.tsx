import { Meta } from '@storybook/react';
import React from 'react';
import { Autocomplete, AutocompleteProps } from '../Autocomplete';

export default {
  title: 'MedPlum/Autocomplete',
  component: Autocomplete,
} as Meta;

export const Basic = (args: AutocompleteProps) => (
  <Autocomplete id="foo" resourceType="Patient" />
);
