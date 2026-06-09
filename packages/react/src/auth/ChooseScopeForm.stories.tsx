// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { ChooseScopeForm } from './ChooseScopeForm';

export default {
  title: 'Medplum/Auth/ChooseScopeForm',
  component: ChooseScopeForm,
} as Meta;

const medplum = new MockClient();

export function Basic(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <Document width={400} px="xl" py="xl" bdrs="md">
        <MedplumProvider medplum={medplum}>
          <ChooseScopeForm login="test@example.com" scope={undefined} handleAuthResponse={console.log} />
        </MedplumProvider>
      </Document>
    </div>
  );
}

export function WithOpenIdScope(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <Document width={500} px="xl" py="xl" bdrs="md">
        <MedplumProvider medplum={medplum}>
          <ChooseScopeForm login="test@example.com" scope="openid" handleAuthResponse={console.log} />
        </MedplumProvider>
      </Document>
    </div>
  );
}

export function WithConditionScope(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <Document width={500} px="xl" py="xl" bdrs="md">
        <MedplumProvider medplum={medplum}>
          <ChooseScopeForm login="test@example.com" scope="patient/Condition.*" handleAuthResponse={console.log} />
        </MedplumProvider>
      </Document>
    </div>
  );
}

export function WithObservationScope(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <Document width={500} px="xl" py="xl" bdrs="md">
        <MedplumProvider medplum={medplum}>
          <ChooseScopeForm login="test@example.com" scope="patient/Observation.*" handleAuthResponse={console.log} />
        </MedplumProvider>
      </Document>
    </div>
  );
}

export function WithMultipleScopes(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <Document width={500} px="xl" py="xl" bdrs="md">
        <MedplumProvider medplum={medplum}>
          <ChooseScopeForm
            login="test@example.com"
            scope="openid profile patient/Condition.* patient/Observation.*"
            handleAuthResponse={console.log}
          />
        </MedplumProvider>
      </Document>
    </div>
  );
}

export function CustomBranding(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <Document width={500} px="xl" py="xl" bdrs="md">
        <MedplumProvider medplum={medplum}>
          <ChooseScopeForm
            login="test@example.com"
            scope="openid patient/Condition.* patient/Observation.*"
            handleAuthResponse={console.log}
            logo={
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--mantine-color-blue-6)', letterSpacing: '-0.5px' }}>
                MyApp
              </div>
            }
            title="Grant Access"
            submitLabel="Allow"
          >
            <p style={{ fontSize: '0.875rem', color: 'var(--mantine-color-dimmed)', textAlign: 'center' }}>
              This app would like to access the following data from your health record.
            </p>
          </ChooseScopeForm>
        </MedplumProvider>
      </Document>
    </div>
  );
}
