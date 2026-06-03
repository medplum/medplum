// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Bundle, MedicationRequest } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MedicationsPage } from './MedicationsPage';

function createDoseSpotMembership(): ReturnType<MockClient['getProjectMembership']> {
  return {
    resourceType: 'ProjectMembership',
    id: 'test-membership',
    project: { reference: 'Project/test' },
    user: { reference: 'User/test' },
    profile: { reference: 'Practitioner/test' },
    identifier: [{ system: 'https://dosespot.com', value: '12345' }],
  };
}

function createScriptSureMembership(): ReturnType<MockClient['getProjectMembership']> {
  return {
    resourceType: 'ProjectMembership',
    id: 'test-membership',
    project: { reference: 'Project/test' },
    user: { reference: 'User/test' },
    profile: { reference: 'Practitioner/test' },
    identifier: [{ system: 'https://scriptsure.com', value: '12345' }],
  };
}

/**
 * Build an empty MedicationRequest search Bundle so the new server-side search path
 * (`medplum.search('MedicationRequest', ...)` returning a Bundle with `total`) is
 * satisfied. Tests that need entries can pass `entries`.
 *
 * @param total - `Bundle.total` field to populate (defaults to `0`).
 * @param entries - MedicationRequest resources to wrap as `Bundle.entry[].resource`.
 * @returns A FHIR Bundle suitable as the resolved value of `medplum.search` mocks.
 */
function emptyMrBundle(total = 0, entries: WithId<MedicationRequest>[] = []): Bundle<WithId<MedicationRequest>> {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total,
    entry: entries.map((resource) => ({ resource })),
  };
}

function paramsString(call: unknown): string {
  // Mock calls are typed as `unknown[]`, but our `medplum.search('MedicationRequest', params)`
  // call always passes a `URLSearchParams` instance — cast through a narrow helper so the lint
  // rule (`no-base-to-string`) doesn't trip on the generic `unknown` shape.
  if (call instanceof URLSearchParams) {
    return call.toString();
  }
  if (typeof call === 'string') {
    return call;
  }
  return '';
}

interface SetupHandle {
  medplum: MockClient;
  location: { current: ReturnType<typeof useLocation> | null };
}

function LocationCapture(props: { sink: SetupHandle['location'] }): null {
  const loc = useLocation();
  props.sink.current = loc;
  return null;
}

async function setup(url: string, medplum = new MockClient()): Promise<SetupHandle> {
  const searchSpy = vi.spyOn(medplum, 'search') as unknown as ReturnType<typeof vi.fn>;
  if (!searchSpy.getMockImplementation()) {
    searchSpy.mockResolvedValue(emptyMrBundle(0));
  }
  const location: SetupHandle['location'] = { current: null };
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <MantineProvider>
            <Notifications />
            <LocationCapture sink={location} />
            <Routes>
              <Route path="/Patient/:patientId/MedicationRequest" element={<MedicationsPage />} />
              <Route path="/Patient/:patientId/MedicationRequest/:medicationRequestId" element={<MedicationsPage />} />
            </Routes>
          </MantineProvider>
        </MemoryRouter>
      </MedplumProvider>
    );
  });
  return { medplum, location };
}

describe('MedicationsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  test('Renders medication tabs and order action', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'search').mockResolvedValue(emptyMrBundle(0));
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(createScriptSureMembership());
    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest`, medplum);
    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(await screen.findByText('Draft')).toBeInTheDocument();
    expect(await screen.findByText('Completed')).toBeInTheDocument();
    expect(await screen.findByLabelText('Order medication')).toBeInTheDocument();
  });

  test('Defaults to active status filter on first render', async () => {
    const medplum = new MockClient();
    const searchSpy = vi.spyOn(medplum, 'search').mockResolvedValue(emptyMrBundle(0));
    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest`, medplum);

    await waitFor(() => {
      expect(searchSpy).toHaveBeenCalled();
    });
    const lastCall = searchSpy.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe('MedicationRequest');
    const params = paramsString(lastCall?.[1]);
    expect(params).toContain('status=active%2Con-hold%2Cunknown');
    expect(params).toContain('_count=20');
    expect(params).toContain('_sort=-_lastUpdated');
  });

  test('Reads existing status param from the URL and queries the matching status set', async () => {
    const medplum = new MockClient();
    const searchSpy = vi.spyOn(medplum, 'search').mockResolvedValue(emptyMrBundle(0));
    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest?status=draft`, medplum);

    await waitFor(() => {
      expect(searchSpy).toHaveBeenCalled();
    });
    const params = paramsString(searchSpy.mock.calls.at(-1)?.[1]);
    expect(params).toContain('status=draft');
  });

  test('Tab change updates the URL and triggers a per-status search', async () => {
    const medplum = new MockClient();
    const searchSpy = vi.spyOn(medplum, 'search').mockResolvedValue(emptyMrBundle(0));
    const handle = await setup(`/Patient/${HomerSimpson.id}/MedicationRequest`, medplum);

    expect(await screen.findByText('Draft')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Draft'));
    });

    await waitFor(() => {
      expect(handle.location.current?.search).toContain('status=draft');
    });

    await waitFor(() => {
      const calls = searchSpy.mock.calls.map((c) => paramsString(c[1]));
      expect(calls.some((p) => p.includes('status=draft'))).toBe(true);
    });
  });

  test('Pagination control changes the URL _offset and re-queries', async () => {
    const medplum = new MockClient();
    const fakeMrs: WithId<MedicationRequest>[] = Array.from({ length: 20 }, (_, i) => ({
      resourceType: 'MedicationRequest',
      id: `mr-${i}`,
      status: 'active',
      intent: 'order',
      subject: { reference: `Patient/${HomerSimpson.id}` },
    }));
    // 45 total → 3 pages at PAGE_SIZE=20.
    const searchSpy = vi.spyOn(medplum, 'search').mockResolvedValue(emptyMrBundle(45, fakeMrs));
    const handle = await setup(`/Patient/${HomerSimpson.id}/MedicationRequest`, medplum);

    // Wait for first row to render so we know the bundle was processed.
    await waitFor(() => {
      expect(searchSpy).toHaveBeenCalled();
    });

    // Mantine Pagination renders <button> elements with the page number as text.
    const pageTwoButton = await screen.findByRole('button', { name: '2' });
    await act(async () => {
      fireEvent.click(pageTwoButton);
    });

    await waitFor(() => {
      expect(handle.location.current?.search).toContain('_offset=20');
    });
    await waitFor(() => {
      const calls = searchSpy.mock.calls.map((c) => paramsString(c[1]));
      expect(calls.some((p) => p.includes('_offset=20'))).toBe(true);
    });
  });

  test('Shows loading state when patient is not available', async () => {
    await setup('/Patient/non-existent-patient/MedicationRequest');
    await waitFor(() => {
      const loader = document.querySelector('.mantine-Loader-root');
      expect(loader).toBeInTheDocument();
    });
  });

  test('Does not trigger DoseSpot sync without DoseSpot identifier', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'search').mockResolvedValue(emptyMrBundle(0));
    const executeBotSpy = vi.spyOn(medplum, 'executeBot').mockResolvedValue({});

    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest`, medplum);
    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(executeBotSpy).not.toHaveBeenCalled();
  });

  test('DoseSpot sync calls all three bots automatically on mount', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'search').mockResolvedValue(emptyMrBundle(0));
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(createDoseSpotMembership());
    const executeBotSpy = vi.spyOn(medplum, 'executeBot').mockResolvedValue({});

    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest`, medplum);

    await waitFor(() => {
      expect(executeBotSpy).toHaveBeenCalledTimes(3);
    });
  });

  test('Re-opening a pending order from the details panel opens the full chart/queue iframe (issue #9300)', async () => {
    const medplum = new MockClient();
    const draftOrder: WithId<MedicationRequest> = {
      resourceType: 'MedicationRequest',
      id: 'mr-queued',
      status: 'draft',
      intent: 'order',
      subject: { reference: `Patient/${HomerSimpson.id}` },
      medicationCodeableConcept: { text: 'Crestor 10 mg tablet' },
      identifier: [{ system: 'https://scriptsure.com/pending-order-id', value: '8888' }],
      extension: [{ url: 'https://scriptsure.com/pending-order-status', valueCode: 'queued' }],
    };
    vi.spyOn(medplum, 'search').mockResolvedValue(emptyMrBundle(1, [draftOrder]));
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(createScriptSureMembership());
    const executeBotSpy = vi.spyOn(medplum, 'executeBot').mockResolvedValue({
      url: 'https://ssu.scriptsure.com/chart/253312/prescriptions?sessiontoken=abc',
    });

    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest/mr-queued?status=draft`, medplum);

    const openButton = await screen.findByRole('button', { name: /Open in ScriptSure/i });
    await act(async () => {
      fireEvent.click(openButton);
    });

    // Re-open must hit the ScriptSure iframe (chart/queue) bot, NOT re-invoke the
    // single-order widget via the $order-medication operation.
    await waitFor(() => {
      expect(executeBotSpy).toHaveBeenCalledWith(
        { system: 'https://www.medplum.com/bots', value: 'scriptsure-iframe-bot' },
        { patientId: HomerSimpson.id }
      );
    });
    expect(await screen.findByText('ScriptSure prescriptions')).toBeInTheDocument();
  });
});
