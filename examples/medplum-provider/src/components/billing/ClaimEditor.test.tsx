// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { CPT, createReference, formatDate, formatDateTime } from '@medplum/core';
import type { ChargeItem, Claim, ClaimItem, Condition, Encounter, Practitioner } from '@medplum/fhirtypes';
import { DrAliceSmith, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { render } from '../../test-utils/render';
import { getLineAuthor, withLineAuthor } from '../../utils/claims';
import { pinClaimEncounter } from './claimConditions';
import { ClaimDiagnosesEditor, ClaimLinesEditor, ClaimVisitDetails } from './ClaimEditor';

const baseClaim: Claim = {
  resourceType: 'Claim',
  status: 'draft',
  use: 'claim',
  created: '2026-09-04',
  type: { coding: [{ code: 'professional' }] },
  priority: { coding: [{ code: 'normal' }] },
  provider: { reference: 'Practitioner/123' },
  patient: { reference: 'Patient/123' },
  insurance: [],
  diagnosis: [
    { sequence: 1, diagnosisCodeableConcept: { coding: [{ code: 'E11.9', display: 'Type 2 diabetes' }] } },
    { sequence: 2, diagnosisCodeableConcept: { coding: [{ code: 'I10', display: 'Hypertension' }] } },
  ],
  item: [
    {
      sequence: 1,
      productOrService: { coding: [{ code: '99214', display: 'Office visit' }] },
      modifier: [{ coding: [{ code: '25', display: 'Significant service' }] }],
      net: { value: 120, currency: 'USD' },
    },
  ],
};

function Harness(props: { readonly initial: Claim; readonly onChange: (claim: Claim) => void }): JSX.Element {
  const [claim, setClaim] = useState(props.initial);
  const change = (next: Claim): void => {
    setClaim(next);
    props.onChange(next);
  };
  return (
    <>
      <ClaimVisitDetails claim={claim} />
      <ClaimDiagnosesEditor claim={claim} onChange={change} />
      <ClaimLinesEditor claim={claim} onChange={change} />
    </>
  );
}

function setup(initial: Claim = baseClaim, medplum = new MockClient()): ReturnType<typeof vi.fn> {
  const onChange = vi.fn();
  render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <Harness initial={initial} onChange={onChange} />
      </MedplumProvider>
    </MemoryRouter>
  );
  return onChange;
}

const last = (onChange: ReturnType<typeof vi.fn>): Claim => onChange.mock.calls.at(-1)?.[0] as Claim;

describe('ClaimEditor', () => {
  test('reorders the diagnoses so another becomes principal', async () => {
    const user = userEvent.setup();
    const onChange = setup();

    await user.click(screen.getByRole('button', { name: 'Actions for I10' }));
    const [a, b] = await screen.findAllByRole('menuitem', { hidden: true });
    expect(a).toHaveTextContent('A');
    expect(b.querySelector('svg')).not.toBeNull();
    await user.click(a);
    expect(last(onChange).diagnosis?.map((d) => d.diagnosisCodeableConcept?.coding?.[0]?.code)).toEqual([
      'I10',
      'E11.9',
    ]);
  });

  test('adds a diagnosis from the ICD-10 search', async () => {
    const user = userEvent.setup();
    const onChange = setup();

    await user.click(screen.getByRole('button', { name: 'Add a Diagnosis' }));
    expect(screen.getAllByPlaceholderText('Search ICD-10 codes').at(-1)).toHaveFocus();
    await user.type(screen.getAllByPlaceholderText('Search ICD-10 codes').at(-1) as HTMLElement, 'Test');
    await user.click(await screen.findByText('Test Display'));
    await waitFor(() => expect(last(onChange).diagnosis).toHaveLength(3));
    expect(screen.getByRole('button', { name: 'Add a Diagnosis' })).toBeInTheDocument();
  });

  test('shows the add button when the claim has no diagnoses, and opens a focused search with its row actions', async () => {
    const user = userEvent.setup();
    setup({ ...baseClaim, diagnosis: undefined, item: [] });
    expect(screen.queryByPlaceholderText('Search ICD-10 codes')).not.toBeInTheDocument();
    expect(screen.getByText('$0.00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add a Diagnosis' }));
    expect(screen.getByPlaceholderText('Search ICD-10 codes')).toHaveFocus();
    // A diagnosis with no code yet has no status, and an x to cancel it.
    expect(screen.queryByRole('button', { name: 'Status of new diagnosis' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actions for new diagnosis' }));
    expect(screen.queryByPlaceholderText('Search ICD-10 codes')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a Diagnosis' })).toBeInTheDocument();
  });

  test('sets the code, modifiers and diagnosis pointers of a line', async () => {
    const user = userEvent.setup();
    const onChange = setup();

    const pointers = document.querySelector('input[name="line-1-pointers"]') as HTMLElement;
    await user.type(pointers, 'I10{Enter}');
    await waitFor(() => expect(last(onChange)?.item?.[0].diagnosisSequence).toEqual([2]));
    await user.clear(pointers);
    await user.type(pointers, 'E11{Enter}');
    await waitFor(() => expect(last(onChange).item?.[0].diagnosisSequence).toEqual([1, 2]));
    await user.hover(within(pointers.parentElement as HTMLElement).getByText('B'));
    await waitFor(() => expect(screen.getAllByText('I10: Hypertension').length).toBeGreaterThan(1));

    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.queryByText(/Significant service/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Select a modifier…')).not.toBeInTheDocument();
    await user.hover(screen.getByText('25'));
    expect(await screen.findByText('25: Significant service')).toBeInTheDocument();
    const modifiers = screen.getByLabelText('Modifiers');
    await user.type(modifiers, 'tEST dISPLAY 3');
    await user.click(await screen.findByText('Test Display 3'));
    await waitFor(() => expect(last(onChange).item?.[0].modifier).toHaveLength(2));
  });

  test('codes a new line from the CPT search', async () => {
    const user = userEvent.setup();
    const onChange = setup();

    await user.click(screen.getByRole('button', { name: 'Add a Service Line' }));
    expect(screen.getByPlaceholderText('Search CPT codes')).toHaveFocus();
    // The new line records who added it.
    expect(getLineAuthor(last(onChange).item?.[1] as ClaimItem).author?.reference).toMatch(/^Practitioner\//);
    await user.type(screen.getByPlaceholderText('Search CPT codes'), 'Test');
    await user.click(await screen.findByText('Test Display 2'));
    await waitFor(() => expect(last(onChange).item?.[1].productOrService?.coding?.[0].code).toBe('test-code-2'));
    await user.click(screen.getByRole('button', { name: 'Move line 2' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Remove' }));
    expect(last(onChange).item).toHaveLength(1);
  });

  test('prices a line as units times unit price, and clears the price', async () => {
    const user = userEvent.setup();
    const onChange = setup();

    expect(screen.getByRole('textbox', { name: 'Unit Price' })).toHaveValue('120.00');
    const units = screen.getByRole('textbox', { name: 'Units' });
    await user.clear(units);
    await user.type(units, '3');
    expect(last(onChange).item?.[0].net?.value).toBe(360);
    const calculated = screen.getByRole('textbox', { name: /Calculated Price/ });
    expect(calculated).toHaveValue('$360.00');
    expect(calculated).toHaveAttribute('readonly');
    expect(screen.getByText('$360.00')).toBeInTheDocument();

    await user.clear(screen.getByRole('textbox', { name: 'Unit Price' }));
    expect(last(onChange).item?.[0].net).toBeUndefined();
    expect(calculated).toHaveValue('');
    expect(screen.getByText('$0.00')).toBeInTheDocument();

    await user.hover(screen.getByText('Calculated Price'));
    expect(await screen.findByRole('link', { name: 'Charge Items' })).toHaveAttribute(
      'href',
      '/settings/billing/charge-items'
    );
  });

  test("shows the visit's details read-only, as edited on the visit", async () => {
    setup({
      ...baseClaim,
      careTeam: [{ sequence: 1, provider: createReference(DrAliceSmith) }],
      item: [
        {
          ...(baseClaim.item?.[0] as ClaimItem),
          locationCodeableConcept: { coding: [{ code: '11', display: 'Office' }] },
        },
      ],
    });

    expect(await screen.findByText(/Alice Smith/)).toBeInTheDocument();
    expect(screen.getByText('11: Office')).toBeInTheDocument();
    expect(screen.getByText('Same as billing organization')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search for practitioner')).not.toBeInTheDocument();
  });

  test('names the visit by its service type and links to it', async () => {
    const medplum = new MockClient();
    const encounter = await medplum.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'finished',
      class: { code: 'AMB' },
      serviceType: { text: 'Primary care' },
      type: [{ text: 'Office visit' }],
      period: { start: '2025-04-07T09:30:15', end: '2025-04-07T10:05:00' },
    });
    setup(
      { ...baseClaim, item: [{ sequence: 1, productOrService: {}, encounter: [createReference(encounter)] }] },
      medplum
    );

    expect(await screen.findByText('Primary care')).toBeInTheDocument();
    // The date shows once, as the date of service, and check in and out are just times, to the minute.
    expect(screen.getByText(formatDate('2025-04-07T09:30:15'))).toBeInTheDocument();
    expect(
      screen.getByText(formatDateTime('2025-04-07T09:30:15', undefined, { hour: 'numeric', minute: '2-digit' }))
    ).toBeInTheDocument();
    expect(screen.queryByText(/Office visit/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Visit' })).toHaveAttribute(
      'href',
      `/${baseClaim.patient.reference}/Encounter/${encounter.id}`
    );
  });
  test("opens each visit diagnosis's history from its author's avatar", async () => {
    const medplum = new MockClient();
    const author = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ given: ['Maria'], family: 'Lopez' }],
    });
    const condition = await medplum.createResource<Condition>({
      resourceType: 'Condition',
      subject: { reference: 'Patient/123' },
      code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'E11.9' }] },
      recorder: createReference(author),
      recordedDate: '2026-11-17T14:14:00Z',
    });
    const encounter = await medplum.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'finished',
      class: { code: 'AMB' },
      diagnosis: [{ condition: createReference(condition), rank: 1 }],
    });
    setup(pinClaimEncounter(baseClaim, createReference(encounter)), medplum);

    expect(await screen.findByText('ML')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'View History' }));
    expect(await screen.findByText('Added ICD-10: E11.9')).toBeInTheDocument();
  });

  test('removes a diagnosis from the menu at the end of its row', async () => {
    const user = userEvent.setup();
    const onChange = setup();

    await user.click(screen.getByRole('button', { name: 'Actions for E11.9' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Remove' }));
    expect(last(onChange).diagnosis?.map((d) => d.diagnosisCodeableConcept?.coding?.[0]?.code)).toEqual(['I10']);
    expect(screen.getByRole('region', { name: 'Diagnoses' })).toBeInTheDocument();
  });
  test('moves a line from its reorder menu', async () => {
    const user = userEvent.setup();
    const onChange = setup();

    await user.click(screen.getByRole('button', { name: 'Add a Service Line' }));
    await user.click(screen.getByRole('button', { name: 'Move line 2' }));
    const [first, second, remove] = await screen.findAllByRole('menuitem', { hidden: true });
    expect(remove).toHaveTextContent('Remove');
    expect(first).toHaveTextContent('1');
    expect(first.querySelector('svg')).toBeNull();
    expect(second.querySelector('svg')).not.toBeNull();
    await user.click(first);
    expect(last(onChange).item?.[1].productOrService?.coding?.[0]?.code).toBe('99214');
  });
  test('notes which other lines already bill a procedure code', async () => {
    const user = userEvent.setup();
    setup({
      ...baseClaim,
      item: [
        { sequence: 1, productOrService: { coding: [{ code: 'test-code', display: 'Test Display' }] } },
        { sequence: 2, productOrService: {} },
      ],
    });

    await user.type(screen.getByPlaceholderText('Search CPT codes'), 'Test');
    expect(await screen.findByText('On line 1')).toBeInTheDocument();
  });
  test('dims and blocks a diagnosis code already on the claim', async () => {
    const user = userEvent.setup();
    const onChange = setup({
      ...baseClaim,
      diagnosis: [
        { sequence: 1, diagnosisCodeableConcept: { coding: [{ code: 'test-code', display: 'Test Display' }] } },
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Add a Diagnosis' }));
    await user.type(screen.getAllByPlaceholderText('Search ICD-10 codes').at(-1) as HTMLElement, 'Test');
    await waitFor(() => expect(document.querySelector('[data-used]')).not.toBeNull());
    expect(onChange).not.toHaveBeenCalled();
  });

  test('shows the diagnoses read-only, with no way to change them', async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={new MockClient()}>
          <ClaimDiagnosesEditor claim={baseClaim} onChange={vi.fn()} readOnly />
        </MedplumProvider>
      </MemoryRouter>
    );

    expect((await screen.findAllByText(/E11\.9/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Actions for I10' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a Diagnosis' })).not.toBeInTheDocument();
  });

  test("opens a line's history from its author's avatar", async () => {
    const user = userEvent.setup();
    const medplum = new MockClient();
    const chargeItem = await medplum.createResource<ChargeItem>({
      resourceType: 'ChargeItem',
      status: 'billable',
      subject: { reference: 'Patient/123' },
      code: { coding: [{ system: CPT, code: '99213' }] },
    });
    await medplum.updateResource<ChargeItem>({ ...chargeItem, code: { coding: [{ system: CPT, code: '99214' }] } });
    const line = withLineAuthor(
      { id: chargeItem.id, sequence: 1, productOrService: { coding: [{ system: CPT, code: '99214' }] } },
      createReference(DrAliceSmith)
    );
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <ClaimLinesEditor lineName="Charge Item" claim={{ ...baseClaim, item: [line] }} onChange={vi.fn()} />
        </MedplumProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole('region', { name: 'Charge Items' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View History' }));
    expect(await screen.findByText('Changed CPT: 99213 → 99214')).toBeInTheDocument();
    expect(screen.getByText('Added CPT: 99213')).toBeInTheDocument();
  });

  test("adds a diagnosis from the patient's conditions on the Existing tab", async () => {
    const user = userEvent.setup();
    const medplum = new MockClient();
    for (const [code, display] of [
      ['I10', 'Hypertension'],
      ['R51.9', 'Headache, unspecified'],
    ]) {
      await medplum.createResource<Condition>({
        resourceType: 'Condition',
        subject: baseClaim.patient,
        clinicalStatus: { coding: [{ code: 'active' }] },
        code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code, display }] },
      });
    }
    const onChange = setup(baseClaim, medplum);

    await user.click(screen.getByRole('button', { name: 'Add a Diagnosis' }));
    await user.click(screen.getAllByPlaceholderText('Search ICD-10 codes').at(-1) as HTMLElement);
    // The dropdown opens on the patient's conditions; one already on the claim is there but can't be picked.
    const existingTab = (await screen.findAllByText('Existing Diagnosis')).at(-1) as HTMLElement;
    const dropdown = within(existingTab.closest('.mantine-Combobox-dropdown') as HTMLElement);
    expect(dropdown.getByLabelText('Existing Diagnosis')).toBeChecked();
    expect(dropdown.getByLabelText('New Diagnosis')).not.toBeChecked();
    // Switching tabs keeps the dropdown open, and the search focused.
    await user.click(dropdown.getByText('New Diagnosis'));
    expect(dropdown.getByLabelText('New Diagnosis')).toBeChecked();
    expect(screen.getAllByPlaceholderText('Search ICD-10 codes').at(-1)).toHaveFocus();
    await user.click(dropdown.getByText('Existing Diagnosis'));
    await user.click(dropdown.getByText('I10'));
    expect(dropdown.getByText('R51.9')).toBeInTheDocument();
    await user.type(screen.getAllByPlaceholderText('Search ICD-10 codes').at(-1) as HTMLElement, 'headache');
    expect(dropdown.queryByText('I10')).not.toBeInTheDocument();
    await user.click(dropdown.getByText('R51.9'));
    expect(last(onChange).diagnosis?.map((d) => d.diagnosisCodeableConcept?.coding?.[0]?.code)).toEqual([
      'E11.9',
      'I10',
      'R51.9',
    ]);
  });

  test('removes the only line or diagnosis with an x, as there is nothing to reorder', async () => {
    const user = userEvent.setup();
    const onChange = setup({ ...baseClaim, diagnosis: baseClaim.diagnosis?.slice(0, 1) });

    await user.click(screen.getByRole('button', { name: 'Move line 1' }));
    expect(last(onChange).item).toEqual([]);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Actions for E11.9' }));
    expect(last(onChange).diagnosis).toEqual([]);
  });
});
