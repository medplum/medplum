// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { HomerSimpson, MockClient } from '@medplum/mock';
import * as medplumReact from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TimelineTab } from './TimelineTab';

describe('TimelineTab', () => {
  let medplum: MockClient;
  let patientTimelineSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    patientTimelineSpy = vi
      .spyOn(medplumReact, 'PatientTimeline')
      .mockImplementation(() => <div data-testid="patient-timeline" />);
  });

  const setup = (url: string): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <medplumReact.MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Routes>
              <Route path="/Patient/:patientId/timeline" element={<TimelineTab />} />
            </Routes>
          </MantineProvider>
        </medplumReact.MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders the timeline for the patient in the route', async () => {
    setup(`/Patient/${HomerSimpson.id}/timeline`);

    expect(await screen.findByTestId('patient-timeline')).toBeInTheDocument();
    expect(patientTimelineSpy).toHaveBeenCalledWith(
      expect.objectContaining({ patient: expect.objectContaining({ id: HomerSimpson.id }) }),
      undefined
    );
  });

  test('Renders a loader while the patient is unresolved', async () => {
    const { container } = setup('/Patient/does-not-exist/timeline');

    await waitFor(() => expect(container.querySelector('.mantine-Loader-root')).toBeInTheDocument());
    expect(patientTimelineSpy).not.toHaveBeenCalled();
  });
});
