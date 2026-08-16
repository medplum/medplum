// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Encounter, Patient, Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { EncountersPage } from './EncountersPage';

const QUERY = '?_count=20&_fields=_lastUpdated,period,status,serviceType&_sort=-_lastUpdated';

describe('EncountersPage', () => {
  let medplum: MockClient;
  let patient: WithId<Patient>;
  let practitioner: WithId<Practitioner>;

  beforeEach(async () => {
    medplum = new MockClient();
    patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ given: ['Jane'], family: 'Doe' }],
    });
    practitioner = await medplum.createResource({
      resourceType: 'Practitioner',
      name: [{ given: ['Gregory'], family: 'House' }],
    });
    vi.clearAllMocks();
    notifications.clean();
    notifications.cleanQueue();
  });

  async function createVisit(subject: WithId<Patient>, props?: Partial<Encounter>): Promise<WithId<Encounter>> {
    return medplum.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'in-progress',
      class: { code: 'AMB', display: 'Ambulatory' },
      type: [{ text: 'Office Visit' }],
      period: { start: '2026-08-10T09:00:00Z' },
      subject: createReference(subject),
      participant: [{ individual: createReference(practitioner) }],
      ...props,
    });
  }

  function renderAt(path: string): ReturnType<typeof render> {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/Patient/:patientId/Encounter" element={<EncountersPage />} />
              <Route path="/Patient/:patientId/Encounter/:encounterId" element={<EncountersPage />}>
                <Route path="Task/:taskId" element={<div>Task Modal</div>} />
              </Route>
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  function setup(encounterId?: string): ReturnType<typeof render> {
    const path = encounterId
      ? `/Patient/${patient.id}/Encounter/${encounterId}${QUERY}`
      : `/Patient/${patient.id}/Encounter${QUERY}`;
    return renderAt(path);
  }

  test('Lists the patient encounters with type, status, and practitioner', async () => {
    await createVisit(patient);
    setup();

    expect(await screen.findByText('Office Visit')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(await screen.findByText('Gregory House')).toBeInTheDocument();
  });

  test('Excludes encounters of other patients', async () => {
    const other: WithId<Patient> = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'Smith' }],
    });
    await createVisit(patient, { type: [{ text: 'Office Visit' }] });
    await createVisit(other, { type: [{ text: 'Telehealth Visit' }] });
    setup();

    expect(await screen.findByText('Office Visit')).toBeInTheDocument();
    expect(screen.queryByText('Telehealth Visit')).not.toBeInTheDocument();
  });

  test('Shows the encounter chart as the detail pane for the selected encounter', async () => {
    const encounter = await createVisit(patient);
    setup(encounter.id);

    expect(await screen.findByText('Note & Tasks')).toBeInTheDocument();
    expect(screen.getByText('Details & Billing')).toBeInTheDocument();
  });

  test('Auto-selects the first encounter and opens its chart', async () => {
    await createVisit(patient);
    setup();

    expect(await screen.findByText('Note & Tasks')).toBeInTheDocument();
  });

  test('Shows the empty state when the patient has no encounters', async () => {
    setup();

    expect(await screen.findByText('No visits.')).toBeInTheDocument();
  });

  test('Keeps a nested task route open through the search-normalization redirect', async () => {
    const encounter = await createVisit(patient);
    // No query string, mimicking a relative navigation from the task panel.
    renderAt(`/Patient/${patient.id}/Encounter/${encounter.id}/Task/some-task`);

    expect(await screen.findByText('Task Modal')).toBeInTheDocument();
    // Wait for the list to load after the redirect pins the normalized query.
    expect(await screen.findByText('Office Visit')).toBeInTheDocument();
    expect(screen.getByText('Task Modal')).toBeInTheDocument();
  });
});
