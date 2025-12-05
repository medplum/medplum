// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { MfaForm } from './MfaForm';

export default {
  title: 'Medplum/Auth/MfaForm',
  component: MfaForm,
} as Meta;

export function Basic(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <Document width={400} px="xl" py="xl" bdrs="md">
        <MfaForm
          title="Verify with MFA"
          description="Enter the code from your authenticator app."
          buttonText="Submit Code"
          onSubmit={(formData) => console.log('Submitted:', formData)}
        />
      </Document>
    </div>
  );
}

export function WithQrCode(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <Document width={400} px="xl" py="xl" bdrs="md">
        <MfaForm
          title="Set up MFA"
          description="Scan this QR code with your authenticator app, then enter the verification code below."
          buttonText="Verify"
          qrCodeUrl="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=Example"
          onSubmit={(formData) => console.log('Submitted:', formData)}
        />
      </Document>
    </div>
  );
}
