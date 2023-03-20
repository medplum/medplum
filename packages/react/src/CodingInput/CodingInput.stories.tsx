import { ElementDefinition } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document/Document';
import { CodingInput } from './CodingInput';

export default {
  title: 'Medplum/CodingInput',
  component: CodingInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <CodingInput
      property={
        {
          binding: {
            valueSet: 'https://example.com/test',
          },
        } as ElementDefinition
      }
      name="code"
    />
  </Document>
);
