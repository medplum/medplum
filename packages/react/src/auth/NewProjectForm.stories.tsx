// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { Document } from '../Document/Document';
import { NewProjectForm } from './NewProjectForm';

export default {
  title: 'Medplum/Auth/NewProjectForm',
  component: NewProjectForm,
} as Meta;

const medplum = new MockClient();

export function Basic(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <Document width={400} px="xl" py="xl" bdrs="md">
        <MedplumProvider medplum={medplum}>
          <NewProjectForm login="test@example.com" handleAuthResponse={console.log} />
        </MedplumProvider>
      </Document>
    </div>
  );
}

export function WithError(): JSX.Element {
  const medplumWithError = new MockClient();
  // Mock startNewProject to throw an error
  medplumWithError.startNewProject = async () => {
    throw new Error('Project name is required');
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <Document width={400} px="xl" py="xl" bdrs="md">
        <MedplumProvider medplum={medplumWithError}>
          <NewProjectForm login="test@example.com" handleAuthResponse={console.log} />
        </MedplumProvider>
      </Document>
    </div>
  );
}

