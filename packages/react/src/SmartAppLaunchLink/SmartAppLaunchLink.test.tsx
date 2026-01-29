// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, locationUtils } from '@medplum/core';
import type { ClientApplication, Patient, SmartAppLaunch } from '@medplum/fhirtypes';
import { HomerEncounter, HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import { SMART_APP_LAUNCH_PATIENT_IDENTIFIER_SYSTEM, SmartAppLaunchLink } from './SmartAppLaunchLink';

// Mock useResource to return the patient synchronously
let mockPatientResource: Patient | undefined;

jest.mock('@medplum/react-hooks', () => {
  const actual = jest.requireActual('@medplum/react-hooks');
  return {
    ...actual,
    useResource: jest.fn((reference) => {
      // If reference is provided and matches our test patient, return it
      if (reference && typeof reference === 'object' && 'reference' in reference && mockPatientResource) {
        const refStr = reference.reference;
        if (refStr === `Patient/${mockPatientResource.id}`) {
          return mockPatientResource;
        }
      }
      return undefined;
    }),
  };
});

describe('SmartAppLaunchLink', () => {
  beforeEach(() => {
    mockPatientResource = undefined;
    jest.clearAllMocks();
  });

  function setup(children: ReactNode, medplum = new MockClient()): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Happy path', async () => {
    const mockAssign = jest.fn();
    locationUtils.assign = mockAssign;

    setup(
      <SmartAppLaunchLink
        client={{ resourceType: 'ClientApplication', launchUri: 'https://example.com' }}
        patient={createReference(HomerSimpson)}
        encounter={createReference(HomerEncounter)}
      >
        My SmartAppLaunchLink
      </SmartAppLaunchLink>
    );

    expect(screen.getByText('My SmartAppLaunchLink')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('My SmartAppLaunchLink'));
    });

    await waitFor(() => expect(mockAssign).toHaveBeenCalled());
    expect(mockAssign).toHaveBeenCalled();

    const url = mockAssign.mock.calls[0][0];
    expect(url).toContain('https://example.com');
    expect(url).toContain('launch=');
    expect(url).toContain('iss=');
  });

  test('Includes patient identifier in SmartAppLaunch when extension is present', async () => {
    const mockAssign = jest.fn();
    locationUtils.assign = mockAssign;

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

    // Set the mock patient resource so useResource returns it
    mockPatientResource = patientWithIdentifier;

    const medplum = new MockClient();
    // Mock createResource to return a successful response
    const createResourceSpy = jest.spyOn(medplum, 'createResource').mockResolvedValue({
      resourceType: 'SmartAppLaunch',
      id: 'test-launch-id',
    } as SmartAppLaunch & { id: string });

    const patientReference = createReference(patientWithIdentifier);
    setup(
      <SmartAppLaunchLink client={clientWithExtension} patient={patientReference}>
        Health Gorilla App
      </SmartAppLaunchLink>,
      medplum
    );

    expect(screen.getByText('Health Gorilla App')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Health Gorilla App'));
    });

    await waitFor(() => expect(mockAssign).toHaveBeenCalled());

    // Verify the SmartAppLaunch was created with the patient identifier
    expect(createResourceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'SmartAppLaunch',
        patient: expect.objectContaining({
          reference: 'Patient/test-patient-with-hg-id',
          identifier: {
            system: 'https://healthgorilla.com/patient-id',
            value: '0e4af968e733693405e943e1',
          },
        }),
      })
    );

    const url = mockAssign.mock.calls[0][0];
    expect(url).toContain('https://sandbox.healthgorilla.com/app/patient-chart/launch');
    expect(url).toContain('launch=');
    expect(url).toContain('iss=');
  });

  test('Does not include identifier in SmartAppLaunch when extension is absent', async () => {
    const mockAssign = jest.fn();
    locationUtils.assign = mockAssign;

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

    const medplum = new MockClient();
    await medplum.createResource(patientWithIdentifier);

    const createResourceSpy = jest.spyOn(medplum, 'createResource');

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

    // Verify the SmartAppLaunch was created without an identifier
    const smartAppLaunchCall = createResourceSpy.mock.calls.find(
      (call) => (call[0] as SmartAppLaunch).resourceType === 'SmartAppLaunch'
    );
    expect(smartAppLaunchCall).toBeDefined();
    expect((smartAppLaunchCall?.[0] as SmartAppLaunch).patient?.identifier).toBeUndefined();
  });

  test('Does not include identifier in SmartAppLaunch when identifier not found on patient', async () => {
    const mockAssign = jest.fn();
    locationUtils.assign = mockAssign;

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

    const medplum = new MockClient();
    await medplum.createResource(patientWithDifferentIdentifier);

    const createResourceSpy = jest.spyOn(medplum, 'createResource');

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

    // Verify the SmartAppLaunch was created without an identifier (since no matching identifier found)
    const smartAppLaunchCall = createResourceSpy.mock.calls.find(
      (call) => (call[0] as SmartAppLaunch).resourceType === 'SmartAppLaunch'
    );
    expect(smartAppLaunchCall).toBeDefined();
    expect((smartAppLaunchCall?.[0] as SmartAppLaunch).patient?.identifier).toBeUndefined();
  });
});
