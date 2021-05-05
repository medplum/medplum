import { Meta } from '@storybook/react';
import React from 'react';
import { FormSection, FormSectionProps } from '../FormSection';
import { TextField } from '../TextField';
import { Document } from '../Document';

export default {
  title: 'Medplum/FormSection',
  component: FormSection,
} as Meta;

export const Basic = (args: FormSectionProps) => (
  <Document>
    <FormSection title="Name" description="Friendly name description">
      <TextField id="name" value="John Smith" />
    </FormSection>
  </Document>
);

export const DefaultValue = (args: FormSectionProps) => (
  <Document>
    <FormSection title="Name" description="Friendly name description">
      <TextField id="name" value="John Smith" />
    </FormSection>
  </Document>
);
