// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MockStateJson } from '@medplum/mock';
import { createMockClient, PatientSummaryStates } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { expectTypeOf } from 'vitest';
import { withMockState } from '../stories/decorators';
import { render, screen, waitFor, within } from '../test-utils/render';
import { PatientSummary } from './PatientSummary';
import { BusyPatient, NewPatient, SixGeneratedPatients, TwoPatients } from './PatientSummary.stories';

async function show(state: MockStateJson): Promise<void> {
  const client = await createMockClient(state);
  render(
    <MedplumProvider medplum={client}>
      {Object.entries(state.handles).map(([name, reference]) => (
        <div key={name} data-testid={name}>
          <PatientSummary patient={{ reference }} />
        </div>
      ))}
    </MedplumProvider>
  );
  await waitFor(() => expect(screen.queryAllByTestId('patient-summary-skeleton')).toHaveLength(0));
  await waitFor(() => expect(screen.queryAllByTestId('patient-summary-sections-skeleton')).toHaveLength(0));
}

test('populated app screen renders useful values without Storybook', async () => {
  await show(PatientSummaryStates.busyPatient);
  for (const text of [
    'Alex Morgan',
    'Example Health Plan',
    'Hypertension',
    'Penicillin allergy',
    'Lisinopril 10 mg',
    'Vitamin D',
    'Influenza vaccine',
    'Walk for 30 minutes daily',
    'Lipid panel',
    'Complete blood count',
    'Never smoked tobacco',
    'Heterosexual',
  ]) {
    expect(await screen.findByText(text, { exact: false })).toBeInTheDocument();
  }
  expect(screen.getByText('120 mm[Hg]')).toBeInTheDocument();
  expect(screen.getByText('80 mm[Hg]')).toBeInTheDocument();
  expect(screen.getByText('72 /min')).toBeInTheDocument();
  expect(screen.getByText(/Boston/)).toBeInTheDocument();
  expect(screen.queryByText(/Example (code|patient|subject|payor)/)).toBeNull();
  expect(screen.queryByText('Unknown Payor')).toBeNull();
});

test('empty app screen has no seeded clinical records', async () => {
  await show(PatientSummaryStates.newPatient);
  expect(await screen.findByText('Sam Rivera')).toBeInTheDocument();
  expect(screen.queryByText('Hypertension')).toBeNull();
  expect(screen.queryByText('Example Health Plan')).toBeNull();
  expect(screen.queryByText('72 /min')).toBeNull();
  expect(screen.getAllByText('(none)').length).toBeGreaterThan(0);
});

test('two patients render only their own records', async () => {
  expectTypeOf(PatientSummaryStates.twoPatients.handles).toEqualTypeOf<{ sick: string; well: string }>();
  await show(PatientSummaryStates.twoPatients);
  const sick = within(screen.getByTestId('sick'));
  const well = within(screen.getByTestId('well'));
  expect(await sick.findByText('Asthma')).toBeInTheDocument();
  expect(sick.getByText('Albuterol inhaler')).toBeInTheDocument();
  expect(well.queryByText('Asthma')).toBeNull();
  expect(well.queryByText('Albuterol inhaler')).toBeNull();
  expect(well.getByText('64 /min')).toBeInTheDocument();
  expect(sick.queryByText('64 /min')).toBeNull();
});

test('the Storybook decorator loads the same screen data and restores its clock', async () => {
  const OriginalDate = globalThis.Date;
  const state = PatientSummaryStates.busyPatient;
  const story = (() => <PatientSummary patient={{ reference: state.handles.patient }} />) as Parameters<
    typeof withMockState
  >[0];
  // This decorator only reads parameters; Storybook supplies the remaining context at runtime.
  const context = { parameters: { mockState: state } } as unknown as Parameters<typeof withMockState>[1];
  const view = render(withMockState(story, context));
  try {
    expect(await screen.findByText('Hypertension')).toBeInTheDocument();
    expect(await screen.findByText('120 mm[Hg]')).toBeInTheDocument();
    expect(new Date().getFullYear()).toBe(2020);
  } finally {
    view.unmount();
  }
  expect(globalThis.Date).toBe(OriginalDate);
});

test('Storybook stories use the shared typed fixtures', () => {
  expect(BusyPatient.parameters.mockState).toBe(PatientSummaryStates.busyPatient);
  expect(NewPatient.parameters.mockState).toBe(PatientSummaryStates.newPatient);
  expect(TwoPatients.parameters.mockState).toBe(PatientSummaryStates.twoPatients);
  expect(SixGeneratedPatients.parameters.mockState).toBe(PatientSummaryStates.sixPatients);
});

test('the decorator reports invalid data and switches states without leaking records', async () => {
  const OriginalDate = globalThis.Date;
  const patient = PatientSummaryStates.newPatient.resources[0];
  const invalid = { resources: [patient, patient], handles: {} };
  const decorate = (state: MockStateJson, story: typeof BusyPatient): ReturnType<typeof withMockState> =>
    withMockState(story, {
      parameters: { mockState: state },
    } as unknown as Parameters<typeof withMockState>[1]);
  const view = render(decorate(invalid, BusyPatient));
  try {
    expect(await screen.findByRole('alert')).toHaveTextContent('Duplicate mock resource');
    view.rerender(decorate(BusyPatient.parameters.mockState, BusyPatient));
    expect(await screen.findByText('Hypertension')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    view.rerender(decorate(NewPatient.parameters.mockState, NewPatient));
    expect(await screen.findByText('Sam Rivera')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('(none)').length).toBeGreaterThan(0));
    expect(screen.queryByText('Hypertension')).toBeNull();
    expect(screen.queryByText('Alex Morgan')).toBeNull();
  } finally {
    view.unmount();
  }
  expect(globalThis.Date).toBe(OriginalDate);
});

test('six generated patients render their authored and generated fields with separate readings', async () => {
  await show(PatientSummaryStates.sixPatients);
  for (let index = 0; index < 6; index++) {
    const patient = within(screen.getByTestId(`patient-${index + 1}`));
    expect(patient.getByText(`Example name.given ${index + 1} Demo`)).toBeInTheDocument();
    expect(patient.getByText(`${60 + index} /min`)).toBeInTheDocument();
    expect(patient.queryByText(`${60 + ((index + 1) % 6)} /min`)).toBeNull();
  }
});
