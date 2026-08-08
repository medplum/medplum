// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, OperationOutcomeError, serverError } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import type { JSX } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '../test-utils/render';
import { ResourceFormWithRequiredProfile } from './ResourceFormWithRequiredProfile';

const MISSING = 'http://example.com/StructureDefinition/missing';
const FLAKY = 'http://example.com/StructureDefinition/flaky';

describe('ResourceFormWithRequiredProfile', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.spyOn(medplum, 'requestProfileSchema').mockImplementation(async (profileUrl: string) => {
      if (profileUrl === MISSING) {
        // What a Medplum server actually returns for an uninstalled profile: `$expand-profile`
        // reports it as a 400, not a 404.
        throw new OperationOutcomeError(badRequest(`StructureDefinition profile with URL ${profileUrl} not found`));
      }
      throw new OperationOutcomeError(serverError(new Error('boom')));
    });
  });

  function renderForm(profileUrl: string): JSX.Element {
    return (
      <MedplumProvider medplum={medplum}>
        <ResourceFormWithRequiredProfile
          defaultValue={{ resourceType: 'Patient' }}
          onSubmit={vi.fn()}
          profileUrl={profileUrl}
          missingProfileMessage={<div>Profile is not installed</div>}
        />
      </MedplumProvider>
    );
  }

  test('shows the missing-profile message for a profile the server does not have', async () => {
    render(renderForm(MISSING));
    expect(await screen.findByText('Profile is not installed')).toBeInTheDocument();
  });

  test('a missing-profile verdict does not stick when profileUrl changes', async () => {
    const { rerender } = render(renderForm(MISSING));
    expect(await screen.findByText('Profile is not installed')).toBeInTheDocument();

    // Patient, ServiceRequest, and Device all have profiles and share the /:resourceType/new
    // route, so the component instance is reused across them. The previous profile's verdict must
    // not carry over to the next one.
    rerender(renderForm(FLAKY));
    await waitFor(() => {
      expect(screen.getByText(/Server error/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('Profile is not installed')).not.toBeInTheDocument();
  });
});
