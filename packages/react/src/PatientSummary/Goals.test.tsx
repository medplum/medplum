// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { Goal } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { Goals } from './Goals';

const medplum = new MockClient();

describe('PatientSummary - Goals', () => {
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
    await setup(<Goals patient={HomerSimpson} goals={[]} />);
    expect(screen.getByText('Goals')).toBeInTheDocument();
    expect(screen.getByText('(none)')).toBeInTheDocument();
  });

  test('Renders existing with description, status, and target date', async () => {
    await setup(
      <Goals
        patient={HomerSimpson}
        goals={[
          {
            resourceType: 'Goal',
            id: 'bp',
            lifecycleStatus: 'active',
            description: { text: 'Lower blood pressure' },
            subject: createReference(HomerSimpson),
            target: [{ dueDate: '2026-12-31' }],
          },
        ]}
      />
    );
    expect(screen.getByText('Lower blood pressure')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText(/Target/)).toBeInTheDocument();
  });

  test('Falls back to start date when no target due date', async () => {
    await setup(
      <Goals
        patient={HomerSimpson}
        goals={[
          {
            resourceType: 'Goal',
            id: 'walk',
            lifecycleStatus: 'active',
            description: { text: 'Walk daily' },
            subject: createReference(HomerSimpson),
            startDate: '2026-02-01',
          },
        ]}
      />
    );
    expect(screen.getByText(/Started/)).toBeInTheDocument();
  });

  test('Add goal', async () => {
    await setup(<Goals patient={HomerSimpson} goals={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Add item'));
    });

    const descriptionInput = await screen.findByRole('textbox', { name: /Goal/i });
    await act(async () => {
      fireEvent.change(descriptionInput, { target: { value: 'Lose weight' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(await screen.findByText('Lose weight')).toBeInTheDocument();
  });

  test('Edit goal', async () => {
    const goal: Goal = {
      resourceType: 'Goal',
      id: 'bp',
      lifecycleStatus: 'active',
      description: { text: 'Lower blood pressure' },
      subject: createReference(HomerSimpson),
    };

    await setup(<Goals patient={HomerSimpson} goals={[goal]} />);

    await act(async () => {
      fireEvent.click(screen.getByText('Lower blood pressure'));
    });

    expect(await screen.findByText('Edit Goal')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
  });

  test('Add modal omits Delete button and shows a Status field', async () => {
    await setup(<Goals patient={HomerSimpson} goals={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Add item'));
    });

    expect(await screen.findByText('Add Goal')).toBeInTheDocument();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    // Status is a ValueSet-bound (HL7) autocomplete, not the native menu.
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  test('Delete goal', async () => {
    const created = await medplum.createResource<Goal>({
      resourceType: 'Goal',
      lifecycleStatus: 'active',
      description: { text: 'Lower blood pressure' },
      subject: createReference(HomerSimpson),
    });

    await setup(<Goals patient={HomerSimpson} goals={[created]} />);

    await act(async () => {
      fireEvent.click(screen.getByText('Lower blood pressure'));
    });

    const deleteButton = await screen.findByText('Delete');
    await act(async () => {
      fireEvent.click(deleteButton);
    });

    expect(screen.queryByText('Lower blood pressure')).not.toBeInTheDocument();
  });

  test('Hides entered-in-error goals', async () => {
    await setup(
      <Goals
        patient={HomerSimpson}
        goals={[
          {
            resourceType: 'Goal',
            id: 'shown',
            lifecycleStatus: 'active',
            description: { text: 'Shown Goal' },
            subject: createReference(HomerSimpson),
          },
          {
            resourceType: 'Goal',
            id: 'hidden',
            lifecycleStatus: 'entered-in-error',
            description: { text: 'Hidden Goal' },
            subject: createReference(HomerSimpson),
          },
        ]}
      />
    );

    expect(screen.getByText('Shown Goal')).toBeInTheDocument();
    expect(screen.queryByText('Hidden Goal')).not.toBeInTheDocument();
  });

  test('Goal status colors', async () => {
    await setup(
      <Goals
        patient={HomerSimpson}
        goals={[
          {
            resourceType: 'Goal',
            id: 'active',
            lifecycleStatus: 'active',
            description: { text: 'Active Goal' },
            subject: createReference(HomerSimpson),
          },
          {
            resourceType: 'Goal',
            id: 'on-hold',
            lifecycleStatus: 'on-hold',
            description: { text: 'On Hold Goal' },
            subject: createReference(HomerSimpson),
          },
          {
            resourceType: 'Goal',
            id: 'cancelled',
            lifecycleStatus: 'cancelled',
            description: { text: 'Cancelled Goal' },
            subject: createReference(HomerSimpson),
          },
        ]}
      />
    );

    const activeBadge = screen.getByText('active').closest('[class*="mantine-Badge-root"]');
    expect(activeBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-green-light-color)' });

    const onHoldBadge = screen.getByText('on hold').closest('[class*="mantine-Badge-root"]');
    expect(onHoldBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-yellow-light-color)' });

    const cancelledBadge = screen.getByText('cancelled').closest('[class*="mantine-Badge-root"]');
    expect(cancelledBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-red-light-color)' });
  });
});
