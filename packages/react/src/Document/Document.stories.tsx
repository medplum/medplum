import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';

export default {
  title: 'Medplum/Document',
  component: Document,
} as Meta;

export const Basic = (): JSX.Element => <Document>Hello World</Document>;
