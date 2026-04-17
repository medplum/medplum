// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { Condition } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { ProblemList } from './ProblemList';

const medplum = new MockClient();

describe('PatientSummary - ProblemList', () => {
  async function setup(children: ReactNode): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders empty', async () => {
    await setup(<ProblemList patient={HomerSimpson} problems={[]} />);
    expect(screen.getByText('Problems')).toBeInTheDocument();
  });

  test('Renders existing', async () => {
    await setup(
      <ProblemList
        patient={HomerSimpson}
        problems={[
          {
            resourceType: 'Condition',
            id: 'peanut',
            subject: { reference: 'Patient/123' },
            code: { text: 'Peanut' },
          },
        ]}
      />
    );
    expect(screen.getByText('Problems')).toBeInTheDocument();
    expect(screen.getByText('Peanut')).toBeInTheDocument();
  });

  test('Add problem', async () => {
    await setup(<ProblemList patient={HomerSimpson} problems={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Add item'));
    });

    // Enter problem "Dizziness"
    const input = (await screen.findAllByRole('searchbox'))[0] as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Dizziness' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Enter Dx Date
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Dx Date *'), { target: { value: '2021-01-01' } });
    });

    // Click "Save" button
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
  });

  test('Edit problem', async () => {
    const condition: Condition = {
      resourceType: 'Condition',
      id: 'dizziness',
      subject: createReference(HomerSimpson),
      code: { text: 'Dizziness' },
    };

    await setup(<ProblemList patient={HomerSimpson} problems={[condition]} />);

    await act(async () => {
      fireEvent.click(screen.getByText('Dizziness'));
    });

    // Enter problem "Dizziness"
    const input = (await screen.findAllByRole('searchbox'))[0] as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Dizziness' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Enter Dx Date
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Dx Date *'), { target: { value: '2021-01-01' } });
    });

    // Click "Save" button
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
  });

  test('Collapses duplicate conditions by code', async () => {
    await setup(
      <ProblemList
        patient={HomerSimpson}
        problems={[
          {
            resourceType: 'Condition',
            id: 'diabetes-1',
            subject: createReference(HomerSimpson),
            code: {
              coding: [{ system: 'http://snomed.info/sct', code: '73211009', display: 'Diabetes mellitus' }],
            },
            onsetDateTime: '2020-01-01',
          },
          {
            resourceType: 'Condition',
            id: 'diabetes-2',
            subject: createReference(HomerSimpson),
            code: {
              coding: [{ system: 'http://snomed.info/sct', code: '73211009', display: 'Diabetes mellitus' }],
            },
            onsetDateTime: '2021-06-15',
          },
          {
            resourceType: 'Condition',
            id: 'diabetes-3',
            subject: createReference(HomerSimpson),
            code: {
              coding: [{ system: 'http://snomed.info/sct', code: '73211009', display: 'Diabetes mellitus' }],
            },
            onsetDateTime: '2022-03-10',
          },
        ]}
      />
    );

    // Only one row rendered in collapsed state
    expect(screen.getAllByText('Diabetes mellitus')).toHaveLength(1);
    // Count badge shows +2 hidden entries
    expect(screen.getByText('+2')).toBeInTheDocument();
    // Expand link shown
    expect(screen.getByText('Show all 3 entries')).toBeInTheDocument();
  });

  test('Expands and collapses duplicate group', async () => {
    await setup(
      <ProblemList
        patient={HomerSimpson}
        problems={[
          {
            resourceType: 'Condition',
            id: 'hyp-1',
            subject: createReference(HomerSimpson),
            code: { coding: [{ system: 'http://snomed.info/sct', code: '38341003', display: 'Hypertension' }] },
            onsetDateTime: '2019-05-01',
          },
          {
            resourceType: 'Condition',
            id: 'hyp-2',
            subject: createReference(HomerSimpson),
            code: { coding: [{ system: 'http://snomed.info/sct', code: '38341003', display: 'Hypertension' }] },
            onsetDateTime: '2021-09-20',
          },
        ]}
      />
    );

    expect(screen.getAllByText('Hypertension')).toHaveLength(1);
    expect(screen.getByText('+1')).toBeInTheDocument();

    // Expand the group
    await act(async () => {
      fireEvent.click(screen.getByText('Show all 2 entries'));
    });

    // Both entries now visible
    expect(screen.getAllByText('Hypertension')).toHaveLength(2);
    expect(screen.queryByText('+1')).not.toBeInTheDocument();
    expect(screen.getByText('Show less')).toBeInTheDocument();

    // Collapse again
    await act(async () => {
      fireEvent.click(screen.getByText('Show less'));
    });

    expect(screen.getAllByText('Hypertension')).toHaveLength(1);
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  test('Does not show expand button for unique conditions', async () => {
    await setup(
      <ProblemList
        patient={HomerSimpson}
        problems={[
          {
            resourceType: 'Condition',
            id: 'unique-1',
            subject: createReference(HomerSimpson),
            code: { text: 'Unique Problem' },
          },
        ]}
      />
    );

    expect(screen.getByText('Unique Problem')).toBeInTheDocument();
    expect(screen.queryByText(/Show all/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+\d/)).not.toBeInTheDocument();
  });

  test('Problem status colors', async () => {
    await setup(
      <ProblemList
        patient={HomerSimpson}
        problems={[
          {
            resourceType: 'Condition',
            id: 'active',
            subject: createReference(HomerSimpson),
            code: { text: 'Active Problem' },
            clinicalStatus: {
              coding: [
                {
                  code: 'active',
                  system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
                  display: 'Active',
                },
              ],
            },
          },
          {
            resourceType: 'Condition',
            id: 'inactive',
            subject: createReference(HomerSimpson),
            code: { text: 'Inactive Problem' },
            clinicalStatus: {
              coding: [
                {
                  code: 'inactive',
                  system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
                  display: 'Inactive',
                },
              ],
            },
          },
          {
            resourceType: 'Condition',
            id: 'remission',
            subject: createReference(HomerSimpson),
            code: { text: 'Remission Problem' },
            clinicalStatus: {
              coding: [
                {
                  code: 'remission',
                  system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
                  display: 'Remission',
                },
              ],
            },
          },
          {
            resourceType: 'Condition',
            id: 'resolved',
            subject: createReference(HomerSimpson),
            code: { text: 'Resolved Problem' },
            clinicalStatus: {
              coding: [
                {
                  code: 'resolved',
                  system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
                  display: 'Resolved',
                },
              ],
            },
          },
        ]}
      />
    );

    const activeBadge = screen.getByText('active').closest('[class*="mantine-Badge-root"]');
    expect(activeBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-green-light-color)' });

    const inactiveBadge = screen.getByText('inactive').closest('[class*="mantine-Badge-root"]');
    expect(inactiveBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-orange-light-color)' });

    const remissionBadge = screen.getByText('remission').closest('[class*="mantine-Badge-root"]');
    expect(remissionBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-blue-light-color)' });

    const resolvedBadge = screen.getByText('resolved').closest('[class*="mantine-Badge-root"]');
    expect(resolvedBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-teal-light-color)' });
  });
});
