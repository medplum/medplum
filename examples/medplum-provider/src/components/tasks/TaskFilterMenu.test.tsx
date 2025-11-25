// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { TaskFilterMenu } from './TaskFilterMenu';
import { TaskFilterType } from './TaskFilterMenu.utils';

describe('TaskFilterMenu', () => {
  const setup = (props: Partial<React.ComponentProps<typeof TaskFilterMenu>> = {}): ReturnType<typeof render> => {
    return render(
      <MantineProvider>
        <TaskFilterMenu onFilterChange={vi.fn()} performerTypes={[]} {...props} />
      </MantineProvider>
    );
  };

  test('renders filter button', () => {
    setup();
    expect(screen.getByLabelText('Filter tasks')).toBeInTheDocument();
  });

  test('calls onFilterChange when status is selected', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    setup({ onFilterChange });

    await user.click(screen.getByLabelText('Filter tasks'));

    await waitFor(() => {
      expect(screen.getByText('Status')).toBeInTheDocument();
    });

    await user.hover(screen.getByText('Status'));

    await waitFor(() => {
      expect(screen.getByText('in-progress')).toBeInTheDocument();
    });

    await user.click(screen.getByText('in-progress'));

    expect(onFilterChange).toHaveBeenCalledWith(TaskFilterType.STATUS, 'in-progress');
  });

  test('shows performer types when available', async () => {
    const user = userEvent.setup();
    const performerTypes = [{ coding: [{ code: 'doctor', display: 'Doctor' }] }];
    setup({ performerTypes });

    await user.click(screen.getByLabelText('Filter tasks'));

    await waitFor(() => {
      expect(screen.getByText('Performer Type')).toBeInTheDocument();
    });

    await user.hover(screen.getByText('Performer Type'));

    await waitFor(() => {
      expect(screen.getByText('Doctor')).toBeInTheDocument();
    });
  });

  test('calls onFilterChange when performer type is selected', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    const performerTypes = [{ coding: [{ code: 'doctor', display: 'Doctor' }] }];
    setup({ onFilterChange, performerTypes });

    await user.click(screen.getByLabelText('Filter tasks'));

    await waitFor(() => {
      expect(screen.getByText('Performer Type')).toBeInTheDocument();
    });

    await user.hover(screen.getByText('Performer Type'));

    await waitFor(() => {
      expect(screen.getByText('Doctor')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Doctor'));

    expect(onFilterChange).toHaveBeenCalledWith(TaskFilterType.PERFORMER_TYPE, performerTypes[0]);
  });
});
