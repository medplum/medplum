// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProjectMembership } from '@medplum/fhirtypes';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { ChooseProfileForm } from './ChooseProfileForm';

export default {
  title: 'Medplum/Auth/ChooseProfileForm',
  component: ChooseProfileForm,
} as Meta;

export function FewMemberships(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--mantine-color-gray-0)' }}>
      <Document width={400} px="xl" py="xl" bdrs="md">
        <ChooseProfileForm
          login="x"
          memberships={[
            makeMembership('prod', 'Prod', 'Homer Simpson'),
            makeMembership('staging', 'Staging', 'Homer Simpson'),
          ]}
          handleAuthResponse={console.log}
        />
      </Document>
    </div>
  );
}

export function ManyMemberships(): JSX.Element {
  const memberships = [];
  for (let i = 1; i <= 30; i++) {
    memberships.push(makeMembership('membership' + i, 'Project ' + i, 'Profile ' + i));
  }
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--mantine-color-gray-0)' }}>
      <Document width={400} px="xl" py="xl" bdrs="md">
        <ChooseProfileForm login="x" memberships={memberships} handleAuthResponse={console.log} />
      </Document>
    </div>
  );
}

export function MultipleMembershipsInProject(): JSX.Element {
  const memberships = [];
  for (let i = 1; i <= 3; i++) {
    memberships.push(makeMembership('membership' + i, 'Project ' + i, 'Profile ' + i, 'Label ' + i));
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--mantine-color-gray-0)' }}>
      <Document width={400} px="xl" py="xl" bdrs="md">
        <ChooseProfileForm login="x" memberships={memberships} handleAuthResponse={console.log} />
      </Document>
    </div>
  );
}

function makeMembership(id: string, projectName: string, profileName: string, label?: string): ProjectMembership {
  return {
    resourceType: 'ProjectMembership',
    id,
    project: { reference: 'Project/' + projectName, display: projectName },
    user: { reference: 'User/x', display: 'x' },
    profile: { reference: 'Practitioner/' + profileName, display: profileName },
    identifier: label ? [{ system: 'https://medplum.com/identifier/label', value: label }] : undefined,
  };
}
