// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { Immunization } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen, selectAutocompleteOption } from '../test-utils/render';
import { Immunizations } from './Immunizations';

const medplum = new MockClient();

describe('PatientSummary - Immunizations', () => {
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
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  test('Renders empty', async () => {
    await setup(<Immunizations patient={HomerSimpson} immunizations={[]} />);
    expect(screen.getByText('Immunizations')).toBeInTheDocument();
    expect(screen.getByText('(none)')).toBeInTheDocument();
  });

  test('Renders existing with vaccine, status, and date', async () => {
    await setup(
      <Immunizations
        patient={HomerSimpson}
        immunizations={[
          {
            resourceType: 'Immunization',
            id: 'flu',
            status: 'completed',
            patient: createReference(HomerSimpson),
            vaccineCode: { text: 'Influenza vaccine' },
            occurrenceDateTime: '2026-01-15T00:00:00Z',
          },
        ]}
      />
    );
    expect(screen.getByText('Influenza vaccine')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText(/Given/)).toBeInTheDocument();
  });

  test('Add immunization', async () => {
    await setup(<Immunizations patient={HomerSimpson} immunizations={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Add item'));
    });

    const input = await screen.findByRole('searchbox');
    await selectAutocompleteOption(input, 'Test', 'Test Display');
    expect(screen.getByText('Test Display')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
  });

  test('Edit immunization', async () => {
    const immunization: Immunization = {
      resourceType: 'Immunization',
      id: 'flu',
      status: 'completed',
      patient: createReference(HomerSimpson),
      vaccineCode: { text: 'Influenza vaccine' },
      occurrenceDateTime: '2026-01-15T00:00:00Z',
    };

    await setup(<Immunizations patient={HomerSimpson} immunizations={[immunization]} />);

    await act(async () => {
      fireEvent.click(screen.getByText('Influenza vaccine'));
    });

    expect(await screen.findByText('Edit Immunization')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
  });

  test('Add modal omits Delete button and entered-in-error status', async () => {
    await setup(<Immunizations patient={HomerSimpson} immunizations={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Add item'));
    });

    expect(await screen.findByText('Add Immunization')).toBeInTheDocument();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    expect(screen.queryByText('entered-in-error')).not.toBeInTheDocument();
    // Status radio labels are capitalized with hyphens removed.
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Not Done')).toBeInTheDocument();
    expect(screen.queryByText('not-done')).not.toBeInTheDocument();
  });

  test('Delete immunization', async () => {
    const created = await medplum.createResource<Immunization>({
      resourceType: 'Immunization',
      status: 'completed',
      patient: createReference(HomerSimpson),
      vaccineCode: { text: 'Influenza vaccine' },
      occurrenceDateTime: '2026-01-15T00:00:00Z',
    });

    await setup(<Immunizations patient={HomerSimpson} immunizations={[created]} />);

    await act(async () => {
      fireEvent.click(screen.getByText('Influenza vaccine'));
    });

    const deleteButton = await screen.findByText('Delete');
    await act(async () => {
      fireEvent.click(deleteButton);
    });

    expect(screen.queryByText('Influenza vaccine')).not.toBeInTheDocument();
  });

  test('Immunization status colors', async () => {
    await setup(
      <Immunizations
        patient={HomerSimpson}
        immunizations={[
          {
            resourceType: 'Immunization',
            id: 'completed',
            status: 'completed',
            patient: createReference(HomerSimpson),
            vaccineCode: { text: 'Completed Vaccine' },
          },
          {
            resourceType: 'Immunization',
            id: 'not-done',
            status: 'not-done',
            patient: createReference(HomerSimpson),
            vaccineCode: { text: 'Not Done Vaccine' },
          },
        ]}
      />
    );

    const completedBadge = screen.getByText('completed').closest('[class*="mantine-Badge-root"]');
    expect(completedBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-green-light-color)' });

    const notDoneBadge = screen.getByText('not done').closest('[class*="mantine-Badge-root"]');
    expect(notDoneBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-gray-light-color)' });
  });

  test('Hides entered-in-error immunizations', async () => {
    await setup(
      <Immunizations
        patient={HomerSimpson}
        immunizations={[
          {
            resourceType: 'Immunization',
            id: 'shown',
            status: 'completed',
            patient: createReference(HomerSimpson),
            vaccineCode: { text: 'Shown Vaccine' },
          },
          {
            resourceType: 'Immunization',
            id: 'hidden',
            status: 'entered-in-error',
            patient: createReference(HomerSimpson),
            vaccineCode: { text: 'Hidden Vaccine' },
          },
        ]}
      />
    );

    expect(screen.getByText('Shown Vaccine')).toBeInTheDocument();
    expect(screen.queryByText('Hidden Vaccine')).not.toBeInTheDocument();
  });
});
