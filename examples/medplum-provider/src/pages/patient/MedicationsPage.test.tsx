// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { cleanNotifications, Notifications } from '@mantine/notifications';
import type {
  MedicationCartManageResponse,
  MedicationCheckoutRequest,
  MedicationCheckoutResponse,
  WithId,
} from '@medplum/core';
import { forbidden, gone, OperationOutcomeError } from '@medplum/core';
import type { Bundle, MedicationRequest } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import type * as ScriptSureReactModule from '@medplum/scriptsure-react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MedicationsPage } from './MedicationsPage';

const checkoutMock = vi.fn<(input: MedicationCheckoutRequest) => Promise<MedicationCheckoutResponse>>();
const removeFromCartMock =
  vi.fn<(input: { patientId: string; medicationRequestId: string }) => Promise<MedicationCartManageResponse>>();
const clearCartMock = vi.fn<(input: { patientId: string }) => Promise<MedicationCartManageResponse>>();
const addToCartMock = vi.fn<(mr: MedicationRequest) => Promise<MedicationRequest>>();

// Mock only the cart hook; keep the rest of the module (constants,
// `useScriptSureOrderMedication`) real so the page's other ScriptSure paths
// behave normally.
vi.mock('@medplum/scriptsure-react', async () => {
  const actual = await vi.importActual<typeof ScriptSureReactModule>('@medplum/scriptsure-react');
  return {
    ...actual,
    useScriptSureCart: () => ({
      addToCart: addToCartMock,
      adding: false,
      checkout: checkoutMock,
      removeFromCart: removeFromCartMock,
      clearCart: clearCartMock,
    }),
  };
});

const ORDER_SET_LAUNCH_URL = 'https://ssu.example/widgets/order-set/253312?sessiontoken=order-set';

// The order form is exercised by its own tests; here it only needs to hand the page
// an order-set launch, which carries a URL but no MedicationRequest of its own.
vi.mock('../meds/OrderMedicationPage', () => ({
  OrderMedicationPage: (props: { onOrderComplete?: (result: { launchUrl: string }) => void }) => (
    <button type="button" onClick={() => props.onOrderComplete?.({ launchUrl: ORDER_SET_LAUNCH_URL })}>
      Launch order set
    </button>
  ),
}));

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

// The list tabs are MedplumLinks, which navigate through MedplumProvider rather than react-router.
function RouterMedplumProvider(props: { medplum: MockClient; children: React.ReactNode }): JSX.Element {
  const navigate = useNavigate();
  return (
    <MedplumProvider medplum={props.medplum} navigate={(path) => navigate(path)?.catch(console.error)}>
      {props.children}
    </MedplumProvider>
  );
}

async function setup(url: string, medplum = new MockClient()): Promise<SetupHandle> {
  const searchSpy = vi.spyOn(medplum, 'search') as unknown as ReturnType<typeof vi.fn>;
  if (!searchSpy.getMockImplementation()) {
    searchSpy.mockResolvedValue(emptyMrBundle(0));
  }
  const location: SetupHandle['location'] = { current: null };
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[url]} initialIndex={0}>
        <RouterMedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <LocationCapture sink={location} />
            <Routes>
              <Route path="/Patient/:patientId/MedicationRequest" element={<MedicationsPage />} />
              <Route path="/Patient/:patientId/MedicationRequest/:medicationRequestId" element={<MedicationsPage />} />
            </Routes>
          </MantineProvider>
        </RouterMedplumProvider>
      </MemoryRouter>
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
    // Mantine notifications use a module-level store that outlives each render,
    // so reset it between tests to avoid one test's toasts leaking into the next.
    cleanNotifications();
    vi.clearAllMocks();
    checkoutMock.mockReset();
    removeFromCartMock.mockReset();
    clearCartMock.mockReset();
    addToCartMock.mockReset();
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

  test('medication row links preserve the current tab filter', async () => {
    const medplum = new MockClient();
    const draft = draftMr('mr-draft-link', 'Aspirin 81 mg tablet');
    vi.spyOn(medplum, 'search').mockResolvedValue(emptyMrBundle(1, [draft]));

    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest?status=draft`, medplum);

    expect(await screen.findByRole('link', { name: /Aspirin 81 mg tablet/i })).toHaveAttribute(
      'href',
      `/Patient/${HomerSimpson.id}/MedicationRequest/${draft.id}?status=draft`
    );
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

  test('selected medication details stay full and current when the list tab changes', async () => {
    const medplum = new MockClient();
    const projectedListRow: WithId<MedicationRequest> = {
      resourceType: 'MedicationRequest',
      id: 'mr-selected',
      status: 'active',
      intent: 'order',
      subject: { reference: `Patient/${HomerSimpson.id}` },
      medicationCodeableConcept: { text: 'Diovan 80 mg tablet' },
    };
    const fullMedicationRequest: WithId<MedicationRequest> = {
      ...projectedListRow,
      note: [{ text: 'Full current detail' }],
      identifier: [{ system: 'https://scriptsure.com/prescription-id', value: '12345' }],
    };
    const search = vi.spyOn(medplum, 'search') as unknown as ReturnType<typeof vi.fn>;
    search.mockImplementation(async (_resourceType, params) =>
      paramsString(params).includes('status=draft') ? emptyMrBundle(0) : emptyMrBundle(1, [projectedListRow])
    );
    const realRead = medplum.readResource.bind(medplum);
    const readResource = vi.spyOn(medplum, 'readResource').mockImplementation((async (
      resourceType: string,
      id: string,
      options?: unknown
    ) => {
      if (resourceType === 'MedicationRequest' && id === fullMedicationRequest.id) {
        return fullMedicationRequest;
      }
      return realRead(resourceType as 'Patient', id, options as undefined);
    }) as typeof medplum.readResource);
    const handle = await setup(`/Patient/${HomerSimpson.id}/MedicationRequest/${fullMedicationRequest.id}`, medplum);

    expect(await screen.findByText('Full current detail')).toBeInTheDocument();
    const countDetailReads = (): number =>
      readResource.mock.calls.filter(
        ([resourceType, id]) => resourceType === 'MedicationRequest' && id === fullMedicationRequest.id
      ).length;
    const readsBeforeTabChange = countDetailReads();

    fireEvent.click(screen.getByText('Draft'));

    await waitFor(() => {
      expect(handle.location.current?.search).toContain('status=draft');
      expect(screen.getByText('Full current detail')).toBeInTheDocument();
      expect(countDetailReads()).toBeGreaterThan(readsBeforeTabChange);
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

  test('Dismisses the DoseSpot sync toast when navigating away before sync finishes', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'search').mockResolvedValue(emptyMrBundle(0));
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(createDoseSpotMembership());
    // Keep the first sync bot pending so the loading toast stays open while we unmount.
    vi.spyOn(medplum, 'executeBot').mockReturnValue(new Promise<Record<string, never>>(() => {}));

    let unmount: () => void = () => {};
    await act(async () => {
      const view = render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[`/Patient/${HomerSimpson.id}/MedicationRequest`]} initialIndex={0}>
            <MantineProvider>
              <Notifications />
              <Routes>
                <Route path="/Patient/:patientId/MedicationRequest" element={<MedicationsPage />} />
              </Routes>
            </MantineProvider>
          </MemoryRouter>
        </MedplumProvider>
      );
      unmount = view.unmount;
    });

    expect(await screen.findByText('Syncing with DoseSpot')).toBeInTheDocument();

    await act(async () => {
      unmount();
    });

    await waitFor(() => {
      expect(screen.queryByText('Syncing with DoseSpot')).not.toBeInTheDocument();
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
    const realRead = medplum.readResource.bind(medplum);
    vi.spyOn(medplum, 'readResource').mockImplementation((async (
      resourceType: string,
      id: string,
      options?: unknown
    ) => {
      if (resourceType === 'MedicationRequest' && id === draftOrder.id) {
        return draftOrder;
      }
      return realRead(resourceType as 'Patient', id, options as undefined);
    }) as typeof medplum.readResource);
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

  /**
   * Seeds a ScriptSure cart whose drafts disappear once removed: the cart bot hard-deletes
   * them, so later list searches omit them and a read of a removed id fails with 410 Gone.
   *
   * @param drafts - The draft MedicationRequests initially in the cart.
   * @returns The client and a setter marking ids as removed.
   */
  function setupCartWithHardDeletes(drafts: WithId<MedicationRequest>[]): {
    medplum: MockClient;
    markRemoved: (...ids: string[]) => void;
  } {
    const medplum = new MockClient();
    const removed = new Set<string>();
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(createScriptSureMembership());
    vi.spyOn(medplum, 'search').mockImplementation((async () => {
      const remaining = drafts.filter((d) => !removed.has(d.id));
      return emptyMrBundle(remaining.length, remaining);
    }) as unknown as typeof medplum.search);
    const realRead = medplum.readResource.bind(medplum);
    vi.spyOn(medplum, 'readResource').mockImplementation((async (rt: string, id: string, opts?: unknown) => {
      if (rt === 'MedicationRequest') {
        const draft = drafts.find((d) => d.id === id);
        if (!draft || removed.has(id)) {
          throw new OperationOutcomeError(gone);
        }
        return draft;
      }
      return realRead(rt as 'Patient', id, opts as undefined);
    }) as unknown as typeof medplum.readResource);
    return { medplum, markRemoved: (...ids) => ids.forEach((id) => removed.add(id)) };
  }

  test('Per-row trash removes the selected draft via $remove-cart-medication and drops it from the URL without an error toast', async () => {
    const { medplum, markRemoved } = setupCartWithHardDeletes([draftMr('mr-a', 'Aspirin 81 mg tablet')]);
    removeFromCartMock.mockImplementation(async ({ medicationRequestId }) => {
      markRemoved(medicationRequestId);
      return { vendorPatientId: 24057, removedCount: 1, items: [{ medicationRequestId, status: 'removed' }] };
    });

    const user = userEvent.setup();
    const handle = await setup(`/Patient/${HomerSimpson.id}/MedicationRequest?status=draft`, medplum);
    await waitFor(() => {
      expect(handle.location.current?.pathname).toBe(`/Patient/${HomerSimpson.id}/MedicationRequest/mr-a`);
    });

    await user.click(await screen.findByLabelText('Remove medication from cart'));

    await waitFor(() => {
      expect(removeFromCartMock).toHaveBeenCalledWith({
        patientId: HomerSimpson.id,
        medicationRequestId: 'mr-a',
      });
      expect(handle.location.current?.pathname).toBe(`/Patient/${HomerSimpson.id}/MedicationRequest`);
      expect(handle.location.current?.search).toBe('?status=draft');
    });
    expect(await screen.findByText('Removed from cart')).toBeInTheDocument();
    expect(screen.queryByText('Gone')).not.toBeInTheDocument();
    expect(screen.queryByText('Aspirin 81 mg tablet')).not.toBeInTheDocument();
  });

  test('Clear cart removes every draft via $clear-cart and drops the selected draft from the URL', async () => {
    const drafts = [draftMr('mr-a', 'Aspirin 81 mg tablet'), draftMr('mr-b', 'Lisinopril 10 mg tablet')];
    const { medplum, markRemoved } = setupCartWithHardDeletes(drafts);
    clearCartMock.mockImplementation(async () => {
      markRemoved('mr-a', 'mr-b');
      return {
        vendorPatientId: 24057,
        removedCount: 2,
        items: [
          { medicationRequestId: 'mr-a', status: 'removed' },
          { medicationRequestId: 'mr-b', status: 'removed' },
        ],
      };
    });

    const user = userEvent.setup();
    const handle = await setup(`/Patient/${HomerSimpson.id}/MedicationRequest?status=draft`, medplum);
    await waitFor(() => {
      expect(handle.location.current?.pathname).toBe(`/Patient/${HomerSimpson.id}/MedicationRequest/mr-a`);
    });

    await user.click(await screen.findByRole('button', { name: /^Clear cart \(2\)$/ }));

    await waitFor(() => {
      expect(clearCartMock).toHaveBeenCalledWith({ patientId: HomerSimpson.id });
      expect(handle.location.current?.pathname).toBe(`/Patient/${HomerSimpson.id}/MedicationRequest`);
    });
    expect(await screen.findByText('Cart cleared')).toBeInTheDocument();
    expect(screen.queryByText('Gone')).not.toBeInTheDocument();
  });

  test('A detail read that fails for a reason other than Gone/NotFound surfaces an error toast', async () => {
    const medplum = new MockClient();
    const drafts = [draftMr('mr-a', 'Aspirin 81 mg tablet')];
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(createScriptSureMembership());
    vi.spyOn(medplum, 'search').mockResolvedValue(emptyMrBundle(1, drafts));
    const realRead = medplum.readResource.bind(medplum);
    vi.spyOn(medplum, 'readResource').mockImplementation((async (rt: string, id: string, opts?: unknown) => {
      if (rt === 'MedicationRequest') {
        throw new OperationOutcomeError(forbidden);
      }
      return realRead(rt as 'Patient', id, opts as undefined);
    }) as unknown as typeof medplum.readResource);

    await setup(`/Patient/${HomerSimpson.id}/MedicationRequest/mr-a?status=draft`, medplum);

    expect((await screen.findAllByText('Forbidden')).length).toBeGreaterThan(0);
  });

  test('Launching an order set opens its own URL and never orders the auto-selected draft', async () => {
    const medplum = new MockClient();
    const drafts = [draftMr('mr-a', 'Aspirin 81 mg tablet')];
    vi.spyOn(medplum, 'search').mockResolvedValue(emptyMrBundle(1, drafts));
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(createScriptSureMembership());
    const realRead = medplum.readResource.bind(medplum);
    vi.spyOn(medplum, 'readResource').mockImplementation((async (rt: string, id: string, opts?: unknown) => {
      if (rt === 'MedicationRequest') {
        return drafts[0];
      }
      return realRead(rt as 'Patient', id, opts as undefined);
    }) as unknown as typeof medplum.readResource);
    const postSpy = vi.spyOn(medplum, 'post');

    const user = userEvent.setup();
    const handle = await setup(`/Patient/${HomerSimpson.id}/MedicationRequest?status=draft`, medplum);
    await waitFor(() => {
      expect(handle.location.current?.pathname).toBe(`/Patient/${HomerSimpson.id}/MedicationRequest/mr-a`);
    });

    await user.click(await screen.findByLabelText('Order medication'));
    await user.click(await screen.findByRole('button', { name: 'Launch order set' }));

    const iframe = await screen.findByTitle('Complete prescription');
    expect(iframe.getAttribute('src')).toContain(ORDER_SET_LAUNCH_URL);
    expect(handle.location.current?.search).toBe('?status=draft');
    const orderCalls = postSpy.mock.calls.filter(([url]) => String(url).includes('$order-medication'));
    expect(orderCalls).toHaveLength(0);
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
