import { Meta } from '@storybook/react';
import React from 'react';
import { FormSection, FormSectionProps } from '../FormSection';
import { TextField } from '../TextField';

export default {
  title: 'MedPlum/FormSection',
  component: FormSection,
} as Meta;

export const Basic = (args: FormSectionProps) => (
  <FormSection title="Name" description="Friendly name description">
    <TextField id="name" value="John Smith" />
  </FormSection>
);

export const DefaultValue = (args: FormSectionProps) => (
  <FormSection title="Name" description="Friendly name description">
    <TextField id="name" value="John Smith" />
  </FormSection>
);
