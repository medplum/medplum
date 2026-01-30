// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, locationUtils } from '@medplum/core';
import type { ClientApplication, Patient } from '@medplum/fhirtypes';
import { HomerEncounter, HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import { SMART_APP_LAUNCH_PATIENT_IDENTIFIER_SYSTEM, SmartAppLaunchLink } from './SmartAppLaunchLink';

describe('SmartAppLaunchLink', () => {
  function setup(children: ReactNode, medplum: MockClient): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Happy path', async () => {
    const mockAssign = jest.fn();
    locationUtils.assign = mockAssign;

    const medplum = new MockClient();

    setup(
      <SmartAppLaunchLink
        client={{ resourceType: 'ClientApplication', launchUri: 'https://example.com' }}
        patient={createReference(HomerSimpson)}
        encounter={createReference(HomerEncounter)}
      >
        My SmartAppLaunchLink
      </SmartAppLaunchLink>,
      medplum
    );

    expect(screen.getByText('My SmartAppLaunchLink')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('My SmartAppLaunchLink'));
    });

    await waitFor(() => expect(mockAssign).toHaveBeenCalled());

    const url = mockAssign.mock.calls[0][0];
    expect(url).toContain('https://example.com');
    expect(url).toContain('launch=');
    expect(url).toContain('iss=');
  });

  test('Includes patient identifier in SmartAppLaunch when extension is present', async () => {
    const mockAssign = jest.fn();
    locationUtils.assign = mockAssign;

    const medplum = new MockClient();

    const patientWithIdentifier: Patient = {
      resourceType: 'Patient',
      id: 'test-patient-with-hg-id',
      identifier: [
        {
          system: 'https://healthgorilla.com/patient-id',
          value: '0e4af968e733693405e943e1',
        },
        {
          system: 'http://example.com/mrn',
          value: 'MRN12345',
        },
      ],
      name: [{ given: ['Test'], family: 'Patient' }],
    };

    const clientWithExtension: ClientApplication = {
      resourceType: 'ClientApplication',
      launchUri: 'https://sandbox.healthgorilla.com/app/patient-chart/launch',
      extension: [
        {
          url: SMART_APP_LAUNCH_PATIENT_IDENTIFIER_SYSTEM,
          valueString: 'https://healthgorilla.com/patient-id',
        },
      ],
    };

    // Pre-load the patient in the mock client
    await medplum.createResource(patientWithIdentifier);

    setup(
      <SmartAppLaunchLink client={clientWithExtension} patient={createReference(patientWithIdentifier)}>
        Health Gorilla App
      </SmartAppLaunchLink>,
      medplum
    );

    expect(screen.getByText('Health Gorilla App')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Health Gorilla App'));
    });

    await waitFor(() => expect(mockAssign).toHaveBeenCalled());

    // Verify the URL contains the expected launch parameters
    const url = mockAssign.mock.calls[0][0];
    expect(url).toContain('https://sandbox.healthgorilla.com/app/patient-chart/launch');
    expect(url).toContain('launch=');
    expect(url).toContain('iss=');

    // Extract the launch ID from the URL and verify the SmartAppLaunch resource
    const launchId = new URL(url).searchParams.get('launch');
    expect(launchId).toBeDefined();

    const smartAppLaunch = await medplum.readResource('SmartAppLaunch', launchId as string);
    expect(smartAppLaunch.patient?.reference).toBe('Patient/test-patient-with-hg-id');
    expect(smartAppLaunch.patient?.identifier).toEqual({
      system: 'https://healthgorilla.com/patient-id',
      value: '0e4af968e733693405e943e1',
    });
  });

  test('Does not include identifier in SmartAppLaunch when extension is absent', async () => {
    const mockAssign = jest.fn();
    locationUtils.assign = mockAssign;

    const medplum = new MockClient();

    const patientWithIdentifier: Patient = {
      resourceType: 'Patient',
      id: 'test-patient-no-ext',
      identifier: [
        {
          system: 'https://healthgorilla.com/patient-id',
          value: '0e4af968e733693405e943e1',
        },
      ],
      name: [{ given: ['Test'], family: 'Patient' }],
    };

    const clientWithoutExtension: ClientApplication = {
      resourceType: 'ClientApplication',
      launchUri: 'https://example.com/launch',
    };

    await medplum.createResource(patientWithIdentifier);

    setup(
      <SmartAppLaunchLink client={clientWithoutExtension} patient={createReference(patientWithIdentifier)}>
        App Without Extension
      </SmartAppLaunchLink>,
      medplum
    );

    await act(async () => {
      fireEvent.click(screen.getByText('App Without Extension'));
    });

    await waitFor(() => expect(mockAssign).toHaveBeenCalled());

    // Extract the launch ID and verify the SmartAppLaunch resource has no identifier
    const url = mockAssign.mock.calls[0][0];
    const launchId = new URL(url).searchParams.get('launch');
    expect(launchId).toBeDefined();

    const smartAppLaunch = await medplum.readResource('SmartAppLaunch', launchId as string);
    expect(smartAppLaunch.patient?.reference).toBe('Patient/test-patient-no-ext');
    expect(smartAppLaunch.patient?.identifier).toBeUndefined();
  });

  test('Does not include identifier in SmartAppLaunch when identifier not found on patient', async () => {
    const mockAssign = jest.fn();
    locationUtils.assign = mockAssign;

    const medplum = new MockClient();

    const patientWithDifferentIdentifier: Patient = {
      resourceType: 'Patient',
      id: 'test-patient-diff-id',
      identifier: [
        {
          system: 'http://example.com/other-system',
          value: 'some-value',
        },
      ],
      name: [{ given: ['Test'], family: 'Patient' }],
    };

    const clientWithExtension: ClientApplication = {
      resourceType: 'ClientApplication',
      launchUri: 'https://example.com/launch',
      extension: [
        {
          url: SMART_APP_LAUNCH_PATIENT_IDENTIFIER_SYSTEM,
          valueString: 'https://healthgorilla.com/patient-id',
        },
      ],
    };

    await medplum.createResource(patientWithDifferentIdentifier);

    setup(
      <SmartAppLaunchLink client={clientWithExtension} patient={createReference(patientWithDifferentIdentifier)}>
        App With Missing Identifier
      </SmartAppLaunchLink>,
      medplum
    );

    await act(async () => {
      fireEvent.click(screen.getByText('App With Missing Identifier'));
    });

    await waitFor(() => expect(mockAssign).toHaveBeenCalled());

    // Extract the launch ID and verify the SmartAppLaunch resource has no identifier
    const url = mockAssign.mock.calls[0][0];
    const launchId = new URL(url).searchParams.get('launch');
    expect(launchId).toBeDefined();

    const smartAppLaunch = await medplum.readResource('SmartAppLaunch', launchId as string);
    expect(smartAppLaunch.patient?.reference).toBe('Patient/test-patient-diff-id');
    expect(smartAppLaunch.patient?.identifier).toBeUndefined();
  });
});
