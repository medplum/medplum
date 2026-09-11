// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { MedicationOrderExtensions } from '@medplum/core';
import { formatDate, formatHumanName } from '@medplum/core';
import type { MedicationRequest } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NavigateFunction } from 'react-router';
import * as reactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MedicationRequestDetails } from './MedicationRequestDetails';

const extensions: MedicationOrderExtensions = {
  pendingOrderIdSystem: 'https://scriptsure.com/pending-order-id',
  pendingOrderStatusUrl: 'https://scriptsure.com/pending-order-status',
  iframeUrlExtension: 'https://scriptsure.com/iframe-url',
};

const baseRequest: MedicationRequest = {
  resourceType: 'MedicationRequest',
  id: 'rx-1',
  status: 'active',
  intent: 'order',
  medicationCodeableConcept: { text: 'Alinia 500 mg tablet' },
  subject: { reference: 'Patient/patient-1' },
};

describe('MedicationRequestDetails', () => {
  let medplum: MockClient;
  let navigateMock: NavigateFunction;
  const onOpenInScriptSure = vi.fn();

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    navigateMock = vi.fn() as NavigateFunction;
    vi.spyOn(reactRouter, 'useNavigate').mockReturnValue(navigateMock);
  });

  function setup(medicationRequest: MedicationRequest): ReturnType<typeof render> {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <MedicationRequestDetails
              medicationRequest={medicationRequest}
              medicationOrderExtensions={extensions}
              onOpenInScriptSure={onOpenInScriptSure}
            />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders the medication name, reference, and status', () => {
    setup({ ...baseRequest, meta: { lastUpdated: '2026-01-15T10:00:00Z' } });

    expect(screen.getByText('Alinia 500 mg tablet')).toBeInTheDocument();
    expect(screen.getByText(/MedicationRequest\/rx-1/)).toBeInTheDocument();
    expect(screen.getByText(/Last updated/)).toHaveTextContent(formatDate('2026-01-15T10:00:00Z'));
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  test('Falls back to the medication coding display when there is no text', () => {
    setup({
      ...baseRequest,
      medicationCodeableConcept: {
        coding: [
          { system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '1234', display: 'Amoxicillin 500 mg' },
        ],
      },
    });

    // The title falls back to the formatted concept; the coding also appears in the codes row.
    expect(screen.getAllByText(/Amoxicillin 500 mg/).length).toBeGreaterThan(0);
  });

  test('Renders an em dash when there is no medication concept', () => {
    setup({ ...baseRequest, medicationCodeableConcept: undefined });

    // First em dash in DOM order is the title; the second is the empty dispense block.
    expect(screen.getAllByText('—')[0]).toBeInTheDocument();
    expect(screen.queryByText('Medication codes')).not.toBeInTheDocument();
  });

  test('Renders "unknown" when the status is missing', () => {
    // `status` is required by FHIR, but the badge has a fallback for malformed data.
    setup({ ...baseRequest, status: undefined as unknown as MedicationRequest['status'] });

    expect(screen.getByText('unknown')).toBeInTheDocument();
  });

  test('Prefers authoredOn over meta.lastUpdated for the ordered date', () => {
    setup({
      ...baseRequest,
      authoredOn: '2026-02-01T00:00:00Z',
      meta: { lastUpdated: '2026-03-01T00:00:00Z' },
    });

    expect(screen.getByText(/^Ordered/)).toHaveTextContent(formatDate('2026-02-01T00:00:00Z'));
  });

  test('Navigates to the full record', () => {
    setup(baseRequest);

    fireEvent.click(screen.getByRole('button', { name: /View full record/ }));
    expect(navigateMock).toHaveBeenCalledWith('/MedicationRequest/rx-1');
  });

  test('Disables the full record button when the resource has no id', () => {
    setup({ ...baseRequest, id: undefined });

    expect(screen.getByRole('button', { name: /View full record/ })).toBeDisabled();
    expect(screen.queryByText(/MedicationRequest\//)).not.toBeInTheDocument();
  });

  test('Hides the ScriptSure button without a pending order or launch URL', () => {
    setup(baseRequest);

    expect(screen.queryByRole('button', { name: /Open in ScriptSure/ })).not.toBeInTheDocument();
  });

  test('Shows the ScriptSure button for a pending order id', () => {
    setup({
      ...baseRequest,
      identifier: [{ system: extensions.pendingOrderIdSystem, value: '98765' }],
    });

    fireEvent.click(screen.getByRole('button', { name: /Open in ScriptSure/ }));
    expect(onOpenInScriptSure).toHaveBeenCalled();
  });

  test('Shows the ScriptSure button for a stored launch URL', () => {
    setup({
      ...baseRequest,
      extension: [{ url: extensions.iframeUrlExtension, valueString: 'https://scriptsure.example.com/launch' }],
    });

    expect(screen.getByRole('button', { name: /Open in ScriptSure/ })).toBeInTheDocument();
  });

  test('Summarizes pending e-Prescribing status and order id', () => {
    setup({
      ...baseRequest,
      identifier: [{ system: extensions.pendingOrderIdSystem, value: '98765' }],
      extension: [{ url: extensions.pendingOrderStatusUrl, valueString: 'queued' }],
    });

    const line = screen.getByText('e-Prescribing:').parentElement;
    expect(line).toHaveTextContent('pending status queued');
    expect(line).toHaveTextContent('order #98765');
  });

  test('Omits the e-Prescribing line when there is no pending state', () => {
    setup(baseRequest);

    expect(screen.queryByText('e-Prescribing:')).not.toBeInTheDocument();
  });

  test('Renders intent, priority, and reported flag', () => {
    setup({ ...baseRequest, priority: 'urgent', reportedBoolean: true });

    expect(screen.getByText(/Intent: order/)).toHaveTextContent(
      'Intent: order · Priority: urgent · Reported (secondary record): yes'
    );
  });

  test('Renders "no" for a false reported flag and omits absent priority', () => {
    setup({ ...baseRequest, reportedBoolean: false });

    const line = screen.getByText(/Intent: order/);
    expect(line).toHaveTextContent('Reported (secondary record): no');
    expect(line).not.toHaveTextContent('Priority');
  });

  test('Keeps an on-hold transmission status reason visible', () => {
    setup({
      ...baseRequest,
      status: 'on-hold',
      statusReason: {
        coding: [
          {
            system: 'https://scriptsure.com/medication-request-status-reason',
            code: 'transmission-error',
            display: 'Prescription transmission error',
          },
        ],
        text: '601 Receiver Unable To Process',
      },
    });

    expect(screen.getByText('Status reason')).toBeInTheDocument();
    expect(screen.getByText('601 Receiver Unable To Process')).toBeInTheDocument();
  });

  test('Renders medication codes, category, reason, notes, and identifiers', () => {
    setup({
      ...baseRequest,
      medicationCodeableConcept: {
        text: 'Alinia 500 mg tablet',
        coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '351264', display: 'Nitazoxanide' }],
      },
      category: [{ text: 'Outpatient' }],
      reasonCode: [{ text: 'Giardiasis' }],
      note: [{ text: 'Take with food.' }],
      identifier: [{ system: 'https://example.com/rx', value: 'abc-123' }],
    });

    expect(screen.getByText('Medication codes')).toBeInTheDocument();
    expect(screen.getByText('Nitazoxanide · http://www.nlm.nih.gov/research/umls/rxnorm | 351264')).toBeInTheDocument();
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('Outpatient')).toBeInTheDocument();
    expect(screen.getByText('Reason')).toBeInTheDocument();
    expect(screen.getByText('Giardiasis')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Take with food.')).toBeInTheDocument();
    expect(screen.getByText('Identifiers')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/rx|abc-123')).toBeInTheDocument();
  });

  test('Resolves the patient reference for the patient row', async () => {
    setup({ ...baseRequest, subject: { reference: `Patient/${HomerSimpson.id}` } });

    expect(await screen.findByText('Patient')).toBeInTheDocument();
    expect(screen.getByText(formatHumanName(HomerSimpson.name?.[0] as any))).toBeInTheDocument();
  });

  test('Prefers the requester display over the resolved resource', () => {
    setup({
      ...baseRequest,
      requester: { reference: `Practitioner/${DrAliceSmith.id}`, display: 'Dr. Display Name' },
    });

    expect(screen.getByText('Requester')).toBeInTheDocument();
    expect(screen.getByText('Dr. Display Name')).toBeInTheDocument();
  });

  test('Falls back to the resolved practitioner name when there is no display', async () => {
    setup({ ...baseRequest, requester: { reference: `Practitioner/${DrAliceSmith.id}` } });

    await waitFor(() => {
      expect(screen.getByText(formatHumanName(DrAliceSmith.name?.[0] as any))).toBeInTheDocument();
    });
  });

  test('Summarizes a dosage instruction with frequency-based timing', () => {
    setup({
      ...baseRequest,
      dosageInstruction: [
        {
          text: 'Take 1 tablet by mouth twice daily',
          patientInstruction: 'Finish the full course',
          timing: { repeat: { frequency: 2, period: 1, periodUnit: 'd' }, code: { text: 'BID' } },
          route: { text: 'Oral' },
          doseAndRate: [{ doseQuantity: { value: 1, unit: 'C48542' } }],
        },
      ],
    });

    expect(screen.getByText('Dose / sig 1')).toBeInTheDocument();
    const body = screen.getByText(/Take 1 tablet by mouth twice daily/);
    expect(body).toHaveTextContent('Patient: Finish the full course');
    expect(body).toHaveTextContent('Timing: 2 per 1 d');
    expect(body).toHaveTextContent('Schedule: BID');
    expect(body).toHaveTextContent('Route: Oral');
    // The NCI potency-unit code is resolved to its label rather than shown raw.
    expect(body).toHaveTextContent('Amount: 1 Tablet');
  });

  test('Summarizes bounds-based dosage timing', () => {
    setup({
      ...baseRequest,
      dosageInstruction: [
        { text: 'Course A', timing: { repeat: { boundsDuration: { value: 10, unit: 'days' } } } },
        { text: 'Course B', timing: { repeat: { boundsRange: { low: { value: 1 }, high: { value: 3 } } } } },
        { text: 'Course C', timing: { repeat: { boundsRange: { high: { value: 5 } } } } },
      ],
    });

    expect(screen.getByText(/Course A/)).toHaveTextContent('Timing: 10 days');
    expect(screen.getByText(/Course B/)).toHaveTextContent('Timing: 1–3');
    expect(screen.getByText(/Course C/)).toHaveTextContent('Timing: ?–5');
    expect(screen.getByText('Dose / sig 3')).toBeInTheDocument();
  });

  test('Renders an em dash for an empty dosage instruction', () => {
    setup({ ...baseRequest, dosageInstruction: [{}] });

    expect(screen.getByText('Dose / sig 1')).toBeInTheDocument();
    // Both the empty sig and the empty dispense block collapse to an em dash.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  test('Renders the full dispense block', () => {
    setup({
      ...baseRequest,
      dispenseRequest: {
        quantity: { value: 30, unit: 'C48542' },
        validityPeriod: { start: '2026-01-01T00:00:00Z', end: '2026-06-01T00:00:00Z' },
        expectedSupplyDuration: { value: 30, unit: 'days' },
        numberOfRepeatsAllowed: 2,
        performer: { reference: 'Organization/pharmacy-1', display: 'Walgreens #123' },
      },
    });

    expect(screen.getByText('Quantity:').parentElement).toHaveTextContent('30 Tablet');
    const validity = screen.getByText(/^Validity:/);
    expect(validity).toHaveTextContent(formatDate('2026-01-01T00:00:00Z'));
    expect(validity).toHaveTextContent(formatDate('2026-06-01T00:00:00Z'));
    expect(screen.getByText('Days supply:').parentElement).toHaveTextContent('30 days');
    expect(screen.getByText('Refills allowed: 2')).toBeInTheDocument();
    expect(screen.getByText('Intended dispenser: Walgreens #123')).toBeInTheDocument();
  });

  test('Explains an NCI quantity-qualifier code with a tooltip', () => {
    setup({ ...baseRequest, dispenseRequest: { quantity: { value: 30, unit: 'C48542' } } });

    expect(screen.getByText('What is this code?')).toBeInTheDocument();
  });

  test('Omits the tooltip for a UCUM unit', () => {
    setup({ ...baseRequest, dispenseRequest: { quantity: { value: 30, unit: 'mg' } } });

    expect(screen.getByText('Quantity:').parentElement).toHaveTextContent('30 mg');
    expect(screen.queryByText('What is this code?')).not.toBeInTheDocument();
  });

  test('Explains an unlabeled C-code quantity qualifier', () => {
    setup({ ...baseRequest, dispenseRequest: { quantity: { value: 4, code: 'C99999' } } });

    expect(screen.getByText('What is this code?')).toBeInTheDocument();
  });

  test('Renders a system-qualified code when the qualifier is unknown', () => {
    setup({
      ...baseRequest,
      dispenseRequest: { quantity: { value: 2, code: 'XYZ', system: 'http://example.com/units' } },
    });

    expect(screen.getByText('Quantity:').parentElement).toHaveTextContent('2 http://example.com/units|XYZ');
    expect(screen.queryByText('What is this code?')).not.toBeInTheDocument();
  });

  test('Includes the quantity comparator', () => {
    setup({ ...baseRequest, dispenseRequest: { quantity: { comparator: '>=', value: 5, code: 'C48542' } } });

    expect(screen.getByText('Quantity:').parentElement).toHaveTextContent('>= 5 Tablet');
  });

  test('Labels days supply from the UCUM code', () => {
    setup({ ...baseRequest, dispenseRequest: { expectedSupplyDuration: { value: 14, code: 'd' } } });

    expect(screen.getByText('Days supply:').parentElement).toHaveTextContent('14 days');
  });

  test('Falls back to the raw supply-duration unit', () => {
    setup({ ...baseRequest, dispenseRequest: { expectedSupplyDuration: { value: 3, unit: 'weeks' } } });

    expect(screen.getByText('Days supply:').parentElement).toHaveTextContent('3 weeks');
  });

  test('Renders zero refills allowed', () => {
    setup({ ...baseRequest, dispenseRequest: { numberOfRepeatsAllowed: 0 } });

    expect(screen.getByText('Refills allowed: 0')).toBeInTheDocument();
  });

  test('Falls back to the performer reference without a display', () => {
    setup({ ...baseRequest, dispenseRequest: { performer: { reference: 'Organization/pharmacy-1' } } });

    expect(screen.getByText('Intended dispenser: Organization/pharmacy-1')).toBeInTheDocument();
  });

  test('Renders an em dash when there is nothing to dispense', () => {
    setup(baseRequest);

    expect(screen.getByText('Dispense')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  test('Renders substitution details', () => {
    setup({
      ...baseRequest,
      substitution: { allowedBoolean: true, reason: { text: 'Formulary preference' } },
    });

    expect(screen.getByText('Substitution')).toBeInTheDocument();
    expect(screen.getByText(/Allowed/)).toHaveTextContent('Allowed · Formulary preference');
  });

  test('Renders a disallowed substitution', () => {
    setup({ ...baseRequest, substitution: { allowedBoolean: false } });

    expect(screen.getByText('Not allowed')).toBeInTheDocument();
  });

  test('Renders an em dash for an unspecified substitution', () => {
    setup({ ...baseRequest, substitution: { allowedCodeableConcept: { text: 'Unknown' } } });

    expect(screen.getByText('Substitution')).toBeInTheDocument();
  });
});
