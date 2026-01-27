// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import type {
  DiagnosticReport,
  Encounter,
  Observation,
  Patient,
  Practitioner,
  ServiceRequest,
  Task,
} from '@medplum/fhirtypes';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { ResourcePanel } from './ResourcePanel';
import { randomUUID } from 'crypto';

describe('ResourcePanel', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  function setup<T extends { resourceType: string; id?: string }>(resource: T | { reference: string }): void {
    render(
      <MemoryRouter initialEntries={['/spaces']}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/spaces" element={<ResourcePanel resource={resource as any} />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('renders loading state when resource is not yet loaded', async () => {
    // Pass a reference that will need to be resolved
    setup({ reference: 'Patient/unknown-patient' });

    await waitFor(() => {
      expect(screen.getByText('Loading resource...')).toBeInTheDocument();
    });
  });

  test('renders PatientSummary for Patient resource', async () => {
    const patientId = randomUUID();
    const patient: Patient = {
      resourceType: 'Patient',
      id: patientId,
      name: [{ given: ['Homer'], family: 'Simpson' }],
    };
    await medplum.createResource(patient);

    setup(patient);

    await waitFor(() => {
      expect(screen.getByTestId('resource-panel')).toBeInTheDocument();
    });

    // PatientSummary should render patient information
    expect(screen.getByText(/Homer/i)).toBeInTheDocument();
  });

  test('renders TaskDetailPanel for Task resource', async () => {
    const task: Task = {
      resourceType: 'Task',
      id: 'task-123',
      status: 'in-progress',
      intent: 'order',
      code: { text: 'Test Task' },
      description: 'Task description for testing',
    };
    await medplum.createResource(task);

    setup(task);

    await waitFor(() => {
      expect(screen.getByTestId('resource-panel')).toBeInTheDocument();
    });

    // TaskDetailPanel should render task information
    await waitFor(() => {
      expect(screen.getByText('Test Task')).toBeInTheDocument();
    });
  });

  test('renders LabResultDetails for DiagnosticReport resource', async () => {
    const diagnosticReport: DiagnosticReport = {
      resourceType: 'DiagnosticReport',
      id: 'dr-123',
      status: 'final',
      code: { text: 'Complete Blood Count', coding: [{ display: 'CBC' }] },
      conclusion: 'Normal results',
    };
    await medplum.createResource(diagnosticReport);

    setup(diagnosticReport);

    await waitFor(() => {
      expect(screen.getByTestId('resource-panel')).toBeInTheDocument();
    });
  });

  test('renders LabOrderDetails for ServiceRequest resource', async () => {
    const patient: Patient = {
      resourceType: 'Patient',
      id: 'patient-sr',
      name: [{ given: ['Test'], family: 'Patient' }],
    };
    await medplum.createResource(patient);

    const serviceRequest: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: 'sr-123',
      status: 'active',
      intent: 'order',
      code: { text: 'Lab Order' },
      subject: { reference: 'Patient/patient-sr' },
    };
    await medplum.createResource(serviceRequest);

    setup(serviceRequest);

    await waitFor(() => {
      expect(screen.getByTestId('resource-panel')).toBeInTheDocument();
    });
  });

  test('renders EncounterChart for Encounter resource', async () => {
    const patient: Patient = {
      resourceType: 'Patient',
      id: 'patient-enc',
      name: [{ given: ['Test'], family: 'Patient' }],
    };
    await medplum.createResource(patient);

    const encounter: Encounter = {
      resourceType: 'Encounter',
      id: 'enc-123',
      status: 'in-progress',
      class: { code: 'AMB', display: 'Ambulatory' },
      subject: { reference: 'Patient/patient-enc' },
    };
    await medplum.createResource(encounter);

    setup(encounter);

    await waitFor(() => {
      expect(screen.getByTestId('resource-panel')).toBeInTheDocument();
    });
  });

  test('renders ResourceTable for unknown resource types', async () => {
    const observationId = randomUUID();
    const observation: Observation = {
      resourceType: 'Observation',
      id: observationId,
      status: 'final',
      code: { text: 'Blood Pressure' },
    };
    await medplum.createResource(observation);

    setup(observation);

    await waitFor(() => {
      expect(screen.getByTestId('resource-panel')).toBeInTheDocument();
    });

    // ResourceTable should be rendered - look for the code text instead
    await waitFor(() => {
      expect(screen.getByText(/Blood Pressure/i)).toBeInTheDocument();
    });
  });

  test('renders Practitioner using ResourceTable', async () => {
    const practitionerId = randomUUID();
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      id: practitionerId,
      name: [{ given: ['Alice'], family: 'Smith' }],
    };
    await medplum.createResource(practitioner);

    setup(practitioner);

    await waitFor(() => {
      expect(screen.getByTestId('resource-panel')).toBeInTheDocument();
    });
  });

  test('handles resource passed as reference', async () => {
    const patient: Patient = {
      resourceType: 'Patient',
      id: 'ref-patient',
      name: [{ given: ['Referenced'], family: 'Patient' }],
    };
    await medplum.createResource(patient);

    setup({ reference: 'Patient/ref-patient' });

    await waitFor(() => {
      expect(screen.getByTestId('resource-panel')).toBeInTheDocument();
    });

    // Should resolve reference and render PatientSummary
    await waitFor(() => {
      expect(screen.getByText(/Referenced/i)).toBeInTheDocument();
    });
  });

  test('handles Task reference resolution', async () => {
    const task: Task = {
      resourceType: 'Task',
      id: 'ref-task',
      status: 'draft',
      intent: 'order',
      code: { text: 'Referenced Task' },
    };
    await medplum.createResource(task);

    setup({ reference: 'Task/ref-task' });

    await waitFor(() => {
      expect(screen.getByTestId('resource-panel')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Referenced Task')).toBeInTheDocument();
    });
  });

  test('handles DiagnosticReport reference resolution', async () => {
    const dr: DiagnosticReport = {
      resourceType: 'DiagnosticReport',
      id: 'ref-dr',
      status: 'final',
      code: { text: 'Referenced Lab Result' },
    };
    await medplum.createResource(dr);

    setup({ reference: 'DiagnosticReport/ref-dr' });

    await waitFor(() => {
      expect(screen.getByTestId('resource-panel')).toBeInTheDocument();
    });
  });

  test('handles ServiceRequest reference resolution', async () => {
    const patient: Patient = {
      resourceType: 'Patient',
      id: 'patient-ref-sr',
      name: [{ given: ['Test'], family: 'Patient' }],
    };
    await medplum.createResource(patient);

    const sr: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: 'ref-sr',
      status: 'active',
      intent: 'order',
      code: { text: 'Referenced Lab Order' },
      subject: { reference: 'Patient/patient-ref-sr' },
    };
    await medplum.createResource(sr);

    setup({ reference: 'ServiceRequest/ref-sr' });

    await waitFor(() => {
      expect(screen.getByTestId('resource-panel')).toBeInTheDocument();
    });
  });

  test('handles Encounter reference resolution', async () => {
    const patient: Patient = {
      resourceType: 'Patient',
      id: 'patient-ref-enc',
      name: [{ given: ['Test'], family: 'Patient' }],
    };
    await medplum.createResource(patient);

    const encounter: Encounter = {
      resourceType: 'Encounter',
      id: 'ref-enc',
      status: 'finished',
      class: { code: 'AMB' },
      subject: { reference: 'Patient/patient-ref-enc' },
    };
    await medplum.createResource(encounter);

    setup({ reference: 'Encounter/ref-enc' });

    await waitFor(() => {
      expect(screen.getByTestId('resource-panel')).toBeInTheDocument();
    });
  });
});
