// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Condition } from '@medplum/fhirtypes';
import { describe, expect, test, vi } from 'vitest';
import ConditionItem from './ConditionItem';

const mockCondition: Condition = {
  resourceType: 'Condition',
  id: 'condition-123',
  subject: { reference: 'Patient/patient-123' },
  code: {
    coding: [
      {
        system: 'http://hl7.org/fhir/sid/icd-10-cm',
        code: 'J20.9',
        display: 'Acute bronchitis',
      },
    ],
  },
};

describe('ConditionItem', () => {
  const setup = (props: Partial<Parameters<typeof ConditionItem>[0]> = {}): ReturnType<typeof render> => {
    return render(
      <MantineProvider>
        <ConditionItem condition={mockCondition} rank={1} total={3} onChange={vi.fn()} onRemove={vi.fn()} {...props} />
      </MantineProvider>
    );
  };

  test('renders condition display', () => {
    setup();
    expect(screen.getByText('Acute bronchitis')).toBeInTheDocument();
  });

  test('renders rank select with correct value', () => {
    setup({ rank: 2 });
    const select = screen.getByRole('textbox');
    expect(select).toHaveValue('2');
  });

  test('renders rank select', () => {
    setup({ rank: 1, total: 5 });
    const select = screen.getByRole('textbox');
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('1');
  });

  test('calls onRemove when remove button is clicked', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    setup({ onRemove });

    const removeButtons = screen.getAllByRole('button', { hidden: true });
    const removeButton = removeButtons.find((btn) => btn.querySelector('svg'));

    if (!removeButton) {
      throw new Error('Remove button not found');
    }

    await user.click(removeButton);

    expect(onRemove).toHaveBeenCalledWith(mockCondition);
  });

  test('renders empty string when no display text', () => {
    const conditionWithoutDisplay: Condition = {
      ...mockCondition,
      code: {
        coding: [
          {
            system: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'J20.9',
          },
        ],
      },
    };
    setup({ condition: conditionWithoutDisplay });

    expect(screen.queryByText('Acute bronchitis')).not.toBeInTheDocument();
  });

  test('renders remove button', () => {
    setup();
    const buttons = screen.getAllByRole('button', { hidden: true });
    const removeButton = buttons.find((btn) => btn.querySelector('svg'));
    expect(removeButton).toBeInTheDocument();
  });
});
