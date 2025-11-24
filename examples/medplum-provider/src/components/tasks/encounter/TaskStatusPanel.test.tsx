// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Task } from '@medplum/fhirtypes';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TaskStatusPanel } from './TaskStatusPanel';

const mockTask: Task = {
  resourceType: 'Task',
  id: 'task-123',
  status: 'in-progress',
  intent: 'order',
};

const mockOnActionButtonClicked = vi.fn();
const mockOnChangeStatus = vi.fn();

describe('TaskStatusPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setup = (task: Task, enabled = true): ReturnType<typeof render> => {
    return render(
      <MantineProvider>
        <TaskStatusPanel
          task={task}
          enabled={enabled}
          onActionButtonClicked={mockOnActionButtonClicked}
          onChangeStatus={mockOnChangeStatus}
        />
      </MantineProvider>
    );
  };

  it('renders task status label', () => {
    setup(mockTask);
    expect(screen.getByText('Task Status:')).toBeInTheDocument();
  });

  it('renders formatted task status when enabled', () => {
    setup(mockTask, true);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders formatted task status when disabled', () => {
    setup(mockTask, false);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('formats status text correctly for different statuses', () => {
    const statuses: Task['status'][] = ['in-progress', 'on-hold', 'completed', 'cancelled', 'ready'];
    statuses.forEach((status) => {
      const task = { ...mockTask, status };
      const { unmount } = setup(task, true);
      const expectedText = status.replaceAll('-', ' ').replaceAll(/\b\w/g, (char) => char.toUpperCase());
      expect(screen.getByText(expectedText)).toBeInTheDocument();
      unmount();
    });
  });

  it('shows edit button when enabled', () => {
    setup(mockTask, true);
    const editButton = screen.getByRole('button', { name: 'Edit Task' });
    expect(editButton).toBeInTheDocument();
  });

  it('does not show edit button when disabled', () => {
    setup(mockTask, false);
    expect(screen.queryByRole('button', { name: 'Edit Task' })).not.toBeInTheDocument();
  });

  it('calls onActionButtonClicked when edit button is clicked', async () => {
    const user = userEvent.setup();
    setup(mockTask, true);

    const editButton = screen.getByRole('button', { name: 'Edit Task' });
    await user.click(editButton);

    expect(mockOnActionButtonClicked).toHaveBeenCalledTimes(1);
  });

  it('shows menu dropdown when badge is clicked', async () => {
    const user = userEvent.setup();
    setup(mockTask, true);

    const badge = screen.getAllByText('In Progress')[0]; // Get the badge, not the menu item
    await user.click(badge);

    await waitFor(() => {
      // Check for menu items by role
      const menuItems = screen.getAllByRole('menuitem');
      expect(menuItems.length).toBe(5);
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Ready')).toBeInTheDocument();
      expect(screen.getByText('On Hold')).toBeInTheDocument();
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });
  });

  it('calls onChangeStatus when menu item is clicked', async () => {
    const user = userEvent.setup();
    setup(mockTask, true);

    const badge = screen.getByText('In Progress');
    await user.click(badge);

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    const completedItem = screen.getByText('Completed');
    await user.click(completedItem);

    expect(mockOnChangeStatus).toHaveBeenCalledWith('completed');
  });

  it('shows checkmark for current status in menu', async () => {
    const user = userEvent.setup();
    setup(mockTask, true);

    const badge = screen.getAllByText('In Progress')[0]; // Get the badge
    await user.click(badge);

    await waitFor(() => {
      const menuItems = screen.getAllByRole('menuitem');
      const inProgressItem = menuItems.find((item) => item.textContent?.includes('In Progress'));
      expect(inProgressItem).toBeInTheDocument();
      const checkIcon = inProgressItem?.querySelector('.tabler-icon-check');
      expect(checkIcon).toBeInTheDocument();
    });
  });

  it('handles all status options in menu', async () => {
    const user = userEvent.setup();
    setup(mockTask, true);

    const badge = screen.getAllByText('In Progress')[0]; // Get the badge
    await user.click(badge);

    await waitFor(() => {
      const menuItems = screen.getAllByRole('menuitem');
      expect(menuItems.length).toBe(5);

      const statusOptions = ['Completed', 'Ready', 'In Progress', 'On Hold', 'Cancelled'];
      statusOptions.forEach((status) => {
        const menuItem = menuItems.find((item) => item.textContent?.includes(status));
        expect(menuItem).toBeInTheDocument();
      });
    });
  });

  it('calls onChangeStatus with correct status for each menu item', async () => {
    const user = userEvent.setup();
    setup(mockTask, true);

    const badge = screen.getByText('In Progress');
    await user.click(badge);

    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    const readyItem = screen.getByText('Ready');
    await user.click(readyItem);

    expect(mockOnChangeStatus).toHaveBeenCalledWith('ready');
  });
});
