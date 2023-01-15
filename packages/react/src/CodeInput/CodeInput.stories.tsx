import { ElementDefinition } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import React from 'react';
import { CodeInput } from './CodeInput';
import { Document } from '../Document/Document';

export default {
  title: 'Medplum/CodeInput',
  component: CodeInput,
} as Meta;

const projectFeaturesDefinition: ElementDefinition = {
  id: 'Project.features',
  path: 'Project.features',
  definition: 'A list of optional features that are enabled for the project.',
  min: 0,
  max: '*',
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
