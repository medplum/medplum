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
    <Document width={450}>
      <ChooseProfileForm
        login="x"
        memberships={[
          makeMembership('prod', 'Prod', 'Homer Simpson'),
          makeMembership('staging', 'Staging', 'Homer Simpson'),
        ]}
        handleAuthResponse={console.log}
      />
    </Document>
  );
}

export function ManyMemberships(): JSX.Element {
  const memberships = [];
  for (let i = 1; i <= 30; i++) {
    memberships.push(makeMembership('membership' + i, 'Project ' + i, 'Profile ' + i));
  }
  return (
    <Document width={450}>
      <ChooseProfileForm login="x" memberships={memberships} handleAuthResponse={console.log} />
    </Document>
  );
}

export function MultipleMembershipsInProject(): JSX.Element {
  const memberships = [];
  for (let i = 1; i <= 3; i++) {
    memberships.push(makeMembership('membership' + i, 'Project ' + i, 'Profile ' + i, 'Label ' + i));
  }

  return (
    <Document width={450}>
      <ChooseProfileForm login="x" memberships={memberships} handleAuthResponse={console.log} />
    </Document>
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
