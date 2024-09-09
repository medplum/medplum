import { Coding } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { CodingDisplay } from './CodingDisplay';

export default {
  title: 'Medplum/CodingDisplay',
  component: CodingDisplay,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <CodingDisplay
      value={{ system: 'http://loinc.org', code: '15074-8', display: 'Glucose [Moles/volume] in Blood' } as Coding}
    />
  </Document>
);
