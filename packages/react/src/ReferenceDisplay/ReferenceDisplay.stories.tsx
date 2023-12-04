import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ReferenceDisplay } from './ReferenceDisplay';

export default {
  title: 'Medplum/ReferenceDisplay',
  component: ReferenceDisplay,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <ReferenceDisplay value={{ reference: 'Patient/123', display: 'Homer Simpson' }} />
  </Document>
);
