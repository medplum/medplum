// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProjectMembership } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { ChooseProfileForm } from './ChooseProfileForm';

describe('ChooseProfileForm', () => {
  test('Renders', () => {
    render(
      <MedplumProvider medplum={new MockClient()}>
        <ChooseProfileForm
          login="x"
          memberships={[
            makeMembership('prod', 'Prod', 'Homer Simpson'),
            makeMembership('staging', 'Staging', 'Homer Simpson'),
          ]}
          handleAuthResponse={console.log}
        />
      </MedplumProvider>
    );

    expect(screen.getByText('Choose profile')).toBeInTheDocument();
    expect(screen.getByText('Prod')).toBeInTheDocument();
    expect(screen.getByText('Staging')).toBeInTheDocument();
  });

  test('Filters', async () => {
    render(
      <MedplumProvider medplum={new MockClient()}>
        <ChooseProfileForm
          login="x"
          memberships={[
            makeMembership('prod', 'Prod', 'Homer Simpson'),
            makeMembership('staging', 'Staging', 'Homer Simpson'),
          ]}
          handleAuthResponse={console.log}
        />
      </MedplumProvider>
    );

    const input = screen.getByPlaceholderText('Search') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'prod' } });
    });

    expect(screen.getByText('Prod')).toBeInTheDocument();
    expect(screen.queryByText('Staging')).not.toBeInTheDocument();
  });

  test('No matches', async () => {
    render(
      <MedplumProvider medplum={new MockClient()}>
        <ChooseProfileForm
          login="x"
          memberships={[
            makeMembership('prod', 'Prod', 'Homer Simpson'),
            makeMembership('staging', 'Staging', 'Homer Simpson'),
          ]}
          handleAuthResponse={console.log}
        />
      </MedplumProvider>
    );

    const input = screen.getByPlaceholderText('Search') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'xyz' } });
    });

    expect(screen.queryByText('Prod')).not.toBeInTheDocument();
    expect(screen.queryByText('Staging')).not.toBeInTheDocument();
    expect(screen.getByText('Nothing found...')).toBeInTheDocument();
  });

  test('Displays identifier label', () => {
    render(
      <MedplumProvider medplum={new MockClient()}>
        <ChooseProfileForm
          login="x"
          memberships={[
            makeMembership('prod', 'Prod', 'Homer Simpson', 'Primary Care'),
            makeMembership('staging', 'Staging', 'Homer Simpson'),
          ]}
          handleAuthResponse={console.log}
        />
      </MedplumProvider>
    );

    expect(screen.getByText('Choose profile')).toBeInTheDocument();
    expect(screen.getByText(/Prod.*Primary Care/)).toBeInTheDocument();
  });
});

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
