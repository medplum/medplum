import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ReferenceInput } from './ReferenceInput';

export default {
  title: 'Medplum/ReferenceInput',
  component: ReferenceInput,
} as Meta;

export const TargetProfile = (): JSX.Element => (
  <Document>
    <ReferenceInput name="foo" targetTypes={['Practitioner', 'Patient']} />
  </Document>
);

export const FreeText = (): JSX.Element => (
  <Document>
    <ReferenceInput name="foo" />
  </Document>
);

export const JustDefaultValue = (): JSX.Element => (
  <Document>
    <ReferenceInput
      name="foo"
      defaultValue={{
        reference: 'Patient/123',
      }}
    />
  </Document>
);
