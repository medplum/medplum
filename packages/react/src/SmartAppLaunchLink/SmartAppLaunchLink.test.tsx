// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import { createReference, locationUtils } from '@medplum/core';
import type { ClientApplication, Encounter, Patient } from '@medplum/fhirtypes';
import { HomerEncounter, HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import { SmartAppLaunchLink } from './SmartAppLaunchLink';

jest.mock('@mantine/notifications');

const medplum = new MockClient();

describe('SmartAppLaunchLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (showNotification as jest.Mock).mockClear();
  });

  function setup(children: ReactNode, clientMedplum = medplum): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={clientMedplum}>{children}</MedplumProvider>
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

  test('Patient identifier parameter', async () => {
    const mockAssign = jest.fn();
    locationUtils.assign = mockAssign;

    const patientWithIdentifier: Patient = {
      ...HomerSimpson,
      identifier: [
        {
          system: 'https://www.healthgorilla.com',
          value: 'hg-patient-123',
        },
      ],
    };

    const client: ClientApplication = {
      resourceType: 'ClientApplication',
      launchUri: 'https://example.com/launch',
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/smart-launch-url-parameter',
          extension: [
            { url: 'name', valueString: 'patient' },
            { url: 'sourceType', valueString: 'patientIdentifier' },
            { url: 'system', valueUri: 'https://www.healthgorilla.com' },
          ],
        },
      ],
    };

    const testMedplum = new MockClient();
    const createdPatient = await testMedplum.createResource(patientWithIdentifier);

    setup(
      <SmartAppLaunchLink client={client} patient={createReference(createdPatient)}>
        Launch App
      </SmartAppLaunchLink>,
      testMedplum
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Launch App'));
    });

    await waitFor(() => expect(mockAssign).toHaveBeenCalled());
    const url = new URL(mockAssign.mock.calls[0][0]);
    expect(url.searchParams.get('patient')).toBe('hg-patient-123');
    expect(url.searchParams.get('iss')).toBeTruthy();
    expect(url.searchParams.get('launch')).toBeTruthy();
  });

  test('Encounter identifier parameter', async () => {
    const mockAssign = jest.fn();
    locationUtils.assign = mockAssign;

    const encounterWithIdentifier: Encounter = {
      ...HomerEncounter,
      identifier: [
        {
          system: 'https://example.com/encounter-id',
          value: 'enc-123',
        },
      ],
    };

    const client: ClientApplication = {
      resourceType: 'ClientApplication',
      launchUri: 'https://example.com/launch',
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/smart-launch-url-parameter',
          extension: [
            { url: 'name', valueString: 'encounter' },
            { url: 'sourceType', valueString: 'encounterIdentifier' },
            { url: 'system', valueUri: 'https://example.com/encounter-id' },
          ],
        },
      ],
    };

    const testMedplum = new MockClient();
    const createdEncounter = await testMedplum.createResource(encounterWithIdentifier);

    setup(
      <SmartAppLaunchLink client={client} encounter={createReference(createdEncounter)}>
        Launch App
      </SmartAppLaunchLink>,
      testMedplum
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Launch App'));
    });

    await waitFor(() => expect(mockAssign).toHaveBeenCalled());
    const url = new URL(mockAssign.mock.calls[0][0]);
    expect(url.searchParams.get('encounter')).toBe('enc-123');
  });

  test('Patient ID parameter', async () => {
    const mockAssign = jest.fn();
    locationUtils.assign = mockAssign;

    const client: ClientApplication = {
      resourceType: 'ClientApplication',
      launchUri: 'https://example.com/launch',
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/smart-launch-url-parameter',
          extension: [
            { url: 'name', valueString: 'patientId' },
            { url: 'sourceType', valueString: 'patientId' },
          ],
        },
      ],
    };

    const testMedplum = new MockClient();
    const patient = await testMedplum.createResource(HomerSimpson);

    setup(
      <SmartAppLaunchLink client={client} patient={createReference(patient)}>
        Launch App
      </SmartAppLaunchLink>,
      testMedplum
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Launch App'));
    });

    await waitFor(() => expect(mockAssign).toHaveBeenCalled());
    const url = new URL(mockAssign.mock.calls[0][0]);
    expect(url.searchParams.get('patientId')).toBe(patient.id);
  });

  test('Encounter ID parameter', async () => {
    const mockAssign = jest.fn();
    locationUtils.assign = mockAssign;

    const client: ClientApplication = {
      resourceType: 'ClientApplication',
      launchUri: 'https://example.com/launch',
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/smart-launch-url-parameter',
          extension: [
            { url: 'name', valueString: 'encounterId' },
            { url: 'sourceType', valueString: 'encounterId' },
          ],
        },
      ],
    };

    const testMedplum = new MockClient();
    const encounter = await testMedplum.createResource(HomerEncounter);

    setup(
      <SmartAppLaunchLink client={client} encounter={createReference(encounter)}>
        Launch App
      </SmartAppLaunchLink>,
      testMedplum
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Launch App'));
    });

    await waitFor(() => expect(mockAssign).toHaveBeenCalled());
    const url = new URL(mockAssign.mock.calls[0][0]);
    expect(url.searchParams.get('encounterId')).toBe(encounter.id);
  });

  test('Static value parameter', async () => {
    const mockAssign = jest.fn();
    locationUtils.assign = mockAssign;

    const client: ClientApplication = {
      resourceType: 'ClientApplication',
      launchUri: 'https://example.com/launch',
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/smart-launch-url-parameter',
          extension: [
            { url: 'name', valueString: 'orgId' },
            { url: 'sourceType', valueString: 'static' },
            { url: 'value', valueString: 'my-org-123' },
          ],
        },
      ],
    };

    setup(
      <SmartAppLaunchLink client={client} patient={createReference(HomerSimpson)}>
        Launch App
      </SmartAppLaunchLink>
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Launch App'));
    });

    await waitFor(() => expect(mockAssign).toHaveBeenCalled());
    const url = new URL(mockAssign.mock.calls[0][0]);
    expect(url.searchParams.get('orgId')).toBe('my-org-123');
  });

  test('Multiple parameters', async () => {
    const mockAssign = jest.fn();
    locationUtils.assign = mockAssign;

    const patientWithIdentifier: Patient = {
      ...HomerSimpson,
      identifier: [
        {
          system: 'https://www.healthgorilla.com',
          value: 'hg-patient-123',
        },
      ],
    };

    const client: ClientApplication = {
      resourceType: 'ClientApplication',
      launchUri: 'https://example.com/launch',
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/smart-launch-url-parameter',
          extension: [
            { url: 'name', valueString: 'patient' },
            { url: 'sourceType', valueString: 'patientIdentifier' },
            { url: 'system', valueUri: 'https://www.healthgorilla.com' },
          ],
        },
        {
          url: 'https://medplum.com/fhir/StructureDefinition/smart-launch-url-parameter',
          extension: [
            { url: 'name', valueString: 'orgId' },
            { url: 'sourceType', valueString: 'static' },
            { url: 'value', valueString: 'my-org-123' },
          ],
        },
      ],
    };

    const testMedplum = new MockClient();
    const createdPatient = await testMedplum.createResource(patientWithIdentifier);

    setup(
      <SmartAppLaunchLink client={client} patient={createReference(createdPatient)}>
        Launch App
      </SmartAppLaunchLink>,
      testMedplum
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Launch App'));
    });

    await waitFor(() => expect(mockAssign).toHaveBeenCalled());
    const url = new URL(mockAssign.mock.calls[0][0]);
    expect(url.searchParams.get('patient')).toBe('hg-patient-123');
    expect(url.searchParams.get('orgId')).toBe('my-org-123');
  });

  test('Missing patient resource for patientIdentifier', async () => {
    const mockAssign = jest.fn();
    locationUtils.assign = mockAssign;

    const client: ClientApplication = {
      resourceType: 'ClientApplication',
      launchUri: 'https://example.com/launch',
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/smart-launch-url-parameter',
          extension: [
            { url: 'name', valueString: 'patient' },
            { url: 'sourceType', valueString: 'patientIdentifier' },
            { url: 'system', valueUri: 'https://www.healthgorilla.com' },
          ],
        },
      ],
    };

    setup(
      <SmartAppLaunchLink client={client}>
        Launch App
      </SmartAppLaunchLink>
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Launch App'));
    });

    await waitFor(() => expect(mockAssign).toHaveBeenCalled());
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'yellow',
        message: expect.stringContaining('requires a Patient resource'),
      })
    );

    const url = new URL(mockAssign.mock.calls[0][0]);
    expect(url.searchParams.get('patient')).toBeNull();
  });

  test('Missing encounter resource for encounterIdentifier', async () => {
    const mockAssign = jest.fn();
    locationUtils.assign = mockAssign;

    const client: ClientApplication = {
      resourceType: 'ClientApplication',
      launchUri: 'https://example.com/launch',
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/smart-launch-url-parameter',
          extension: [
            { url: 'name', valueString: 'encounter' },
            { url: 'sourceType', valueString: 'encounterIdentifier' },
            { url: 'system', valueUri: 'https://example.com/encounter-id' },
          ],
        },
      ],
    };

    setup(
      <SmartAppLaunchLink client={client} patient={createReference(HomerSimpson)}>
        Launch App
      </SmartAppLaunchLink>
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Launch App'));
    });

    await waitFor(() => expect(mockAssign).toHaveBeenCalled());
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'yellow',
        message: expect.stringContaining('requires an Encounter resource'),
      })
    );
  });

  test('Missing identifier with specified system', async () => {
    const mockAssign = jest.fn();
    locationUtils.assign = mockAssign;

    const patientWithoutIdentifier: Patient = {
      ...HomerSimpson,
      identifier: [
        {
          system: 'https://other-system.com',
          value: 'other-id',
        },
      ],
    };

    const client: ClientApplication = {
      resourceType: 'ClientApplication',
      launchUri: 'https://example.com/launch',
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/smart-launch-url-parameter',
          extension: [
            { url: 'name', valueString: 'patient' },
            { url: 'sourceType', valueString: 'patientIdentifier' },
            { url: 'system', valueUri: 'https://www.healthgorilla.com' },
          ],
        },
      ],
    };

    const testMedplum = new MockClient();
    const createdPatient = await testMedplum.createResource(patientWithoutIdentifier);

    setup(
      <SmartAppLaunchLink client={client} patient={createReference(createdPatient)}>
        Launch App
      </SmartAppLaunchLink>,
      testMedplum
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Launch App'));
    });

    await waitFor(() => expect(mockAssign).toHaveBeenCalled());
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'yellow',
        message: expect.stringContaining('Identifier with system "https://www.healthgorilla.com" not found'),
      })
    );

    const url = new URL(mockAssign.mock.calls[0][0]);
    expect(url.searchParams.get('patient')).toBeNull();
  });

  test('Ignores extensions without name or sourceType', async () => {
    const mockAssign = jest.fn();
    locationUtils.assign = mockAssign;

    const client: ClientApplication = {
      resourceType: 'ClientApplication',
      launchUri: 'https://example.com/launch',
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/smart-launch-url-parameter',
          extension: [
            // Missing name
            { url: 'sourceType', valueString: 'static' },
            { url: 'value', valueString: 'test' },
          ],
        },
        {
          url: 'https://medplum.com/fhir/StructureDefinition/smart-launch-url-parameter',
          extension: [
            { url: 'name', valueString: 'validParam' },
            // Missing sourceType
            { url: 'value', valueString: 'test' },
          ],
        },
        {
          url: 'https://medplum.com/fhir/StructureDefinition/smart-launch-url-parameter',
          extension: [
            { url: 'name', valueString: 'validParam' },
            { url: 'sourceType', valueString: 'static' },
            { url: 'value', valueString: 'test-value' },
          ],
        },
      ],
    };

    setup(
      <SmartAppLaunchLink client={client} patient={createReference(HomerSimpson)}>
        Launch App
      </SmartAppLaunchLink>
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Launch App'));
    });

    await waitFor(() => expect(mockAssign).toHaveBeenCalled());
    const url = new URL(mockAssign.mock.calls[0][0]);
    // Only the valid parameter should be added
    expect(url.searchParams.get('validParam')).toBe('test-value');
  });

  test('Handles system as valueString', async () => {
    const mockAssign = jest.fn();
    locationUtils.assign = mockAssign;

    const patientWithIdentifier: Patient = {
      ...HomerSimpson,
      identifier: [
        {
          system: 'https://www.healthgorilla.com',
          value: 'hg-patient-123',
        },
      ],
    };

    const client: ClientApplication = {
      resourceType: 'ClientApplication',
      launchUri: 'https://example.com/launch',
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/smart-launch-url-parameter',
          extension: [
            { url: 'name', valueString: 'patient' },
            { url: 'sourceType', valueString: 'patientIdentifier' },
            { url: 'system', valueString: 'https://www.healthgorilla.com' }, // valueString instead of valueUri
          ],
        },
      ],
    };

    const testMedplum = new MockClient();
    const createdPatient = await testMedplum.createResource(patientWithIdentifier);

    setup(
      <SmartAppLaunchLink client={client} patient={createReference(createdPatient)}>
        Launch App
      </SmartAppLaunchLink>,
      testMedplum
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Launch App'));
    });

    await waitFor(() => expect(mockAssign).toHaveBeenCalled());
    const url = new URL(mockAssign.mock.calls[0][0]);
    expect(url.searchParams.get('patient')).toBe('hg-patient-123');
  });
});
