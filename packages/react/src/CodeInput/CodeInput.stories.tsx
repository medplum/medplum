import { InternalSchemaElement } from '@medplum/core';
import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document/Document';
import { CodeInput } from './CodeInput';

export default {
  title: 'Medplum/CodeInput',
  component: CodeInput,
} as Meta;

const projectFeaturesDefinition: InternalSchemaElement = {
  path: 'Project.features',
  description: 'A list of optional features that are enabled for the project.',
  min: 0,
  max: Infinity,
  isArray: true,
  type: [
    {
      code: 'code',
    },
  ],
};

export const Basic = (): JSX.Element => (
  <Document>
    <CodeInput name="foo" property={projectFeaturesDefinition} onChange={console.log} />
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <CodeInput name="foo" property={projectFeaturesDefinition} defaultValue="bots" onChange={console.log} />
  </Document>
);
