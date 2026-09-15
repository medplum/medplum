// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { notifications, Notifications } from '@mantine/notifications';
import type { MedicationOrderRequest, MedicationOrderResponse, WithId } from '@medplum/core';
import {
  getReferenceString,
  MEDICATION_REQUEST_STATUS_REASON_RESPONSE_NOT_RECEIVED,
  MEDICATION_REQUEST_STATUS_REASON_SYSTEM,
  NDC,
  OperationOutcomeError,
  PATIENT_PREFERRED_PHARMACY_URL,
  PHARMACY_PREFERENCE_TYPE_SYSTEM,
  PHARMACY_TYPE_PRIMARY,
  RXNORM,
} from '@medplum/core';
import type {
  Condition,
  Coverage,
  Medication,
  MedicationRequest,
  Organization,
  Patient,
  Practitioner,
} from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import type * as ScriptSureReactModule from '@medplum/scriptsure-react';
import {
  loadScriptSureQuantityQualifiers,
  SCRIPTSURE_GCN_SEQNO_SYSTEM,
  SCRIPTSURE_GENERIC_NAME_EXTENSION,
  SCRIPTSURE_NAME_TYPE_EXTENSION,
  SCRIPTSURE_ROUTED_MED_ID_SYSTEM,
  SCRIPTSURE_SIG_EXTENSION,
} from '@medplum/scriptsure-react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_QUANTITY_QUALIFIER } from '../../components/meds/quantity-qualifiers';
import type { OrderMedicationPageProps } from './OrderMedicationPage';
import { OptionalContextFields, OrderMedicationPage } from './OrderMedicationPage';

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
});

const GCN_SYSTEM = SCRIPTSURE_GCN_SEQNO_SYSTEM;

/** Brand-name search hit that expands to formulations via its routed-med-id. */
const GLUMETZA_BRAND_HIT: Medication = {
  resourceType: 'Medication',
  id: 'med-glumetza',
  code: { text: 'Glumetza 500 mg tablet' },
  identifier: [{ system: SCRIPTSURE_ROUTED_MED_ID_SYSTEM, value: '4242' }],
  extension: [
    { url: SCRIPTSURE_NAME_TYPE_EXTENSION, valueString: '1' },
    { url: SCRIPTSURE_GENERIC_NAME_EXTENSION, valueString: 'metformin ER' },
  ],
};

/** Generic search hit without a routed-med-id, so the page falls back to a free-text sig. */
const METFORMIN_GENERIC_HIT: Medication = {
  resourceType: 'Medication',
  id: 'med-metformin-generic',
  code: { text: 'metformin ER 500 mg tablet' },
  extension: [{ url: SCRIPTSURE_NAME_TYPE_EXTENSION, valueString: '2' }],
};

/** OTC product with no formulations: ordered on its single GCN plus an explicit drug name. */
const HYDROCORTISONE_HIT: Medication = {
  resourceType: 'Medication',
  id: 'med-hydrocortisone',
  code: { text: 'Hydrocortisone 1% cream' },
  identifier: [{ system: GCN_SYSTEM, value: '12345' }],
};

/** Search hit with no NDC, RxNorm, routed id, or text, so its option key falls back to the code JSON. */
const UNKEYED_HIT: Medication = {
  resourceType: 'Medication',
  id: 'med-mystery',
  code: { coding: [{ system: 'https://example.com/local-formulary', code: 'balm-1', display: 'Mystery balm' }] },
};

const GLUMETZA_CAPSULE_FORMAT: Medication = {
  resourceType: 'Medication',
  id: 'fmt-glumetza-capsule',
  code: {
    text: 'Glumetza 500 mg tablet',
    coding: [
      { system: NDC, code: '12345678901' },
      { system: RXNORM, code: '860975' },
    ],
  },
  extension: [
    {
      url: SCRIPTSURE_SIG_EXTENSION,
      extension: [
        { url: 'sigLine', valueString: '60 Capsule - Take 1 capsule by mouth twice daily' },
        { url: 'quantity', valueInteger: 60 },
        { url: 'quantityQualifier', valueString: 'C48480' },
      ],
    },
    {
      url: SCRIPTSURE_SIG_EXTENSION,
      extension: [
        { url: 'sigLine', valueString: '90 Tablet - Take 2 tablets by mouth daily' },
        { url: 'quantity', valueInteger: 90 },
      ],
    },
    { url: SCRIPTSURE_SIG_EXTENSION, extension: [{ url: 'quantity', valueInteger: 5 }] },
    { url: 'https://example.com/unrelated', valueString: 'ignored' },
  ],
};

/** Formulation with no display text and a GCN carried only as an identifier. */
const GLUMETZA_GCN_ONLY_FORMAT: Medication = {
  resourceType: 'Medication',
  id: 'fmt-glumetza-gcn',
  code: { coding: [{ system: RXNORM, code: '860976' }] },
  identifier: [{ system: GCN_SYSTEM, value: '8346' }],
};

const GLUMETZA_STRENGTH_ONLY_FORMAT: Medication = {
  resourceType: 'Medication',
  id: 'fmt-glumetza-strength',
  code: { text: '500 mg' },
};

const GLUMETZA_ROUTED_ONLY_FORMAT: Medication = {
  resourceType: 'Medication',
  id: 'fmt-glumetza-routed',
  code: { text: 'Glumetza 1000 mg tablet', coding: [{ system: SCRIPTSURE_ROUTED_MED_ID_SYSTEM, code: '4242' }] },
  extension: [
    {
      url: SCRIPTSURE_SIG_EXTENSION,
      extension: [
        { url: 'sigLine', valueString: '30 Tablet - Take 1 tablet daily' },
        { url: 'quantity', valueInteger: 30 },
      ],
    },
  ],
};

const PHARMACY_PRIMARY: Organization = {
  resourceType: 'Organization',
  id: 'org-primary',
  name: 'Main Street Pharmacy',
};
const PHARMACY_SECONDARY: Organization = { resourceType: 'Organization', id: 'org-secondary', name: 'Corner Drugs' };
const PHARMACY_UNNAMED: Organization = { resourceType: 'Organization', id: 'org-unnamed' };

/** Lists the primary pharmacy last so the picker's primary-first sort is observable. */
const PHARMACY_PATIENT: Patient = {
  resourceType: 'Patient',
  id: 'pt-pharmacies',
  name: [{ given: ['Pharma'], family: 'Patient' }],
  extension: [
    {
      url: PATIENT_PREFERRED_PHARMACY_URL,
      extension: [{ url: 'pharmacy', valueReference: { reference: 'Organization/org-secondary' } }],
    },
    {
      url: PATIENT_PREFERRED_PHARMACY_URL,
      extension: [{ url: 'pharmacy', valueReference: { reference: 'Organization/org-unnamed' } }],
    },
    {
      url: PATIENT_PREFERRED_PHARMACY_URL,
      extension: [
        { url: 'pharmacy', valueReference: { reference: 'Organization/org-primary' } },
        {
          url: 'type',
          valueCodeableConcept: { coding: [{ system: PHARMACY_PREFERENCE_TYPE_SYSTEM, code: PHARMACY_TYPE_PRIMARY }] },
        },
      ],
    },
    {
      url: PATIENT_PREFERRED_PHARMACY_URL,
      extension: [{ url: 'pharmacy', valueReference: { reference: 'Organization/org-missing' } }],
    },
  ],
};

const COVERAGE_ACME: Coverage = {
  resourceType: 'Coverage',
  id: 'cov-acme',
  status: 'active',
  beneficiary: { reference: 'Patient/pt-pharmacies' },
  payor: [{ display: 'Acme Health' }],
  class: [{ type: { text: 'plan' }, value: 'gold', name: 'Gold PPO' }],
  subscriberId: 'MEM123',
};

const COVERAGE_BLUE: Coverage = {
  resourceType: 'Coverage',
  id: 'cov-blue',
  status: 'active',
  beneficiary: { reference: 'Patient/pt-pharmacies' },
  payor: [{ reference: 'Organization/blue' }],
};

const CONDITION_TEXT: Condition = {
  resourceType: 'Condition',
  id: 'cond-text',
  subject: { reference: 'Patient/pt-pharmacies' },
  clinicalStatus: { coding: [{ code: 'active' }] },
  code: { text: 'Type 2 diabetes', coding: [{ system: 'http://snomed.info/sct', code: '44054006' }] },
};

const CONDITION_DISPLAY: Condition = {
  resourceType: 'Condition',
  id: 'cond-display',
  subject: { reference: 'Patient/pt-pharmacies' },
  code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'I10', display: 'Essential hypertension' }] },
};

const CONDITION_SYSTEM_CODE: Condition = {
  resourceType: 'Condition',
  id: 'cond-system-code',
  subject: { reference: 'Patient/pt-pharmacies' },
  code: { coding: [{ system: 'http://snomed.info/sct', code: '386661006' }] },
};

const CONDITION_CODE_ONLY: Condition = {
  resourceType: 'Condition',
  id: 'cond-code-only',
  subject: { reference: 'Patient/pt-pharmacies' },
  code: { coding: [{ code: 'R51' }] },
};

const CONDITION_BARE: Condition = {
  resourceType: 'Condition',
  id: 'cond-bare',
  subject: { reference: 'Patient/pt-pharmacies' },
};

type User = ReturnType<typeof userEvent.setup>;

async function renderPage(
  medplum: MockClient,
  props: OrderMedicationPageProps = {},
  route = `/Patient/${HomerSimpson.id}/MedicationRequest`
): Promise<void> {
  await act(async () => {
    render(
      <MantineProvider>
        <Notifications />
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path="/Patient/:patientId/MedicationRequest" element={<OrderMedicationPage {...props} />} />
              <Route path="/order" element={<OrderMedicationPage {...props} />} />
            </Routes>
          </MemoryRouter>
        </MedplumProvider>
      </MantineProvider>
    );
  });
}

/**
 * Routes drug-name searches by substring over the fixture catalog and answers
 * every routed-med-id lookup with `formats`.
 *
 * @param formats - Formulations returned for any routed-med-id lookup.
 */
function mockDrugCatalog(formats: Medication[]): void {
  searchMedicationsMock.mockImplementation(async (input: { term?: string; routedMedId?: number }) => {
    if (input.routedMedId !== undefined) {
      return formats;
    }
    const term = input.term?.toLowerCase() ?? '';
    return [GLUMETZA_BRAND_HIT, METFORMIN_GENERIC_HIT, HYDROCORTISONE_HIT].filter((m) =>
      m.code?.text?.toLowerCase().includes(term)
    );
  });
}

async function pickMedication(user: User, input: HTMLElement, term: string, optionLabel: string): Promise<void> {
  await user.type(input, term);
  await user.click(await screen.findByText(optionLabel, {}, { timeout: 10000 }));
}

async function replaceValue(user: User, input: HTMLElement, value: string): Promise<void> {
  await user.clear(input);
  await user.type(input, value);
}

/**
 * Inactive Mantine tab panels stay mounted but hidden, so queries are scoped to the visible one.
 *
 * @returns Query scope for the active tab panel.
 */
function activePanel(): ReturnType<typeof within> {
  return within(screen.getByRole('tabpanel'));
}

/**
 * Opens a Mantine Select and returns its dropdown scope; jsdom leaves the dropdown flagged hidden while it animates,
 * so callers query options with `hidden: true`.
 *
 * @param user - userEvent session.
 * @param select - The Select's visible input.
 * @returns Query scope for the dropdown listbox.
 */
async function openSelect(user: User, select: HTMLElement): Promise<ReturnType<typeof within>> {
  await user.click(select);
  const dropdownId = select.getAttribute('aria-controls');
  const dropdown = dropdownId ? document.getElementById(dropdownId) : null;
  return dropdown ? within(dropdown) : screen;
}

async function selectOption(user: User, select: HTMLElement, name: string): Promise<void> {
  const scope = await openSelect(user, select);
  await user.click(await scope.findByRole('option', { name, hidden: true }));
}

function createdMedicationRequests(createSpy: { mock: { calls: unknown[][] } }): MedicationRequest[] {
  return createSpy.mock.calls
    .map((c) => c[0] as MedicationRequest | undefined)
    .filter((r): r is MedicationRequest => r?.resourceType === 'MedicationRequest');
}

describe('OrderMedicationPage single medication form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchMedicationsMock.mockResolvedValue([]);
    orderMedicationMock.mockReset();
    notifications.clean();
  });

  test('drives the formulation and sig picker through to the draft MedicationRequest body', async () => {
    const medplum = new MockClient();
    mockDrugCatalog([GLUMETZA_CAPSULE_FORMAT, GLUMETZA_GCN_ONLY_FORMAT, GLUMETZA_STRENGTH_ONLY_FORMAT]);
    orderMedicationMock.mockResolvedValue({ launchUrl: 'https://ssu.example/widget', medicationRequestId: 'mr-1' });
    const createSpy = vi.spyOn(medplum, 'createResource');
    const onOrderComplete = vi.fn();
    const user = userEvent.setup();
    await renderPage(medplum, { patient: HomerSimpson, onOrderComplete });

    await user.type(await screen.findByLabelText(/Search medication/i), '500');
    expect(await screen.findByText('Brand', {}, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.getByText('Generic')).toBeInTheDocument();
    expect(screen.getByText('metformin ER')).toBeInTheDocument();
    await user.click(screen.getByText('Glumetza 500 mg tablet'));

    await screen.findByText(/Formulation & directions \(4\)/, {}, { timeout: 10000 });
    expect(screen.getByText('Option 2')).toBeInTheDocument();
    const quantityInput = screen.getByLabelText('Quantity to dispense');
    const daysSupplyInput = screen.getAllByLabelText('Days supply')[0];
    await waitFor(() => expect(quantityInput).toHaveValue('60'));
    await waitFor(() => expect(daysSupplyInput).toHaveValue('30'));

    await user.click(screen.getByText('90 Tablet - Take 2 tablets by mouth daily · qty 90'));
    await waitFor(() => expect(quantityInput).toHaveValue('90'));
    await waitFor(() => expect(daysSupplyInput).toHaveValue('45'));

    const panel = activePanel();
    fireEvent.change(panel.getByLabelText('Written / start date'), { target: { value: '2026-09-01' } });
    fireEvent.change(panel.getByLabelText('Earliest fill (optional)'), { target: { value: '2026-09-05' } });
    await replaceValue(user, daysSupplyInput, '40');
    await replaceValue(user, panel.getByLabelText('Refills'), '2');
    await user.type(panel.getByLabelText('Notes to pharmacist'), 'Call before filling');
    await user.type(panel.getByLabelText('Patient instructions (additional)'), 'Take with food');
    await user.click(panel.getByLabelText('Allow substitution'));

    await user.click(screen.getByRole('button', { name: 'Prescribe now' }));
    await waitFor(() =>
      expect(onOrderComplete).toHaveBeenCalledWith({
        launchUrl: 'https://ssu.example/widget',
        medicationRequestId: 'mr-1',
      })
    );
    expect(orderMedicationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: HomerSimpson.id,
        writtenDate: '2026-09-01',
        fillDate: '2026-09-05',
        conditionIds: [],
      })
    );
    const [firstDraft] = createdMedicationRequests(createSpy);
    expect(firstDraft).toMatchObject({
      status: 'draft',
      authoredOn: '2026-09-01',
      requester: { reference: getReferenceString(DrAliceSmith) },
      medicationCodeableConcept: {
        text: 'Glumetza 500 mg tablet',
        coding: expect.arrayContaining([{ system: NDC, code: '12345678901' }]),
      },
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

    await user.click(screen.getByText('Option 2'));
    const sigInput = await screen.findByLabelText(/Sig \(directions\)/i);
    await user.type(sigInput, 'Take 1 tablet daily');
    await replaceValue(user, quantityInput, '30');
    await selectOption(
      user,
      panel.getByRole('textbox', { name: 'Quantity qualifier (dispense unit)' }),
      'Capsule (C48480)'
    );
    await user.click(screen.getByRole('button', { name: 'Prescribe now' }));
    await waitFor(() => expect(createdMedicationRequests(createSpy)).toHaveLength(2));
    expect(createdMedicationRequests(createSpy)[1]).toMatchObject({
      medicationCodeableConcept: {
        text: 'Glumetza 500 mg tablet',
        coding: expect.arrayContaining([
          { system: RXNORM, code: '860976' },
          { system: GCN_SYSTEM, code: '8346' },
        ]),
      },
      dosageInstruction: [{ text: 'Take 1 tablet daily' }],
      dispenseRequest: expect.objectContaining({ quantity: { value: 30, unit: 'C48480' } }),
    });

    await user.click(screen.getByText('500 mg'));
    await user.click(screen.getByRole('button', { name: 'Prescribe now' }));
    await waitFor(() => expect(createdMedicationRequests(createSpy)).toHaveLength(3));
    expect(createdMedicationRequests(createSpy)[2].medicationCodeableConcept).toEqual({
      coding: [],
      text: 'Glumetza 500 mg tablet',
    });
  }, 40000);

  test('infers days supply from frequency keywords, intervals, and verb-less sigs', async () => {
    const medplum = new MockClient();
    mockDrugCatalog([]);
    const user = userEvent.setup();
    await renderPage(medplum, { patient: HomerSimpson });
    await pickMedication(
      user,
      await screen.findByLabelText(/Search medication/i),
      'metformin',
      'metformin ER 500 mg tablet'
    );

    const sigInput = screen.getByLabelText(/Sig \(directions\)/i);
    const quantityInput = screen.getByLabelText('Quantity to dispense');
    const daysSupplyInput = screen.getAllByLabelText('Days supply')[0];
    const cases: [string, string, string][] = [
      ['Take 1 tablet qid', '40', '10'],
      ['Take 1 tablet tid', '30', '10'],
      ['Take 1 tablet bid', '60', '30'],
      ['Take 1-2 tablets every eight hours', '60', '10'],
      ['Take 1 tablet q6h', '24', '6'],
      ['Take 1 tablet every 2 days', '15', '30'],
      ['Twice daily', '60', '30'],
      ['Take as needed daily', '30', '30'],
      ['Take 1 tablet every twenty four hours', '14', '14'],
    ];
    for (const [sig, qty, days] of cases) {
      fireEvent.change(sigInput, { target: { value: sig } });
      await replaceValue(user, quantityInput, qty);
      await waitFor(() => expect(daysSupplyInput).toHaveValue(days));
    }

    fireEvent.change(sigInput, { target: { value: 'Take 0 tablets daily' } });
    await replaceValue(user, quantityInput, '12');
    await waitFor(() => expect(quantityInput).toHaveValue('12'));
    expect(daysSupplyInput).toHaveValue('14');

    fireEvent.change(sigInput, { target: { value: 'Rub gently as needed' } });
    await replaceValue(user, quantityInput, '99');
    await waitFor(() => expect(quantityInput).toHaveValue('99'));
    expect(daysSupplyInput).toHaveValue('14');
  }, 40000);

  test('surfaces a validation error instead of ordering when no medication is selected', async () => {
    const medplum = new MockClient();
    const createSpy = vi.spyOn(medplum, 'createResource');
    const user = userEvent.setup();
    await renderPage(medplum, { patient: HomerSimpson });

    await user.click(await screen.findByRole('button', { name: 'Prescribe now' }));

    expect(await screen.findByText('Patient, requester, and medication are required')).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
    expect(orderMedicationMock).not.toHaveBeenCalled();
  });

  test('requires a requester when no practitioner profile is signed in', async () => {
    const medplum = new MockClient({ profile: null });
    const replacement: WithId<MedicationRequest> = {
      resourceType: 'MedicationRequest',
      id: 'replacement-no-profile',
      status: 'draft',
      intent: 'order',
      subject: { reference: `Patient/${HomerSimpson.id}` },
      requester: { reference: 'Practitioner/someone-else' },
      medicationCodeableConcept: { text: 'Lisinopril 10 mg tablet' },
    };
    const readReference = vi.spyOn(medplum, 'readReference');
    const user = userEvent.setup();
    await renderPage(medplum, { patient: HomerSimpson, replacementMedicationRequest: replacement });

    await user.click(await screen.findByRole('button', { name: 'Re-prescribe' }));

    expect(await screen.findByText('Patient, requester, and medication are required')).toBeInTheDocument();
    expect(readReference).not.toHaveBeenCalledWith(replacement.requester);
    expect(orderMedicationMock).not.toHaveBeenCalled();
  });

  test('reports a failed formulation lookup and falls back to the static qualifier catalog', async () => {
    const medplum = new MockClient();
    vi.mocked(loadScriptSureQuantityQualifiers).mockRejectedValueOnce(new Error('no catalog'));
    searchMedicationsMock.mockImplementation(async (input: { term?: string; routedMedId?: number }) => {
      if (input.routedMedId !== undefined) {
        throw new Error('format lookup failed');
      }
      return [GLUMETZA_BRAND_HIT, UNKEYED_HIT];
    });
    const user = userEvent.setup();
    await renderPage(medplum, { patient: HomerSimpson });

    await user.type(await screen.findByLabelText(/Search medication/i), 'glum');
    expect(await screen.findByText('Mystery balm', {}, { timeout: 10000 })).toBeInTheDocument();
    await user.click(screen.getByText('Glumetza 500 mg tablet'));

    expect(await screen.findByText('format lookup failed')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Loading formulations…')).not.toBeInTheDocument());
    expect(screen.queryByText(/Formulation & directions/)).not.toBeInTheDocument();

    const scope = await openSelect(
      user,
      activePanel().getByRole('textbox', { name: 'Quantity qualifier (dispense unit)' })
    );
    expect(await scope.findByRole('option', { name: 'Tablet (C48542)', hidden: true })).toBeInTheDocument();
  });

  test('merges the live quantity-qualifier catalog into the dispense unit picker', async () => {
    const medplum = new MockClient();
    vi.mocked(loadScriptSureQuantityQualifiers).mockResolvedValueOnce([{ code: 'C99999', label: 'Widget' }]);
    const user = userEvent.setup();
    await renderPage(medplum, { patient: HomerSimpson });

    const scope = await openSelect(
      user,
      activePanel().getByRole('textbox', { name: 'Quantity qualifier (dispense unit)' })
    );

    expect(await scope.findByRole('option', { name: 'Widget (C99999)', hidden: true })).toBeInTheDocument();
    expect(scope.getByRole('option', { name: 'Tablet (C48542)', hidden: true })).toBeInTheDocument();
  });

  test('Add to cart is a no-op without a patient and validates once a patient is picked', async () => {
    const medplum = new MockClient();
    const createSpy = vi.spyOn(medplum, 'createResource');
    const onAddedToCart = vi.fn();
    const user = userEvent.setup();
    await renderPage(medplum, { onAddedToCart }, '/order');

    await user.click(await screen.findByRole('button', { name: 'Add to cart' }));

    expect(createSpy).not.toHaveBeenCalled();
    expect(onAddedToCart).not.toHaveBeenCalled();
    expect(screen.queryByText('Patient, requester, and medication are required')).not.toBeInTheDocument();

    const patientInput = activePanel().getAllByRole('searchbox')[0];
    expect(patientInput).toHaveAttribute('name', 'patient');
    await user.type(patientInput, 'Homer');
    await user.click(await screen.findByText('Homer Simpson', {}, { timeout: 10000 }));
    await user.click(screen.getByRole('button', { name: 'Add to cart' }));

    expect(await screen.findByText('Patient, requester, and medication are required')).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  }, 20000);

  test('Add to cart uses the shared cart persister, shows the cart count, and surfaces persist failures', async () => {
    const medplum = new MockClient();
    mockDrugCatalog([]);
    const createSpy = vi.spyOn(medplum, 'createResource');
    const persistCartDraft = vi
      .fn<(mr: MedicationRequest) => Promise<MedicationRequest>>()
      .mockRejectedValueOnce(new Error('cart is full'))
      .mockImplementation(async (mr) => ({ ...mr, id: 'cart-mr-1' }));
    const onAddedToCart = vi.fn();
    const user = userEvent.setup();
    await renderPage(medplum, {
      patient: HomerSimpson,
      onAddedToCart,
      persistCartDraft,
      cartAdding: false,
      cartCount: 2,
    });

    expect(await screen.findByText(/2 in cart/)).toBeInTheDocument();
    await pickMedication(
      user,
      await screen.findByLabelText(/Search medication/i),
      'metformin',
      'metformin ER 500 mg tablet'
    );
    expect(screen.getByLabelText(/Sig \(directions\)/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect(await screen.findByText('cart is full')).toBeInTheDocument();
    expect(onAddedToCart).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Sig \(directions\)/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add to cart' }));
    await waitFor(() => expect(onAddedToCart).toHaveBeenCalledTimes(1));
    expect((onAddedToCart.mock.calls[0][0] as MedicationRequest).id).toBe('cart-mr-1');
    expect(persistCartDraft).toHaveBeenCalledTimes(2);
    expect(createdMedicationRequests(createSpy)).toHaveLength(0);
    await waitFor(() => expect(screen.queryByLabelText(/Sig \(directions\)/i)).not.toBeInTheDocument());
  }, 20000);

  test('replacement drafts resolve the route patient, linked context, and a different requester', async () => {
    const medplum = new MockClient();
    const otherRequester = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ given: ['Gregory'], family: 'House' }],
    });
    const condition = await medplum.createResource<Condition>({
      resourceType: 'Condition',
      subject: { reference: `Patient/${HomerSimpson.id}` },
      code: { text: 'Hypertension' },
    });
    const coverage = await medplum.createResource<Coverage>({
      resourceType: 'Coverage',
      status: 'active',
      beneficiary: { reference: `Patient/${HomerSimpson.id}` },
      payor: [{ display: 'Acme Health' }],
    });
    const pharmacy = await medplum.createResource<Organization>({
      resourceType: 'Organization',
      name: 'Main Street Pharmacy',
    });
    const otherPharmacy = await medplum.createResource<Organization>({
      resourceType: 'Organization',
      name: 'Corner Drugs',
    });
    const otherCoverage = await medplum.createResource<Coverage>({
      resourceType: 'Coverage',
      status: 'active',
      beneficiary: { reference: `Patient/${HomerSimpson.id}` },
      payor: [{ display: 'Blue Shield' }],
    });
    await medplum.updateResource<Patient>({
      ...HomerSimpson,
      extension: [
        {
          url: PATIENT_PREFERRED_PHARMACY_URL,
          extension: [{ url: 'pharmacy', valueReference: { reference: getReferenceString(pharmacy) } }],
        },
        {
          url: PATIENT_PREFERRED_PHARMACY_URL,
          extension: [{ url: 'pharmacy', valueReference: { reference: getReferenceString(otherPharmacy) } }],
        },
      ],
    });
    const replacement: WithId<MedicationRequest> = {
      resourceType: 'MedicationRequest',
      id: 'replacement-context',
      status: 'draft',
      intent: 'order',
      subject: { reference: 'Group/not-a-patient' },
      requester: { reference: getReferenceString(otherRequester) },
      medicationCodeableConcept: { text: 'Lisinopril 10 mg tablet' },
      reasonReference: [{ reference: getReferenceString(condition) }],
      insurance: [{ reference: getReferenceString(coverage) }],
      dispenseRequest: {
        performer: { reference: getReferenceString(pharmacy) },
        validityPeriod: { end: '2026-10-01' },
        quantity: { value: 30, code: 'C48480' },
      },
    };
    orderMedicationMock.mockResolvedValue({
      launchUrl: 'https://ssu.example/widget/context',
      medicationRequestId: replacement.id,
    });
    const updateSpy = vi.spyOn(medplum, 'updateResource');
    const user = userEvent.setup();
    await renderPage(medplum, { replacementMedicationRequest: replacement });

    expect(
      await screen.findByText('Review and edit the replacement prescription before sending it to ScriptSure.')
    ).toBeInTheDocument();
    expect((await screen.findAllByText(/Homer Simpson/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Gregory House/)).length).toBeGreaterThan(0);
    const panel = activePanel();
    expect(panel.getByLabelText('Earliest fill (optional)')).toHaveValue('2026-10-01');

    await user.click(screen.getByRole('button', { name: 'Re-prescribe' }));

    await waitFor(() =>
      expect(orderMedicationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          patientId: HomerSimpson.id,
          medicationRequestId: replacement.id,
          conditionIds: [condition.id],
          coverageId: coverage.id,
          pharmacyOrganizationId: pharmacy.id,
          fillDate: '2026-10-01',
        })
      )
    );
    const updated = updateSpy.mock.calls.map(([r]) => r as MedicationRequest).find((r) => r.id === replacement.id);
    expect(updated).toMatchObject({
      subject: { reference: `Patient/${HomerSimpson.id}` },
      requester: { reference: getReferenceString(otherRequester) },
      reasonReference: [{ reference: getReferenceString(condition) }],
      insurance: [{ reference: getReferenceString(coverage) }],
      dispenseRequest: expect.objectContaining({
        quantity: { value: 30, unit: 'C48480' },
        performer: { reference: getReferenceString(pharmacy), display: 'Main Street Pharmacy' },
        validityPeriod: expect.objectContaining({ end: '2026-10-01' }),
      }),
    });

    const coverageSelect = panel.getByRole('textbox', { name: 'Coverage' });
    await waitFor(() => expect(coverageSelect).toBeEnabled());
    await selectOption(user, coverageSelect, 'Blue Shield');
    const pharmacySelect = panel.getByRole('textbox', { name: 'Pharmacy' });
    await waitFor(() => expect(pharmacySelect).toBeEnabled());
    await selectOption(user, pharmacySelect, 'Corner Drugs');
    const asthma: Condition = {
      resourceType: 'Condition',
      id: 'cond-asthma',
      subject: { reference: `Patient/${HomerSimpson.id}` },
      code: { text: 'Asthma' },
    };
    const originalSearch = medplum.searchResources.bind(medplum);
    vi.spyOn(medplum, 'searchResources').mockImplementation(((resourceType: string, ...rest: unknown[]) =>
      resourceType === 'Condition'
        ? Promise.resolve([asthma])
        : (originalSearch as (...args: unknown[]) => unknown)(resourceType, ...rest)) as MockClient['searchResources']);
    await user.type(panel.getByRole('searchbox'), 'Asth');
    await user.click(await screen.findByText('Asthma', {}, { timeout: 10000 }));
    await user.click(screen.getByRole('button', { name: 'Re-prescribe' }));

    await waitFor(() =>
      expect(orderMedicationMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          conditionIds: [asthma.id],
          coverageId: otherCoverage.id,
          pharmacyOrganizationId: otherPharmacy.id,
        })
      )
    );
  }, 30000);
});

describe('OrderMedicationPage compound tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchMedicationsMock.mockResolvedValue([]);
    orderMedicationMock.mockReset();
    notifications.clean();
  });

  test('requires a patient before ordering a compound', async () => {
    const medplum = new MockClient();
    const user = userEvent.setup();
    await renderPage(medplum, {}, '/order');

    await user.click(await screen.findByRole('tab', { name: 'Compound' }));
    await user.click(screen.getByRole('button', { name: 'Prescribe' }));

    expect(await screen.findByText('Patient is required')).toBeInTheDocument();
    expect(orderMedicationMock).not.toHaveBeenCalled();
  });

  test('requires a requester before ordering a compound', async () => {
    const medplum = new MockClient({ profile: null });
    const user = userEvent.setup();
    await renderPage(medplum, { patient: HomerSimpson });

    await user.click(await screen.findByRole('tab', { name: 'Compound' }));
    await user.click(screen.getByRole('button', { name: 'Prescribe' }));

    expect(await screen.findByText('Requester is required')).toBeInTheDocument();
    expect(orderMedicationMock).not.toHaveBeenCalled();

    const requesterInput = activePanel().getAllByRole('searchbox')[0];
    expect(requesterInput).toHaveAttribute('name', 'requester-c');
    await user.type(requesterInput, 'Alice');
    await user.click((await screen.findAllByText(/Alice Smith/, {}, { timeout: 10000 }))[0]);
    await user.click(screen.getByRole('button', { name: 'Prescribe' }));

    expect(await screen.findByText('Each compound line needs a selected formulation')).toBeInTheDocument();
    expect(orderMedicationMock).not.toHaveBeenCalled();
  }, 20000);

  test('requires every drug line to have a formulation and reports failed lookups', async () => {
    const medplum = new MockClient();
    searchMedicationsMock.mockImplementation(async (input: { term?: string; routedMedId?: number }) => {
      if (input.routedMedId !== undefined) {
        throw new Error('compound format lookup failed');
      }
      return [GLUMETZA_BRAND_HIT, HYDROCORTISONE_HIT].filter((m) =>
        m.code?.text?.toLowerCase().includes(input.term?.toLowerCase() ?? '')
      );
    });
    const user = userEvent.setup();
    await renderPage(medplum, { patient: HomerSimpson });

    await user.click(await screen.findByRole('tab', { name: 'Compound' }));
    const panel = activePanel();
    await user.click(panel.getByRole('button', { name: 'Add drug line' }));
    expect(panel.getByText('Drug line 3')).toBeInTheDocument();

    const searches = panel.getAllByLabelText('Search');
    expect(searches).toHaveLength(3);
    await pickMedication(user, searches[0], 'hydro', 'Hydrocortisone 1% cream');
    const pill = screen.getByText('Hydrocortisone 1% cream');
    const removeButton = pill.parentElement?.querySelector('button');
    expect(removeButton).not.toBeNull();
    await user.click(removeButton as HTMLElement);
    await waitFor(() => expect(screen.queryByText('Hydrocortisone 1% cream')).not.toBeInTheDocument());

    await pickMedication(user, panel.getAllByLabelText('Search')[1], 'glum', 'Glumetza 500 mg tablet');
    expect(await screen.findByText('compound format lookup failed')).toBeInTheDocument();

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
    const panel = activePanel();
    const searches = panel.getAllByLabelText('Search');
    await pickMedication(user, searches[0], 'hydro', 'Hydrocortisone 1% cream');
    await pickMedication(user, searches[1], 'glum', 'Glumetza 500 mg tablet');
    expect(await screen.findByText('Glumetza 1000 mg tablet')).toBeInTheDocument();
    expect(screen.getByText('Formulation')).toBeInTheDocument();

    await replaceValue(user, panel.getAllByLabelText('Quantity')[0], '45');
    await replaceValue(user, panel.getAllByLabelText('Refills')[0], '1');
    await user.click(panel.getAllByLabelText('Allow substitution')[0]);
    await replaceValue(user, panel.getByLabelText('Days supply'), '14');
    await user.type(panel.getByLabelText('Notes to pharmacist'), 'Compound please');
    await user.type(panel.getByLabelText('Patient instructions (additional)'), 'Apply thin layer');
    fireEvent.change(panel.getByLabelText('Written / start date'), { target: { value: '2026-09-02' } });
    fireEvent.change(panel.getByLabelText('Earliest fill (optional)'), { target: { value: '2026-09-06' } });

    await user.click(panel.getByRole('button', { name: 'Prescribe' }));
    expect(await screen.findByText('compound rejected')).toBeInTheDocument();
    expect(onOrderComplete).not.toHaveBeenCalled();
    expect(orderMedicationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: HomerSimpson.id,
        combinationMed: true,
        durationDays: 14,
        pharmacyNote: 'Compound please',
        writtenDate: '2026-09-02',
        fillDate: '2026-09-06',
        drugs: [
          {
            gcnSeqno: 12345,
            drugName: 'Hydrocortisone 1% cream',
            quantity: 45,
            quantityQualifier: DEFAULT_QUANTITY_QUALIFIER,
            refill: 1,
            sigLine3: 'Take as directed · Apply thin layer',
            useSubstitution: false,
          },
          {
            ndc: '12345678901',
            rxNorm: '860975',
            quantity: 30,
            quantityQualifier: 'C48480',
            refill: 0,
            sigLine3: '60 Capsule - Take 1 capsule by mouth twice daily',
            useSubstitution: true,
          },
        ],
      })
    );

    await user.click(screen.getByText('Glumetza 1000 mg tablet'));
    await user.click(panel.getByRole('button', { name: 'Prescribe' }));
    await waitFor(() =>
      expect(onOrderComplete).toHaveBeenCalledWith({
        launchUrl: 'https://ssu.example/widget/compound',
        medicationRequestId: undefined,
      })
    );
    const lastCall = orderMedicationMock.mock.calls.at(-1)?.[0] as { drugs: unknown[] };
    expect(lastCall.drugs[1]).toEqual({
      routedMedId: 4242,
      quantity: 30,
      quantityQualifier: 'C48542',
      refill: 0,
      sigLine3: '30 Tablet - Take 1 tablet daily',
      useSubstitution: true,
    });
  }, 40000);

  test('switches to the order set tab', async () => {
    const medplum = new MockClient();
    const user = userEvent.setup();
    await renderPage(medplum, { patient: HomerSimpson });

    await user.click(await screen.findByRole('tab', { name: 'Order set' }));

    expect(screen.getByRole('tab', { name: 'Order set' })).toHaveAttribute('aria-selected', 'true');
  });
});

interface ContextHarnessProps {
  medplum: MockClient;
  patient: Patient | undefined;
}

function ContextHarness(props: Readonly<ContextHarnessProps>): JSX.Element {
  const [primaryCondition, setPrimaryCondition] = useState<Condition>();
  const [coverage, setCoverage] = useState<Coverage>();
  const [pharmacyOrg, setPharmacyOrg] = useState<Organization>();
  return (
    <MantineProvider>
      <Notifications />
      <MedplumProvider medplum={props.medplum}>
        <OptionalContextFields
          medplum={props.medplum}
          patient={props.patient}
          primaryCondition={primaryCondition}
          setPrimaryCondition={setPrimaryCondition}
          coverage={coverage}
          setCoverage={setCoverage}
          pharmacyOrg={pharmacyOrg}
          setPharmacyOrg={setPharmacyOrg}
        />
        <output data-testid="context-state">
          {JSON.stringify({ condition: primaryCondition?.id, coverage: coverage?.id, pharmacy: pharmacyOrg?.id })}
        </output>
      </MedplumProvider>
    </MantineProvider>
  );
}

function contextState(): { condition?: string; coverage?: string; pharmacy?: string } {
  return JSON.parse(screen.getByTestId('context-state').textContent ?? '{}');
}

describe('OptionalContextFields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notifications.clean();
  });

  test('auto-selects the primary pharmacy and first coverage, and lets the user change both', async () => {
    const medplum = new MockClient();
    const searchSpy = vi.spyOn(medplum, 'searchResources').mockImplementation((async (resourceType: string) => {
      if (resourceType === 'Coverage') {
        return [COVERAGE_ACME, COVERAGE_BLUE];
      }
      if (resourceType === 'Organization') {
        return [PHARMACY_SECONDARY, PHARMACY_PRIMARY, PHARMACY_UNNAMED];
      }
      if (resourceType === 'Condition') {
        return [CONDITION_TEXT, CONDITION_DISPLAY, CONDITION_SYSTEM_CODE, CONDITION_CODE_ONLY, CONDITION_BARE];
      }
      return [];
    }) as unknown as MockClient['searchResources']);
    const user = userEvent.setup();
    await act(async () => {
      render(<ContextHarness medplum={medplum} patient={PHARMACY_PATIENT} />);
    });

    await waitFor(() => expect(contextState()).toEqual({ coverage: 'cov-acme', pharmacy: 'org-primary' }));
    expect(screen.getByText("Select from the patient's active plans")).toBeInTheDocument();
    expect(screen.getByText("Select from the patient's preferred pharmacies")).toBeInTheDocument();

    const coverageSelect = screen.getByRole('textbox', { name: 'Coverage' });
    expect(coverageSelect).toHaveValue('Acme Health · Gold PPO · #MEM123');
    await selectOption(user, coverageSelect, 'Coverage');
    await waitFor(() => expect(contextState().coverage).toBe('cov-blue'));

    const pharmacySelect = screen.getByRole('textbox', { name: 'Pharmacy' });
    expect(pharmacySelect).toHaveValue('Main Street Pharmacy (primary)');
    const pharmacyOptions = await openSelect(user, pharmacySelect);
    expect(await pharmacyOptions.findByRole('option', { name: 'Pharmacy', hidden: true })).toBeInTheDocument();
    await user.click(pharmacyOptions.getByRole('option', { name: 'Corner Drugs', hidden: true }));
    await waitFor(() => expect(contextState().pharmacy).toBe('org-secondary'));

    await user.type(screen.getByLabelText('Condition (diagnosis)'), 'dia');
    expect(await screen.findByText('Type 2 diabetes')).toBeInTheDocument();
    expect(screen.getByText('sct 44054006 · active')).toBeInTheDocument();
    expect(screen.getByText('Essential hypertension')).toBeInTheDocument();
    expect(screen.getByText('icd-10-cm I10')).toBeInTheDocument();
    expect(screen.getByText('http://snomed.info/sct|386661006')).toBeInTheDocument();
    expect(screen.getAllByText('R51')).toHaveLength(2);
    expect(screen.getByText('cond-bare')).toBeInTheDocument();
    const conditionSearch = searchSpy.mock.calls.filter(([resourceType]) => resourceType === 'Condition').at(-1);
    const conditionQuery = (conditionSearch?.[1] as URLSearchParams).toString();
    expect(conditionQuery).toContain('code%3Atext=dia');
    expect(conditionQuery).toContain(`patient=Patient%2F${PHARMACY_PATIENT.id}`);
    await user.click(screen.getByText('Type 2 diabetes'));
    await waitFor(() => expect(contextState().condition).toBe('cond-text'));
  }, 20000);

  test('disables the pickers and explains why when no patient is selected', async () => {
    const medplum = new MockClient();
    await act(async () => {
      render(<ContextHarness medplum={medplum} patient={undefined} />);
    });

    expect(screen.getByText('Condition (diagnosis)')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.getByText('No active coverages on file for this patient')).toBeInTheDocument();
    expect(screen.getByText('No preferred pharmacies on file for this patient')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Coverage' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Pharmacy' })).toBeDisabled();
    expect(contextState()).toEqual({});
  });

  test('surfaces coverage, pharmacy, and condition search failures as notifications', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'searchResources').mockImplementation((async (resourceType: string) => {
      throw new Error(`${resourceType} search failed`);
    }) as unknown as MockClient['searchResources']);
    const user = userEvent.setup();
    await act(async () => {
      render(<ContextHarness medplum={medplum} patient={PHARMACY_PATIENT} />);
    });

    expect(await screen.findByText('Coverage search failed')).toBeInTheDocument();
    expect(await screen.findByText('Organization search failed')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Condition (diagnosis)'), 'dia');
    expect(await screen.findByText('Condition search failed')).toBeInTheDocument();
    expect(contextState()).toEqual({});
  });
});
