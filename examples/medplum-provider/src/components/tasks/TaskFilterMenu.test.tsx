// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import { DrAliceSmith, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { render } from '../../test-utils/render';
import { TaskFilterMenu } from './TaskFilterMenu';
import { TaskFilterType } from './TaskFilterMenu.utils';

describe('TaskFilterMenu', () => {
  const setup = async (props: Partial<React.ComponentProps<typeof TaskFilterMenu>> = {}): Promise<void> => {
    const medplum = new MockClient();
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <TaskFilterMenu onFilterChange={vi.fn()} performerTypes={[]} {...props} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  };

  test('renders filter button', async () => {
    await setup();
    expect(screen.getByLabelText('Filter tasks')).toBeInTheDocument();
  });

  test('calls onFilterChange when status is selected', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    await setup({ onFilterChange });

    await user.click(screen.getByLabelText('Filter tasks'));

    await waitFor(() => {
      expect(screen.getByText('Status')).toBeInTheDocument();
    });

    await user.hover(screen.getByText('Status'));

    await waitFor(() => {
      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });

    await user.click(screen.getByText('In Progress'));

    expect(onFilterChange).toHaveBeenCalledWith(TaskFilterType.STATUS, 'in-progress');
  });

  test('shows performer types when available', async () => {
    const user = userEvent.setup();
    const performerTypes = [{ coding: [{ code: 'doctor', display: 'Doctor' }] }];
    await setup({ performerTypes });

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
    await setup({ onFilterChange, performerTypes });

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

  test('shows priority submenu', async () => {
    const user = userEvent.setup();
    await setup();

    await user.click(screen.getByLabelText('Filter tasks'));

    await waitFor(() => {
      expect(screen.getByText('Priority')).toBeInTheDocument();
    });

    await user.hover(screen.getByText('Priority'));

    await waitFor(() => {
      expect(screen.getByText('Routine')).toBeInTheDocument();
      expect(screen.getByText('Urgent')).toBeInTheDocument();
      expect(screen.getByText('ASAP')).toBeInTheDocument();
      expect(screen.getByText('Stat')).toBeInTheDocument();
    });
  });

  test('calls onFilterChange when priority is selected', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    await setup({ onFilterChange });

    await user.click(screen.getByLabelText('Filter tasks'));

    await waitFor(() => {
      expect(screen.getByText('Priority')).toBeInTheDocument();
    });

    await user.hover(screen.getByText('Priority'));

    await waitFor(() => {
      expect(screen.getByText('Urgent')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Urgent'));

    expect(onFilterChange).toHaveBeenCalledWith(TaskFilterType.PRIORITY, 'urgent');
  });

  test('opens the assignee modal when the Assigned item is clicked', async () => {
    const user = userEvent.setup();
    await setup();

    await user.click(screen.getByLabelText('Filter tasks'));

    await waitFor(() => {
      expect(screen.getByText('Assigned')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Assigned'));

    expect(await screen.findByText('Filter by assignee')).toBeInTheDocument();
  });

  test('applies the selected assignee', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    await setup({ onFilterChange });

    await user.click(screen.getByLabelText('Filter tasks'));
    await user.click(await screen.findByText('Assigned'));

    const apply = await screen.findByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();

    const search = document.querySelector('.mantine-PillsInputField-field') as HTMLInputElement;
    await user.type(search, 'Alice');
    await user.click(await screen.findByText(/Alice Smith/));

    expect(apply).toBeEnabled();
    await user.click(apply);

    expect(onFilterChange).toHaveBeenCalledWith(TaskFilterType.OWNER, getReferenceString(DrAliceSmith));
  });

  test('clears the assignee filter when the assignee is removed', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    await setup({ onFilterChange, selectedOwner: getReferenceString(DrAliceSmith) });

    await user.click(screen.getByLabelText('Filter tasks'));
    await user.click(await screen.findByText('Assigned'));

    const apply = await screen.findByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();

    const pill = await screen.findByText(/Alice Smith/);
    const remove = pill.closest('.mantine-Pill-root')?.querySelector('button');
    expect(remove).toBeTruthy();
    await user.click(remove as HTMLButtonElement);

    expect(apply).toBeEnabled();
    await user.click(apply);

    expect(onFilterChange).toHaveBeenCalledWith(TaskFilterType.OWNER, '');
  });

  test('clears the assignee filter from the Clear button', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    await setup({ onFilterChange, selectedOwner: getReferenceString(DrAliceSmith) });

    await user.click(screen.getByLabelText('Filter tasks'));
    await user.click(await screen.findByText('Assigned'));
    await user.click(await screen.findByRole('button', { name: 'Clear' }));

    expect(onFilterChange).toHaveBeenCalledWith(TaskFilterType.OWNER, '');
  });

  test('hides the Assigned item on My Tasks tab', async () => {
    await setup({ isMyTasksTab: true });
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('Filter tasks'));

    await waitFor(() => {
      expect(screen.getByText('Status')).toBeInTheDocument();
    });

    expect(screen.queryByText('Assigned')).not.toBeInTheDocument();
  });

  test('shows checkmark next to selected priorities', async () => {
    const user = userEvent.setup();
    await setup({ priorities: ['urgent', 'stat'] });

    await user.click(screen.getByLabelText('Filter tasks'));

    await waitFor(() => {
      expect(screen.getByText('Priority')).toBeInTheDocument();
    });

    await user.hover(screen.getByText('Priority'));

    await waitFor(() => {
      expect(screen.getByText('Urgent')).toBeInTheDocument();
      expect(screen.getByText('Stat')).toBeInTheDocument();
      expect(screen.getByText('Routine')).toBeInTheDocument();
      expect(screen.getByText('ASAP')).toBeInTheDocument();
    });

    const urgentText = screen.getByText('Urgent');
    const statText = screen.getByText('Stat');
    expect(urgentText).toBeInTheDocument();
    expect(statText).toBeInTheDocument();
  });
});
