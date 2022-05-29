import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { FormSection } from '../FormSection';
import { Input } from '../Input';

export default {
  title: 'Medplum/FormSection',
  component: FormSection,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <FormSection title="Name" description="Friendly name description">
      <Input name="name" defaultValue="John Smith" />
    </FormSection>
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <FormSection title="Name" description="Friendly name description">
      <Input name="name" defaultValue="John Smith" />
    </FormSection>
  </Document>
);
