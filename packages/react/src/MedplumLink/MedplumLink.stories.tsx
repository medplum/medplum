import { HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { MedplumLink } from './MedplumLink';

export default {
  title: 'Medplum/MedplumLink',
  component: MedplumLink,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <MedplumLink to={HomerSimpson}>Link to Homer Simpson</MedplumLink>
  </Document>
);
