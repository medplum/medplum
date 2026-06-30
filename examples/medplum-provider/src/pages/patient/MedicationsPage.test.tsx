// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { MedicationCartManageResponse, MedicationCheckoutRequest, MedicationCheckoutResponse, WithId } from '@medplum/core';
import type { Bundle, MedicationRequest } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import type * as ScriptSureReactModule from '@medplum/scriptsure-react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MedicationsPage } from './MedicationsPage';

const checkoutMock = vi.fn<(input: MedicationCheckoutRequest) => Promise<MedicationCheckoutResponse>>();
const removeFromCartMock =
  vi.fn<(input: { patientId: string; medicationRequestId: string }) => Promise<MedicationCartManageResponse>>();
const clearCartMock = vi.fn<(input: { patientId: string }) => Promise<MedicationCartManageResponse>>();

// Mock only the cart hooks; keep the rest of the module (constants,
// `useScriptSureOrderMedication`) real so the page's other ScriptSure paths
// behave normally.
vi.mock('@medplum/scriptsure-react', async () => {
  const actual = await vi.importActual<typeof ScriptSureReactModule>('@medplum/scriptsure-react');
  return {
    ...actual,
    useScriptSureCheckout: () => ({ checkout: checkoutMock }),
    useScriptSureCart: () => ({ removeFromCart: removeFromCartMock, clearCart: clearCartMock }),
  };
});

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

function draftMr(id: string, text: string): WithId<MedicationRequest> {
  return {
    resourceType: 'MedicationRequest',
    id,
    status: 'draft',
    intent: 'order',
    subject: { reference: `Patient/${HomerSimpson.id}` },
    medicationCodeableConcept: { text },
  };
}

describe('MedicationsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    checkoutMock.mockReset();
    removeFromCartMock.mockReset();
    clearCartMock.mockReset();
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

  test('Draft tab shows a Checkout button that submits all drafts to $checkout-medications and opens the Approve Queue modal', async () => {
    const medplum = new MockClient();
    const drafts = [draftMr('mr-a', 'Aspirin 81 mg tablet'), draftMr('mr-b', 'Lisinopril 10 mg tablet')];
    vi.spyOn(medplum, 'search').mockResolvedValue(emptyMrBundle(2, drafts));
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(createScriptSureMembership());
    // The modal poller reads the (still-draft) MRs by id; resolve those so it
    // doesn't throw. Patient (and any other) reads must fall through to the real
    // MockClient so `usePatient` still resolves HomerSimpson.
    const realRead = medplum.readResource.bind(medplum);
    vi.spyOn(medplum, 'readResource').mockImplementation((async (rt: string, id: string, opts?: unknown) => {
      if (rt === 'MedicationRequest') {
        return drafts.find((d) => d.id === id) ?? drafts[0];
      }
      return realRead(rt as 'Patient', id, opts as undefined);
    }) as unknown as typeof medplum.readResource);
    checkoutMock.mockResolvedValue({
      approvalUrl: 'https://ssu.example/widgets/approve-queue/253312?sessiontoken=abc',
      vendorPatientId: 253312,
      items: [
        { medicationRequestId: 'mr-a', vendorLineId: 'rx-a', status: 'queued' },
        { medicationRequestId: 'mr-b', vendorLineId: 'rx-b', status: 'queued' },
      ],
    });

    const user = userEvent.setup();
    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest?status=draft`, medplum);

    const checkoutButton = await screen.findByRole('button', { name: /^Checkout \(2\)$/ });
    await user.click(checkoutButton);

    await waitFor(() => {
      expect(checkoutMock).toHaveBeenCalledTimes(1);
    });
    expect(checkoutMock.mock.calls[0][0]).toEqual({
      patientId: HomerSimpson.id,
      medicationRequestIds: ['mr-a', 'mr-b'],
    });
    expect(await screen.findByText('Approve queued prescriptions')).toBeInTheDocument();
  });

  test('Checkout does not open the approval modal when every line fails to queue', async () => {
    const medplum = new MockClient();
    const drafts = [draftMr('mr-a', 'Aspirin 81 mg tablet'), draftMr('mr-b', 'Lisinopril 10 mg tablet')];
    vi.spyOn(medplum, 'search').mockResolvedValue(emptyMrBundle(2, drafts));
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(createScriptSureMembership());
    checkoutMock.mockResolvedValue({
      approvalUrl: 'https://ssu.example/widgets/medcart/253312?sessiontoken=abc',
      vendorPatientId: 253312,
      items: [
        { medicationRequestId: 'mr-a', status: 'failed', error: 'bad payload' },
        { medicationRequestId: 'mr-b', status: 'failed', error: 'no pharmacy' },
      ],
    });

    const user = userEvent.setup();
    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest?status=draft`, medplum);

    await user.click(await screen.findByRole('button', { name: /^Checkout \(2\)$/ }));

    await waitFor(() => {
      expect(checkoutMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('Approve queued prescriptions')).not.toBeInTheDocument();
  });

  test('Per-row trash removes a draft via $remove-cart-medication', async () => {
    const medplum = new MockClient();
    const drafts = [draftMr('mr-a', 'Aspirin 81 mg tablet')];
    vi.spyOn(medplum, 'search').mockResolvedValue(emptyMrBundle(1, drafts));
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(createScriptSureMembership());
    removeFromCartMock.mockResolvedValue({
      vendorPatientId: 24057,
      removedCount: 1,
      items: [{ medicationRequestId: 'mr-a', status: 'removed' }],
    });

    const user = userEvent.setup();
    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest?status=draft`, medplum);

    await user.click(await screen.findByLabelText('Remove medication from cart'));

    await waitFor(() => {
      expect(removeFromCartMock).toHaveBeenCalledWith({
        patientId: HomerSimpson.id,
        medicationRequestId: 'mr-a',
      });
    });
  });

  test('Clear cart removes every draft via $clear-cart', async () => {
    const medplum = new MockClient();
    const drafts = [draftMr('mr-a', 'Aspirin 81 mg tablet'), draftMr('mr-b', 'Lisinopril 10 mg tablet')];
    vi.spyOn(medplum, 'search').mockResolvedValue(emptyMrBundle(2, drafts));
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(createScriptSureMembership());
    clearCartMock.mockResolvedValue({
      vendorPatientId: 24057,
      removedCount: 2,
      items: [
        { medicationRequestId: 'mr-a', status: 'removed' },
        { medicationRequestId: 'mr-b', status: 'removed' },
      ],
    });

    const user = userEvent.setup();
    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest?status=draft`, medplum);

    await user.click(await screen.findByRole('button', { name: /^Clear cart \(2\)$/ }));

    await waitFor(() => {
      expect(clearCartMock).toHaveBeenCalledWith({ patientId: HomerSimpson.id });
    });
  });

  test('Pure cart model: no per-row selection checkboxes are rendered on the Draft tab', async () => {
    const medplum = new MockClient();
    const drafts = [draftMr('mr-a', 'Aspirin 81 mg tablet'), draftMr('mr-b', 'Lisinopril 10 mg tablet')];
    vi.spyOn(medplum, 'search').mockResolvedValue(emptyMrBundle(2, drafts));
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(createScriptSureMembership());

    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest?status=draft`, medplum);

    // The cart is the whole Draft tab; there is no subset selection any more.
    expect(await screen.findByRole('button', { name: /^Checkout \(2\)$/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Select medication for checkout')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Select all')).not.toBeInTheDocument();
    // Every draft still exposes a per-row remove (trash) action.
    expect(screen.getAllByLabelText('Remove medication from cart')).toHaveLength(2);
  });

  test('Does not show the Checkout button on non-draft tabs', async () => {
    const medplum = new MockClient();
    const actives = [
      {
        ...draftMr('mr-x', 'Atorvastatin 20 mg tablet'),
        status: 'active' as const,
      },
    ];
    vi.spyOn(medplum, 'search').mockResolvedValue(emptyMrBundle(1, actives));
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(createScriptSureMembership());

    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest`, medplum);

    expect(await screen.findByText('Atorvastatin 20 mg tablet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Checkout/ })).not.toBeInTheDocument();
  });
});
