// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { notifications, Notifications } from '@mantine/notifications';
import type { MedicationOrderRequest, MedicationOrderResponse, WithId } from '@medplum/core';
import {
  createReference,
  getReferenceString,
  MEDICATION_REQUEST_STATUS_REASON_RESPONSE_NOT_RECEIVED,
  MEDICATION_REQUEST_STATUS_REASON_SYSTEM,
  NDC,
  OperationOutcomeError,
  PATIENT_PREFERRED_PHARMACY_URL,
} from '@medplum/core';
import type { Extension, Medication, MedicationRequest } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, MockClient, TestOrganization } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import type * as ScriptSureReactModule from '@medplum/scriptsure-react';
import {
  SCRIPTSURE_GCN_SEQNO_SYSTEM,
  SCRIPTSURE_GENERIC_NAME_EXTENSION,
  SCRIPTSURE_NAME_TYPE_EXTENSION,
  SCRIPTSURE_ROUTED_MED_ID_SYSTEM,
  SCRIPTSURE_SIG_EXTENSION,
} from '@medplum/scriptsure-react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { OrderMedicationPageProps } from './OrderMedicationPage';
import { OrderMedicationPage } from './OrderMedicationPage';

const ORDER_MEDICATION_REJECTION = new Error('bot rejected');
const orderMedicationMock = vi.fn();
const searchMedicationsMock = vi.fn();

vi.mock('@medplum/scriptsure-react', async () => {
  const actual = await vi.importActual<typeof ScriptSureReactModule>('@medplum/scriptsure-react');
  return {
    ...actual,
    useScriptSureOrderMedication: () => ({
      searchMedications: searchMedicationsMock,
      orderMedication: orderMedicationMock,
    }),
    loadScriptSureQuantityQualifiers: vi.fn(async () => []),
  };
});

/** Brand-name search hit that expands to formulations via its routed-med-id. */
const GLUMETZA_BRAND_HIT: Medication = {
  resourceType: 'Medication',
  code: { text: 'Glumetza 500 mg tablet' },
  identifier: [{ system: SCRIPTSURE_ROUTED_MED_ID_SYSTEM, value: '4242' }],
  extension: [
    { url: SCRIPTSURE_NAME_TYPE_EXTENSION, valueString: '1' },
    { url: SCRIPTSURE_GENERIC_NAME_EXTENSION, valueString: 'metformin ER' },
  ],
};

const METFORMIN_GENERIC_HIT: Medication = {
  resourceType: 'Medication',
  code: { text: 'metformin ER 500 mg tablet' },
  extension: [{ url: SCRIPTSURE_NAME_TYPE_EXTENSION, valueString: '2' }],
};

const HYDROCORTISONE_HIT: Medication = {
  resourceType: 'Medication',
  code: { text: 'Hydrocortisone 1% cream' },
  identifier: [{ system: SCRIPTSURE_GCN_SEQNO_SYSTEM, value: '12345' }],
};

const DRUG_HITS = [GLUMETZA_BRAND_HIT, METFORMIN_GENERIC_HIT, HYDROCORTISONE_HIT];

function sigExtension(sigLine: string, quantity: number): Extension {
  return {
    url: SCRIPTSURE_SIG_EXTENSION,
    extension: [
      { url: 'sigLine', valueString: sigLine },
      { url: 'quantity', valueInteger: quantity },
    ],
  };
}

const GLUMETZA_CAPSULE_FORMAT: Medication = {
  resourceType: 'Medication',
  code: { text: 'Glumetza 500 mg tablet', coding: [{ system: NDC, code: '12345678901' }] },
  extension: [
    sigExtension('60 Capsule - Take 1 capsule by mouth twice daily', 60),
    sigExtension('90 Tablet - Take 2 tablets by mouth daily', 90),
    { url: 'https://example.com/unrelated', valueString: 'ignored' },
  ],
};

const GLUMETZA_STRENGTH_ONLY_FORMAT: Medication = { resourceType: 'Medication', code: { text: '500 mg' } };

const GLUMETZA_ROUTED_ONLY_FORMAT: Medication = {
  resourceType: 'Medication',
  code: { text: 'Glumetza 1000 mg tablet', coding: [{ system: SCRIPTSURE_ROUTED_MED_ID_SYSTEM, code: '4242' }] },
  extension: [sigExtension('30 Tablet - Take 1 tablet daily', 30)],
};

function preferredPharmacies(...ids: string[]): Extension[] {
  return ids.map((id) => ({
    url: PATIENT_PREFERRED_PHARMACY_URL,
    extension: [{ url: 'pharmacy', valueReference: { reference: `Organization/${id}` } }],
  }));
}

async function renderPage(medplum: MockClient, props: OrderMedicationPageProps = {}): Promise<void> {
  await act(async () => {
    render(
      <MantineProvider>
        <Notifications />
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[`/Patient/${HomerSimpson.id}/MedicationRequest`]}>
            <Routes>
              <Route path="/Patient/:patientId/MedicationRequest" element={<OrderMedicationPage {...props} />} />
            </Routes>
          </MemoryRouter>
        </MedplumProvider>
      </MantineProvider>
    );
  });
}

function mockDrugCatalog(formats: Medication[]): void {
  searchMedicationsMock.mockImplementation(async (input: { term?: string; routedMedId?: number }) => {
    if (input.routedMedId !== undefined) {
      return formats;
    }
    return DRUG_HITS.filter((m) => m.code?.text?.toLowerCase().includes(input.term?.toLowerCase() ?? ''));
  });
}

async function pickMedication(user: UserEvent, term: string, optionLabel: string, input?: HTMLElement): Promise<void> {
  await user.type(input ?? (await screen.findByLabelText(/Search medication/i)), term);
  await user.click(await screen.findByText(optionLabel, {}, { timeout: 10000 }));
}

async function replaceValue(user: UserEvent, input: HTMLElement, value: string): Promise<void> {
  await user.clear(input);
  await user.type(input, value);
}

describe('OrderMedicationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchMedicationsMock.mockResolvedValue([]);
    orderMedicationMock.mockReset();
    // Prevent notifications from leaking across test cases — @mantine/notifications
    // keeps its store as a module-level singleton, so an error toast raised by one
    // test (e.g. the bot-rejection test below) otherwise reappears in a later test's
    // DOM the moment <Notifications /> is remounted.
    notifications.clean();
  });

  test('shows single, compound, and order-set tabs', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'executeBot').mockResolvedValue([]);

    await act(async () => {
      render(
        <MantineProvider>
          <MedplumProvider medplum={medplum}>
            <MemoryRouter initialEntries={[`/Patient/${HomerSimpson.id}/MedicationRequest`]}>
              <Routes>
                <Route path="/Patient/:patientId/MedicationRequest" element={<OrderMedicationPage />} />
              </Routes>
            </MemoryRouter>
          </MedplumProvider>
        </MantineProvider>
      );
    });

    expect(await screen.findByRole('tab', { name: 'Single medication' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Compound' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Order set' })).toBeInTheDocument();
  });

  test('soft-deletes the draft MedicationRequest (status=unknown + statusReason) when the order bot fails', async () => {
    const medplum = new MockClient();
    medplum.mock.setProfile(DrAliceSmith);

    // Drug name search returns a single in-memory Medication. Important: no routed-med-id
    // so the page's "expand to formulations" effect short-circuits to selectedFormat = termMedication
    // (see useEffect on [termMedication] in OrderMedicationPage.tsx).
    const searchHit: Medication = {
      resourceType: 'Medication',
      id: 'med-aspirin-81',
      code: { text: 'Aspirin 81 mg tablet' },
    };
    searchMedicationsMock.mockResolvedValue([searchHit]);

    // Bot call rejects after the draft MR is created — exercise the soft-delete branch.
    orderMedicationMock.mockImplementation(async (_input: MedicationOrderRequest): Promise<MedicationOrderResponse> => {
      throw ORDER_MEDICATION_REJECTION;
    });

    const createSpy = vi.spyOn(medplum, 'createResource');
    const updateSpy = vi.spyOn(medplum, 'updateResource');
    const deleteSpy = vi.spyOn(medplum, 'deleteResource');

    const user = userEvent.setup();

    await act(async () => {
      render(
        <MantineProvider>
          <Notifications />
          <MedplumProvider medplum={medplum}>
            <MemoryRouter initialEntries={[`/Patient/${HomerSimpson.id}/MedicationRequest`]}>
              <Routes>
                <Route
                  path="/Patient/:patientId/MedicationRequest"
                  element={<OrderMedicationPage patient={HomerSimpson} />}
                />
              </Routes>
            </MemoryRouter>
          </MedplumProvider>
        </MantineProvider>
      );
    });

    // Type into the medication autocomplete, wait for the option to appear, click it.
    const searchInput = await screen.findByLabelText(/Search medication/i);
    await user.type(searchInput, 'aspirin');
    const option = await screen.findByText('Aspirin 81 mg tablet');
    await user.click(option);

    // Submit the single-med order; the Mantine Tabs default is "Single medication".
    const orderButton = await screen.findByRole('button', { name: /^Prescribe now$/ });
    await user.click(orderButton);

    // Wait for the bot rejection cleanup to run.
    await waitFor(() => {
      expect(orderMedicationMock).toHaveBeenCalledTimes(1);
    });

    // The draft MedicationRequest should have been created with status='draft'.
    const createdMrCall = createSpy.mock.calls.find((c) => {
      const r = c[0] as { resourceType?: string; status?: string } | undefined;
      return r?.resourceType === 'MedicationRequest' && r?.status === 'draft';
    });
    expect(createdMrCall).toBeDefined();

    // ...and then *soft*-deleted via updateResource — flipped to status='unknown' with the
    // canonical 'response-not-received' statusReason so vendor webhooks can reconcile later.
    // See wiki/medplum/medication-request-lifecycle.md.
    await waitFor(() => {
      const softDeleted = updateSpy.mock.calls
        .map((c) => c[0] as MedicationRequest | undefined)
        .find((r) => r?.resourceType === 'MedicationRequest' && r?.status === 'unknown');
      expect(softDeleted).toBeDefined();
      expect(softDeleted?.statusReason?.coding?.[0]).toMatchObject({
        system: MEDICATION_REQUEST_STATUS_REASON_SYSTEM,
        code: MEDICATION_REQUEST_STATUS_REASON_RESPONSE_NOT_RECEIVED,
      });
    });

    // And the legacy hard-delete path must NOT fire — that would erase the orphan record
    // and remove the only handle vendor reconciliation has.
    expect(deleteSpy).not.toHaveBeenCalledWith('MedicationRequest', expect.any(String));
  });

  // This test drives a lot of real keystrokes (userEvent.type) through Mantine's
  // Autocomplete + several async effects; the default 5000ms budget is too tight
  // on loaded/shared CI runners even though it's comfortably fast locally.
  test('infers days supply from a hyphenated compound number in the sig', async () => {
    const medplum = new MockClient();
    medplum.mock.setProfile(DrAliceSmith);
    searchMedicationsMock.mockResolvedValue([
      {
        resourceType: 'Medication',
        id: 'med-aspirin-81',
        code: { text: 'Aspirin 81 mg tablet' },
      },
    ]);
    const user = userEvent.setup();

    await act(async () => {
      render(
        <MantineProvider>
          <MedplumProvider medplum={medplum}>
            <MemoryRouter initialEntries={[`/Patient/${HomerSimpson.id}/MedicationRequest`]}>
              <Routes>
                <Route
                  path="/Patient/:patientId/MedicationRequest"
                  element={<OrderMedicationPage patient={HomerSimpson} />}
                />
              </Routes>
            </MemoryRouter>
          </MedplumProvider>
        </MantineProvider>
      );
    });

    const searchInput = await screen.findByLabelText(/Search medication/i, {}, { timeout: 10000 });
    await user.type(searchInput, 'aspirin');
    await user.click(await screen.findByText('Aspirin 81 mg tablet', {}, { timeout: 10000 }));

    const sigInput = screen.getByLabelText(/Sig \(directions\)/i);
    await user.clear(sigInput);
    await user.type(sigInput, 'Take 1 tablet every twenty-four hours');
    const quantityInput = screen.getByLabelText('Quantity to dispense');
    await user.clear(quantityInput);
    await user.type(quantityInput, '48');

    await waitFor(
      () => {
        expect(screen.getAllByLabelText('Days supply')[0]).toHaveValue('48');
      },
      { timeout: 10000 }
    );
  }, 20000);

  // See the timeout note on the previous test — this one also drives a search
  // debounce + a routedMedId formulation lookup, both prone to CI slowness.
  test('medication title combines the drug name with the selected formulation, not just the strength', async () => {
    const medplum = new MockClient();
    medplum.mock.setProfile(DrAliceSmith);

    // Drug-name search row: carries the product name + a routed-med-id so the
    // page expands to formulations (the path that previously dropped the name).
    const drugHit: Medication = {
      resourceType: 'Medication',
      id: 'med-jentadueto',
      code: { text: 'Jentadueto' },
      identifier: [{ system: 'https://scriptsure.com/routed-med-id', value: '163396' }],
    };
    // Formulation row from the routedMedId lookup: only a strength/format string.
    const formatHit: Medication = {
      resourceType: 'Medication',
      id: 'med-jentadueto-format',
      code: {
        text: '12.5 mg-500 mg tablet',
        coding: [
          { system: 'http://hl7.org/fhir/sid/ndc', code: '64764033560', display: '12.5 mg-500 mg tablet' },
          { system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '1368398', display: 'SBD' },
        ],
      },
    };
    searchMedicationsMock.mockImplementation(async (input: { term?: string; routedMedId?: number }) => {
      return input?.routedMedId ? [formatHit] : [drugHit];
    });
    orderMedicationMock.mockResolvedValue({ launchUrl: 'https://ssu.example/widget', medicationRequestId: 'mr-1' });

    const createSpy = vi.spyOn(medplum, 'createResource');
    const user = userEvent.setup();

    await act(async () => {
      render(
        <MantineProvider>
          <Notifications />
          <MedplumProvider medplum={medplum}>
            <MemoryRouter initialEntries={[`/Patient/${HomerSimpson.id}/MedicationRequest`]}>
              <Routes>
                <Route
                  path="/Patient/:patientId/MedicationRequest"
                  element={<OrderMedicationPage patient={HomerSimpson} />}
                />
              </Routes>
            </MemoryRouter>
          </MedplumProvider>
        </MantineProvider>
      );
    });

    const searchInput = await screen.findByLabelText(/Search medication/i, {}, { timeout: 10000 });
    await user.type(searchInput, 'jentadueto');
    await user.click(await screen.findByText('Jentadueto', {}, { timeout: 10000 }));

    // Wait for the routedMedId formulation lookup to resolve and render.
    await screen.findByText(/Formulation & directions/i, {}, { timeout: 10000 });

    await user.click(await screen.findByRole('button', { name: /^Prescribe now$/ }, { timeout: 10000 }));

    await waitFor(
      () => {
        const mrCall = createSpy.mock.calls.find(
          (c) => (c[0] as { resourceType?: string })?.resourceType === 'MedicationRequest'
        );
        expect(mrCall).toBeDefined();
        expect((mrCall?.[0] as MedicationRequest).medicationCodeableConcept?.text).toBe(
          'Jentadueto 12.5 mg-500 mg tablet'
        );
      },
      { timeout: 10000 }
    );
  }, 20000);

  test('Add to cart creates the draft MedicationRequest without calling $order-medication or opening a widget', async () => {
    const medplum = new MockClient();
    medplum.mock.setProfile(DrAliceSmith);

    const searchHit: Medication = {
      resourceType: 'Medication',
      id: 'med-aspirin-81',
      code: { text: 'Aspirin 81 mg tablet' },
    };
    searchMedicationsMock.mockResolvedValue([searchHit]);

    const createSpy = vi.spyOn(medplum, 'createResource');
    const onAddedToCart = vi.fn();
    const user = userEvent.setup();

    await act(async () => {
      render(
        <MantineProvider>
          <Notifications />
          <MedplumProvider medplum={medplum}>
            <MemoryRouter initialEntries={[`/Patient/${HomerSimpson.id}/MedicationRequest`]}>
              <Routes>
                <Route
                  path="/Patient/:patientId/MedicationRequest"
                  element={<OrderMedicationPage patient={HomerSimpson} onAddedToCart={onAddedToCart} />}
                />
              </Routes>
            </MemoryRouter>
          </MedplumProvider>
        </MantineProvider>
      );
    });

    const searchInput = await screen.findByLabelText(/Search medication/i);
    await user.type(searchInput, 'aspirin');
    await user.click(await screen.findByText('Aspirin 81 mg tablet'));

    await user.click(await screen.findByRole('button', { name: /^Add to cart$/ }));

    // Draft MR created...
    await waitFor(() => {
      const createdMrCall = createSpy.mock.calls.find((c) => {
        const r = c[0] as { resourceType?: string; status?: string } | undefined;
        return r?.resourceType === 'MedicationRequest' && r?.status === 'draft';
      });
      expect(createdMrCall).toBeDefined();
    });

    // ...and the parent notified, but the order bot was never called (no widget).
    await waitFor(() => {
      expect(onAddedToCart).toHaveBeenCalledTimes(1);
    });
    expect(orderMedicationMock).not.toHaveBeenCalled();
    const passedMr = onAddedToCart.mock.calls[0][0] as MedicationRequest;
    expect(passedMr.resourceType).toBe('MedicationRequest');
    expect(passedMr.status).toBe('draft');
  });

  test('does not show Add to cart when onAddedToCart is not provided', async () => {
    const medplum = new MockClient();
    medplum.mock.setProfile(DrAliceSmith);
    searchMedicationsMock.mockResolvedValue([]);

    await act(async () => {
      render(
        <MantineProvider>
          <Notifications />
          <MedplumProvider medplum={medplum}>
            <MemoryRouter initialEntries={[`/Patient/${HomerSimpson.id}/MedicationRequest`]}>
              <Routes>
                <Route
                  path="/Patient/:patientId/MedicationRequest"
                  element={<OrderMedicationPage patient={HomerSimpson} />}
                />
              </Routes>
            </MemoryRouter>
          </MedplumProvider>
        </MantineProvider>
      );
    });

    expect(await screen.findByRole('button', { name: /^Prescribe now$/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Add to cart$/ })).not.toBeInTheDocument();
  });

  test('re-prescription mode retries rejected and uncertain replacements without retaining a status reason', async () => {
    const medplum = new MockClient();
    medplum.mock.setProfile(DrAliceSmith);
    const readReference = vi.spyOn(medplum, 'readReference').mockResolvedValue(DrAliceSmith);
    const replacement: WithId<MedicationRequest> = {
      resourceType: 'MedicationRequest',
      id: 'replacement-rx',
      status: 'draft',
      intent: 'order',
      subject: { reference: `Patient/${HomerSimpson.id}` },
      requester: { reference: `Practitioner/${DrAliceSmith.id}` },
      priorPrescription: { reference: 'MedicationRequest/failed-rx' },
      medicationCodeableConcept: {
        text: 'Diovan 80 mg tablet',
        coding: [{ system: 'http://hl7.org/fhir/sid/ndc', code: '00078035834' }],
      },
      dosageInstruction: [{ text: 'Take 1 tablet daily', patientInstruction: 'With water' }],
      dispenseRequest: {
        quantity: { value: 90, unit: 'C48542' },
        numberOfRepeatsAllowed: 1,
        expectedSupplyDuration: { value: 90, unit: 'days' },
      },
      note: [{ text: 'Route to the new pharmacy' }],
      substitution: { allowedBoolean: false },
      authoredOn: '2026-07-15',
    };
    orderMedicationMock
      .mockRejectedValueOnce(
        new OperationOutcomeError({
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'not-found',
              details: { text: 'Payer Organization not found' },
            },
          ],
        })
      )
      .mockRejectedValueOnce(ORDER_MEDICATION_REJECTION)
      .mockResolvedValueOnce({
        launchUrl: 'https://ssu.example/widget/replacement',
        medicationRequestId: replacement.id,
      });
    const updateResource = vi.spyOn(medplum, 'updateResource');
    const createResource = vi.spyOn(medplum, 'createResource');
    const onOrderComplete = vi.fn();
    const onAddedToCart = vi.fn();
    const user = userEvent.setup();

    await act(async () => {
      render(
        <MantineProvider>
          <Notifications />
          <MedplumProvider medplum={medplum}>
            <MemoryRouter initialEntries={[`/Patient/${HomerSimpson.id}/MedicationRequest`]}>
              <Routes>
                <Route
                  path="/Patient/:patientId/MedicationRequest"
                  element={
                    <OrderMedicationPage
                      patient={HomerSimpson}
                      replacementMedicationRequest={replacement}
                      onOrderComplete={onOrderComplete}
                      onAddedToCart={onAddedToCart}
                    />
                  }
                />
              </Routes>
            </MemoryRouter>
          </MedplumProvider>
        </MantineProvider>
      );
    });

    expect((await screen.findAllByText('Diovan 80 mg tablet')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Alice Smith/i)).length).toBeGreaterThan(0);
    expect(readReference).not.toHaveBeenCalledWith(replacement.requester);
    const sigInput = screen.getByLabelText(/Sig \(directions\)/i);
    expect(sigInput).toHaveValue('Take 1 tablet daily');
    expect(screen.getByLabelText('Quantity to dispense')).toHaveValue('90');
    expect(screen.getByLabelText('Notes to pharmacist')).toHaveValue('Route to the new pharmacy');
    expect(screen.queryByRole('button', { name: 'Add to cart' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Compound' })).not.toBeInTheDocument();

    await user.clear(sigInput);
    await user.type(sigInput, 'Take 2 tablets daily');
    const quantityInput = screen.getByLabelText('Quantity to dispense');
    await user.clear(quantityInput);
    await user.type(quantityInput, '60');
    await user.click(screen.getByRole('button', { name: 'Re-prescribe' }));

    expect((await screen.findAllByText('Payer Organization not found')).length).toBeGreaterThan(0);
    expect(updateResource.mock.calls.some(([resource]) => (resource as MedicationRequest).status === 'unknown')).toBe(
      false
    );

    await user.click(screen.getByRole('button', { name: 'Re-prescribe' }));

    expect((await screen.findAllByText('bot rejected')).length).toBeGreaterThan(0);
    expect(updateResource.mock.calls.some(([resource]) => (resource as MedicationRequest).status === 'unknown')).toBe(
      true
    );

    await user.click(screen.getByRole('button', { name: 'Re-prescribe' }));

    await waitFor(() => {
      expect(orderMedicationMock).toHaveBeenCalledTimes(3);
      expect(orderMedicationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          patientId: HomerSimpson.id,
          medicationRequestId: replacement.id,
        })
      );
    });
    const updatedReplacement = updateResource.mock.calls
      .map(([resource]) => resource as MedicationRequest)
      .filter((resource) => resource.id === replacement.id && resource.status === 'draft')
      .at(-1);
    expect(updatedReplacement).toMatchObject({
      id: replacement.id,
      priorPrescription: replacement.priorPrescription,
      dosageInstruction: [{ text: 'Take 2 tablets daily', patientInstruction: 'With water' }],
      dispenseRequest: expect.objectContaining({ quantity: { value: 60, unit: 'C48542' } }),
    });
    expect(updatedReplacement?.statusReason).toBeUndefined();
    expect(
      createResource.mock.calls.some(
        ([resource]) => (resource as MedicationRequest).resourceType === 'MedicationRequest'
      )
    ).toBe(false);
    expect(onOrderComplete).toHaveBeenCalledWith({
      launchUrl: 'https://ssu.example/widget/replacement',
      medicationRequestId: replacement.id,
    });
  });

  test('drives the formulation and sig picker through to the draft MedicationRequest body', async () => {
    const medplum = new MockClient();
    mockDrugCatalog([GLUMETZA_CAPSULE_FORMAT, GLUMETZA_STRENGTH_ONLY_FORMAT]);
    orderMedicationMock.mockResolvedValue({ launchUrl: 'https://ssu.example/widget', medicationRequestId: 'mr-1' });
    const createSpy = vi.spyOn(medplum, 'createResource');
    const onOrderComplete = vi.fn();
    const user = userEvent.setup();
    await renderPage(medplum, { patient: HomerSimpson, onOrderComplete });

    await pickMedication(user, '500', 'Glumetza 500 mg tablet');
    await screen.findByText(/Formulation & directions \(3\)/, {}, { timeout: 10000 });
    const panel = within(screen.getByRole('tabpanel'));
    const quantityInput = panel.getByLabelText('Quantity to dispense');
    await waitFor(() => expect(quantityInput).toHaveValue('60'));
    await user.click(screen.getByText('90 Tablet - Take 2 tablets by mouth daily · qty 90'));
    await waitFor(() => expect(quantityInput).toHaveValue('90'));
    fireEvent.change(panel.getByLabelText('Written / start date'), { target: { value: '2026-09-01' } });
    fireEvent.change(panel.getByLabelText('Earliest fill (optional)'), { target: { value: '2026-09-05' } });
    await replaceValue(user, panel.getByLabelText('Days supply'), '40');
    await replaceValue(user, panel.getByLabelText('Refills'), '2');
    await user.type(panel.getByLabelText('Notes to pharmacist'), 'Call before filling');
    await user.type(panel.getByLabelText('Patient instructions (additional)'), 'Take with food');
    await user.click(panel.getByLabelText('Allow substitution'));
    await user.click(screen.getByRole('button', { name: 'Prescribe now' }));

    await waitFor(() =>
      expect(onOrderComplete).toHaveBeenCalledWith(expect.objectContaining({ medicationRequestId: 'mr-1' }))
    );
    expect(createSpy.mock.calls[0][0]).toMatchObject({
      status: 'draft',
      authoredOn: '2026-09-01',
      requester: { reference: getReferenceString(DrAliceSmith) },
      medicationCodeableConcept: { text: 'Glumetza 500 mg tablet', coding: [{ system: NDC, code: '12345678901' }] },
      substitution: { allowedBoolean: false },
      dosageInstruction: [{ text: '90 Tablet - Take 2 tablets by mouth daily', patientInstruction: 'Take with food' }],
      note: [{ text: 'Call before filling' }],
      dispenseRequest: {
        quantity: { value: 90, unit: 'C48542' },
        numberOfRepeatsAllowed: 2,
        expectedSupplyDuration: expect.objectContaining({ value: 40 }),
        validityPeriod: { start: '2026-09-01', end: '2026-09-05' },
      },
    });
  }, 40000);

  test('Add to cart persists through the shared cart hook, and free-text sigs drive the days-supply estimate', async () => {
    const medplum = new MockClient();
    mockDrugCatalog([]);
    const persistCartDraft = vi
      .fn(async (mr: MedicationRequest) => ({ ...mr, id: 'cart-mr-1' }))
      .mockRejectedValueOnce(new Error('cart is full'));
    const onAddedToCart = vi.fn();
    const user = userEvent.setup();
    await renderPage(medplum, { patient: HomerSimpson, onAddedToCart, persistCartDraft, cartCount: 2 });

    expect(await screen.findByText(/2 in cart/)).toBeInTheDocument();
    await pickMedication(user, 'hydro', 'Hydrocortisone 1% cream');
    const panel = within(screen.getByRole('tabpanel'));
    const sigInput = panel.getByLabelText(/Sig \(directions\)/i);
    const quantityInput = panel.getByLabelText('Quantity to dispense');
    const daysSupplyInput = panel.getByLabelText('Days supply');
    const cases: [string, string, string][] = [
      ['Take 1 tablet qid', '40', '10'],
      ['Take 1 tablet tid', '30', '10'],
      ['Take 1 tablet every 2 days', '15', '30'],
      ['Take as needed daily', '12', '12'],
      ['Twice daily', '60', '30'],
    ];
    for (const [sig, qty, days] of cases) {
      fireEvent.change(sigInput, { target: { value: sig } });
      await replaceValue(user, quantityInput, qty);
      await waitFor(() => expect(daysSupplyInput).toHaveValue(days));
    }

    await user.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect(await screen.findByText('cart is full')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add to cart' }));
    await waitFor(() => expect(onAddedToCart).toHaveBeenCalledWith(expect.objectContaining({ id: 'cart-mr-1' })));
    await waitFor(() => expect(screen.queryByLabelText(/Sig \(directions\)/i)).not.toBeInTheDocument());
  }, 40000);

  test('replacement drafts resolve the route patient, linked context, and a different requester', async () => {
    const medplum = new MockClient();
    const subject = createReference(HomerSimpson);
    const otherRequester = await medplum.createResource({ resourceType: 'Practitioner', name: [{ family: 'House' }] });
    const condition = await medplum.createResource({
      resourceType: 'Condition',
      subject,
      code: { text: 'Hypertension' },
    });
    const [coverage, otherCoverage] = await Promise.all(
      ['Acme Health', 'Blue Shield'].map((display) =>
        medplum.createResource({
          resourceType: 'Coverage',
          status: 'active',
          beneficiary: subject,
          payor: [{ display }],
        })
      )
    );
    const otherPharmacy = await medplum.createResource({ resourceType: 'Organization', name: 'Corner Drugs' });
    await medplum.updateResource({
      ...HomerSimpson,
      extension: preferredPharmacies(TestOrganization.id, otherPharmacy.id),
    });
    const replacement: WithId<MedicationRequest> = {
      resourceType: 'MedicationRequest',
      id: 'replacement-context',
      status: 'draft',
      intent: 'order',
      subject: { reference: 'Group/not-a-patient' },
      requester: createReference(otherRequester),
      medicationCodeableConcept: { text: 'Lisinopril 10 mg tablet' },
      reasonReference: [createReference(condition)],
      insurance: [createReference(coverage)],
      dispenseRequest: {
        performer: createReference(TestOrganization),
        validityPeriod: { end: '2026-10-01' },
        quantity: { value: 30, code: 'C48480' },
      },
    };
    orderMedicationMock.mockResolvedValue({
      launchUrl: 'https://ssu.example/context',
      medicationRequestId: replacement.id,
    });
    const updateSpy = vi.spyOn(medplum, 'updateResource');
    const user = userEvent.setup();
    await renderPage(medplum, { replacementMedicationRequest: replacement });

    expect((await screen.findAllByText(/House/)).length).toBeGreaterThan(0);
    const panel = within(screen.getByRole('tabpanel'));
    expect(panel.getByLabelText('Earliest fill (optional)')).toHaveValue('2026-10-01');
    await user.click(screen.getByRole('button', { name: 'Re-prescribe' }));
    await waitFor(() =>
      expect(orderMedicationMock).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: HomerSimpson.id, conditionIds: [condition.id], coverageId: coverage.id })
      )
    );
    const updated = updateSpy.mock.calls.map(([r]) => r as MedicationRequest).find((r) => r.id === replacement.id);
    expect(updated).toMatchObject({
      subject: { reference: getReferenceString(HomerSimpson) },
      requester: { reference: getReferenceString(otherRequester) },
      dispenseRequest: expect.objectContaining({ quantity: { value: 30, unit: 'C48480' } }),
    });

    const coverageSelect = panel.getByRole('textbox', { name: 'Coverage' });
    await waitFor(() => expect(coverageSelect).toBeEnabled());
    await user.click(coverageSelect);
    await user.click(await screen.findByRole('option', { name: 'Blue Shield', hidden: true }));
    await user.click(panel.getByRole('textbox', { name: 'Pharmacy' }));
    await user.click(await screen.findByRole('option', { name: 'Corner Drugs', hidden: true }));
    const asthma = { ...condition, id: 'cond-asthma', code: { text: 'Asthma' } };
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([asthma] as never);
    await user.type(panel.getByRole('searchbox'), 'Asth');
    await user.click(await screen.findByText('Asthma', {}, { timeout: 10000 }));
    await user.click(screen.getByRole('button', { name: 'Re-prescribe' }));
    await waitFor(() => expect(orderMedicationMock).toHaveBeenCalledTimes(2));
    expect(orderMedicationMock.mock.lastCall?.[0]).toMatchObject({
      conditionIds: [asthma.id],
      coverageId: otherCoverage.id,
      pharmacyOrganizationId: otherPharmacy.id,
    });
  }, 30000);

  test('requires a requester and a formulation per compound line before ordering', async () => {
    const medplum = new MockClient({ profile: null });
    const user = userEvent.setup();
    await renderPage(medplum, { patient: HomerSimpson });

    await user.click(await screen.findByRole('button', { name: 'Prescribe now' }));
    expect(await screen.findByText('Patient, requester, and medication are required')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Compound' }));
    const panel = within(screen.getByRole('tabpanel'));
    await user.click(panel.getByRole('button', { name: 'Add drug line' }));
    await user.click(panel.getByRole('button', { name: 'Prescribe' }));
    expect(await screen.findByText('Requester is required')).toBeInTheDocument();

    await user.type(panel.getByRole('searchbox', { name: 'Requester' }), 'Alice');
    await user.click((await screen.findAllByText(/Alice Smith/, {}, { timeout: 10000 }))[0]);
    await user.click(panel.getByRole('button', { name: 'Prescribe' }));
    expect(await screen.findByText('Each compound line needs a selected formulation')).toBeInTheDocument();
    expect(orderMedicationMock).not.toHaveBeenCalled();
  }, 30000);

  test('orders a two-line compound with per-line overrides and reports bot failures', async () => {
    const medplum = new MockClient();
    mockDrugCatalog([GLUMETZA_CAPSULE_FORMAT, GLUMETZA_ROUTED_ONLY_FORMAT]);
    orderMedicationMock
      .mockRejectedValueOnce(new Error('compound rejected'))
      .mockResolvedValueOnce({ launchUrl: 'https://ssu.example/widget/compound', medicationRequestId: undefined });
    const onOrderComplete = vi.fn();
    const user = userEvent.setup();
    await renderPage(medplum, { patient: HomerSimpson, onOrderComplete });

    await user.click(await screen.findByRole('tab', { name: 'Compound' }));
    const panel = within(screen.getByRole('tabpanel'));
    const searches = panel.getAllByLabelText('Search');
    await pickMedication(user, 'hydro', 'Hydrocortisone 1% cream', searches[0]);
    await pickMedication(user, 'glum', 'Glumetza 500 mg tablet', searches[1]);
    await user.click(await screen.findByText('Glumetza 1000 mg tablet'));
    await replaceValue(user, panel.getAllByLabelText('Quantity')[0], '45');
    await replaceValue(user, panel.getAllByLabelText('Refills')[0], '1');
    await user.click(panel.getAllByLabelText('Allow substitution')[0]);
    await replaceValue(user, panel.getByLabelText('Days supply'), '14');
    await user.type(panel.getByLabelText('Notes to pharmacist'), 'Compound please');
    await user.type(panel.getByLabelText('Patient instructions (additional)'), 'Thin layer');
    fireEvent.change(panel.getByLabelText('Written / start date'), { target: { value: '2026-09-02' } });
    fireEvent.change(panel.getByLabelText('Earliest fill (optional)'), { target: { value: '2026-09-06' } });

    await user.click(panel.getByRole('button', { name: 'Prescribe' }));
    expect(await screen.findByText('compound rejected')).toBeInTheDocument();
    expect(orderMedicationMock.mock.calls[0][0]).toMatchObject({
      combinationMed: true,
      durationDays: 14,
      pharmacyNote: 'Compound please',
      writtenDate: '2026-09-02',
      fillDate: '2026-09-06',
      drugs: [
        { gcnSeqno: 12345, quantity: 45, refill: 1, sigLine3: 'Take as directed · Thin layer', useSubstitution: false },
        { routedMedId: 4242, quantity: 30, sigLine3: '30 Tablet - Take 1 tablet daily', useSubstitution: true },
      ],
    });
    await user.click(panel.getByRole('button', { name: 'Prescribe' }));
    await waitFor(() => expect(onOrderComplete).toHaveBeenCalledTimes(1));
  }, 40000);
});
