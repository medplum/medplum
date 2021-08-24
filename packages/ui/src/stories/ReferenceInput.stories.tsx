import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { ReferenceInput } from '../ReferenceInput';

export default {
  title: 'Medplum/ReferenceInput',
  component: ReferenceInput,
} as Meta;

export const TargetProfile = () => (
  <Document>
    <ReferenceInput
      name="foo"
      property={{
        type: [{
          code: 'reference',
          targetProfile: ['Practitioner', 'Patient']
        }]
      }}
    />
  </Document>
);

export const FreeText = () => (
  <Document>
    <ReferenceInput
      name="foo"
      property={{
        type: [{
          code: 'reference'
        }]
      }}
    />
  </Document>
);
