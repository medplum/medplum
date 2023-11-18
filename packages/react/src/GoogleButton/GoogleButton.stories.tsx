import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { GoogleButton } from './GoogleButton';

export default {
  title: 'Medplum/GoogleButton',
  component: GoogleButton,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <GoogleButton handleGoogleCredential={console.log} googleClientId="xyz" />
  </Document>
);
