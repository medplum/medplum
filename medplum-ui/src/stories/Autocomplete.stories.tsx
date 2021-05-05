import { Meta } from '@storybook/react';
import React from 'react';
import { Autocomplete, AutocompleteProps } from '../Autocomplete';
import { Document } from '../Document';

export default {
  title: 'Medplum/Autocomplete',
  component: Autocomplete,
} as Meta;

export const Basic = (args: AutocompleteProps) => (
  <Document>
    <Autocomplete id="foo" resourceType="Patient" />
  </Document>
);
