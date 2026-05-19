// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Parameters, Patient, PlanDefinition, Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { SCRIPTSURE_ORDERSET_ID_SYSTEM } from '@medplum/scriptsure-react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { OrderSetPreflightSummary, OrderSetTabPanel } from './OrderSetTabPanel';

const PATIENT: Patient = {
  resourceType: 'Patient',
  id: 'patient-1',
  name: [{ given: ['Order'], family: 'Test' }],
};

const PRACTITIONER: Practitioner = {
  resourceType: 'Practitioner',
  id: 'practitioner-1',
  name: [{ given: ['Dr'], family: 'Webber' }],
};

const SYNCED_PD: PlanDefinition = {
  resourceType: 'PlanDefinition',
  id: 'pd-synced',
  status: 'active',
  title: 'Diabetes starter',
  identifier: [{ system: SCRIPTSURE_ORDERSET_ID_SYSTEM, value: '377' }],
  action: [
    { id: 'a', title: 'Metformin 500 mg', definitionCanonical: 'https://example.com/ad/metformin|1.0.0' },
    { id: 'b', title: 'Jardiance 25 mg', definitionCanonical: 'https://example.com/ad/jardiance|1.0.0' },
  ],
};

const UNSYNCED_PD: PlanDefinition = {
  resourceType: 'PlanDefinition',
  id: 'pd-unsynced',
  status: 'active',
  title: 'Hypertension starter',
  action: [{ id: 'x', title: 'Lisinopril 10 mg' }],
};

const URL_A = 'https://ssu.scriptsure.com/widgets/prescription/order-set/100/377?sessiontoken=tokA';
const ORDER_SET_OPERATION_URL = 'fhir/R4/PlanDefinition/$order-set-url';

function paramsResponse(launchUrl: string): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: [{ name: 'launchUrl', valueUri: launchUrl }],
  };
}

interface HarnessProps {
  initialPatient?: Patient;
  initialRequester?: Practitioner;
  onOrderComplete?: (r: { launchUrl: string; medicationRequestId?: string }) => void;
  medplum: MockClient;
}

function Harness(props: HarnessProps): JSX.Element {
  const [patient, setPatient] = useState(props.initialPatient);
  const [requester, setRequester] = useState(props.initialRequester);
  return (
    <MemoryRouter>
      <MantineProvider>
        <MedplumProvider medplum={props.medplum}>
          <OrderSetTabPanel
            patient={patient}
            requester={requester}
            onPatientChange={setPatient}
            onRequesterChange={setRequester}
            onOrderComplete={props.onOrderComplete}
          />
        </MedplumProvider>
      </MantineProvider>
    </MemoryRouter>
  );
}

function renderPreflight(props: { pd: PlanDefinition | undefined; scriptSureIdEscape: number | undefined }): void {
  render(
    <MantineProvider>
      <OrderSetPreflightSummary pd={props.pd} scriptSureIdEscape={props.scriptSureIdEscape} />
    </MantineProvider>
  );
}

describe('OrderSetTabPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders the form sections', async () => {
    const medplum = new MockClient();
    await act(async () => {
      render(<Harness medplum={medplum} initialPatient={PATIENT} initialRequester={PRACTITIONER} />);
    });
    expect(screen.getByText(/Use ScriptSure orderset id directly/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open prescribing widget/i })).toBeInTheDocument();
  });

  test('submit is disabled until patient + requester + an orderset source are set', async () => {
    const medplum = new MockClient();
    await act(async () => {
      render(<Harness medplum={medplum} />);
    });
    const btn = screen.getByRole('button', { name: /Open prescribing widget/i });
    expect(btn).toBeDisabled();
  });

  test('escape-hatch ScriptSure id sends the $order-set-url operation the right payload', async () => {
    const medplum = new MockClient();
    const post = vi.spyOn(medplum, 'post').mockResolvedValue(paramsResponse(URL_A));
    const onOrderComplete = vi.fn();

    await act(async () => {
      render(
        <Harness
          medplum={medplum}
          initialPatient={PATIENT}
          initialRequester={PRACTITIONER}
          onOrderComplete={onOrderComplete}
        />
      );
    });

    fireEvent.click(screen.getByText(/Use ScriptSure orderset id directly/i));
    const numericInput = screen.getByLabelText(/ScriptSure orderset id/i);
    await act(async () => {
      fireEvent.change(numericInput, { target: { value: '377' } });
    });

    await waitFor(() => expect(post).toHaveBeenCalled());
    const [calledUrl, body] = post.mock.calls.at(-1) ?? [];
    expect(calledUrl?.toString()).toContain(ORDER_SET_OPERATION_URL);
    expect(body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [
        { name: 'patientId', valueId: PATIENT.id },
        { name: 'vendorOrderSetId', valueInteger: 377 },
      ],
    });

    const btn = screen.getByRole('button', { name: /Open prescribing widget/i });
    await waitFor(() => expect(btn).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() => expect(onOrderComplete).toHaveBeenCalledWith({ launchUrl: URL_A }));
  });

  test('preflight summary marks a synced PD with the orderset id badge', () => {
    renderPreflight({ pd: SYNCED_PD, scriptSureIdEscape: undefined });

    expect(screen.getByText(/Diabetes starter/)).toBeInTheDocument();
    expect(screen.getByText(/Synced \(orderset 377\)/)).toBeInTheDocument();
    expect(screen.getByText(/2 drug actions/)).toBeInTheDocument();
    expect(screen.getByText(/Metformin 500 mg/)).toBeInTheDocument();
    expect(screen.getByText(/Jardiance 25 mg/)).toBeInTheDocument();
  });

  test('preflight summary warns when the picked PD is not synced', () => {
    renderPreflight({ pd: UNSYNCED_PD, scriptSureIdEscape: undefined });

    expect(screen.getByText(/Hypertension starter/)).toBeInTheDocument();
    expect(screen.getByText(/^Not synced$/)).toBeInTheDocument();
    expect(screen.getByText(/hasn’t been synced/i)).toBeInTheDocument();
  });

  test('preflight summary handles 0-action PD gracefully', () => {
    renderPreflight({
      pd: { ...UNSYNCED_PD, action: [] },
      scriptSureIdEscape: undefined,
    });
    expect(screen.getByText(/0 drug actions/)).toBeInTheDocument();
    expect(screen.getByText(/has no `action\[\]` entries/i)).toBeInTheDocument();
  });

  test('preflight summary shows escape-hatch message when only ScriptSure id is set', () => {
    renderPreflight({ pd: undefined, scriptSureIdEscape: 999 });
    expect(screen.getByText(/Using ScriptSure orderset id #999/)).toBeInTheDocument();
  });
});
