import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { FormSection } from '../FormSection';
import { TextField } from '../TextField';

export default {
  title: 'Medplum/FormSection',
  component: FormSection,
} as Meta;

export const Basic = () => (
  <Document>
    <FormSection title="Name" description="Friendly name description">
      <TextField id="name" value="John Smith" />
    </FormSection>
  </Document>
);

export const DefaultValue = () => (
  <Document>
    <FormSection title="Name" description="Friendly name description">
      <TextField id="name" value="John Smith" />
    </FormSection>
  </Document>
);
