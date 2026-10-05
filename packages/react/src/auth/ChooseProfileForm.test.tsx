// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProjectMembership } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { ChooseProfileForm } from './ChooseProfileForm';

describe('ChooseProfileForm', () => {
  beforeEach(() => {
    window.localStorage.removeItem('medplum.recentProjects');
  });

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

    expect(screen.getByText('Choose a Project')).toBeInTheDocument();
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

    const input = screen.getByPlaceholderText('Search');
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

    const input = screen.getByPlaceholderText('Search');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'xyz' } });
    });

    expect(screen.queryByText('Prod')).not.toBeInTheDocument();
    expect(screen.queryByText('Staging')).not.toBeInTheDocument();
    expect(screen.getByText('Nothing found...')).toBeInTheDocument();
  });

  test('Sorts by most recently used', () => {
    window.localStorage.setItem('medplum.recentProjects', JSON.stringify({ staging: 2000, prod: 1000 }));

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

    const options = screen.getAllByRole('option').map((el) => el.textContent);
    expect(options[0]).toContain('Staging');
    expect(options[1]).toContain('Prod');
  });

  test('Records most recently used project on selection', async () => {
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

    await act(async () => {
      fireEvent.click(screen.getByText('Staging'));
    });

    const recentProjects = JSON.parse(window.localStorage.getItem('medplum.recentProjects') as string);
    expect(recentProjects.staging).toBeDefined();
  });

  test('Evicts the oldest project once the recent-projects cap is exceeded', async () => {
    // MAX_RECENT_PROJECTS is 10; seed it full with old-0 (timestamp 1) as the oldest entry.
    const seeded: Record<string, number> = {};
    for (let i = 0; i < 10; i++) {
      seeded[`old-${i}`] = i + 1;
    }
    window.localStorage.setItem('medplum.recentProjects', JSON.stringify(seeded));

    render(
      <MedplumProvider medplum={new MockClient()}>
        <ChooseProfileForm
          login="x"
          memberships={[makeMembership('new-project', 'New', 'Homer Simpson')]}
          handleAuthResponse={console.log}
        />
      </MedplumProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByText('New'));
    });

    const recentProjects = JSON.parse(window.localStorage.getItem('medplum.recentProjects') as string);
    expect(Object.keys(recentProjects)).toHaveLength(10);
    expect(recentProjects['old-0']).toBeUndefined();
    expect(recentProjects['new-project']).toBeDefined();
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

    expect(screen.getByText('Choose a Project')).toBeInTheDocument();
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
