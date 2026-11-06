// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Claim } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { ClaimDiagnosesEditor, ClaimLinesEditor } from './ClaimEditor';

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
      <ClaimDiagnosesEditor claim={claim} onChange={change} />
      <ClaimLinesEditor claim={claim} onChange={change} />
    </>
  );
}

function setup(initial: Claim = baseClaim): ReturnType<typeof vi.fn> {
  const onChange = vi.fn();
  render(
    <MedplumProvider medplum={new MockClient()}>
      <MantineProvider>
        <Harness initial={initial} onChange={onChange} />
      </MantineProvider>
    </MedplumProvider>
  );
  return onChange;
}

const last = (onChange: ReturnType<typeof vi.fn>): Claim => onChange.mock.calls.at(-1)?.[0] as Claim;

describe('ClaimEditor', () => {
  test('reorders the diagnoses so another becomes principal', async () => {
    const user = userEvent.setup();
    const onChange = setup();

    await user.click(screen.getByRole('textbox', { name: 'Order of I10' }));
    await user.keyboard('{ArrowUp}{Enter}');
    expect(last(onChange).diagnosis?.map((d) => d.diagnosisCodeableConcept?.coding?.[0]?.code)).toEqual([
      'I10',
      'E11.9',
    ]);
  });

  test('adds a diagnosis from the ICD-10 search', async () => {
    const user = userEvent.setup();
    const onChange = setup();

    await user.click(screen.getByRole('button', { name: 'Add a Diagnosis' }));
    await user.type(screen.getByPlaceholderText('Search ICD-10 codes'), 'Test');
    await user.click(await screen.findByText('Test Display'));
    await waitFor(() => expect(last(onChange).diagnosis).toHaveLength(3));
    expect(screen.getByRole('button', { name: 'Add a Diagnosis' })).toBeInTheDocument();
  });

  test('opens the ICD-10 search when the claim has no diagnoses', () => {
    setup({ ...baseClaim, diagnosis: undefined, item: [] });
    expect(screen.getByPlaceholderText('Search ICD-10 codes')).toBeInTheDocument();
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  test('sets the code, modifiers and diagnosis pointers of a line', async () => {
    const user = userEvent.setup();
    const onChange = setup();

    expect(screen.getByText('Required')).toBeInTheDocument();
    await user.click(screen.getByRole('textbox', { name: 'Diagnosis Pointer' }));
    await user.click(await screen.findByText('B · I10'));
    await user.click(await screen.findByText('A · E11.9'));
    expect(last(onChange).item?.[0].diagnosisSequence).toEqual([1, 2]);
    expect(screen.queryByText('Required')).not.toBeInTheDocument();

    const modifiers = screen.getByLabelText('Modifiers');
    await user.type(modifiers, 'Test');
    await user.click(await screen.findByText('Test Display 3'));
    await waitFor(() => expect(last(onChange).item?.[0].modifier).toHaveLength(2));
  });

  test('codes a new line from the CPT search', async () => {
    const user = userEvent.setup();
    const onChange = setup();

    await user.click(screen.getByRole('button', { name: 'Add a Service Line' }));
    await user.type(screen.getByPlaceholderText('Search CPT codes'), 'Test');
    await user.click(await screen.findByText('Test Display 2'));
    await waitFor(() => expect(last(onChange).item?.[1].productOrService?.coding?.[0].code).toBe('test-code-2'));
    await user.click(screen.getByRole('button', { name: 'Remove line 2' }));
    expect(last(onChange).item).toHaveLength(1);
  });

  test('clears the charge of a line', async () => {
    const user = userEvent.setup();
    const onChange = setup();

    await user.clear(screen.getByRole('textbox', { name: 'Charge' }));
    expect(last(onChange).item?.[0].net).toBeUndefined();
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });
});
