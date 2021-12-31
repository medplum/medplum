import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { ReferenceInput } from '../ReferenceInput';

export default {
  title: 'Medplum/ReferenceInput',
  component: ReferenceInput,
} as Meta;

export const TargetProfile = (): JSX.Element => (
  <Document>
    <ReferenceInput
      name="foo"
      property={{
        type: [
          {
            code: 'reference',
            targetProfile: ['Practitioner', 'Patient'],
          },
        ],
      }}
    />
  </Document>
);

export const FreeText = (): JSX.Element => (
  <Document>
    <ReferenceInput
      name="foo"
      property={{
        type: [
          {
            code: 'reference',
          },
        ],
      }}
    />
  </Document>
);
