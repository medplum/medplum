// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Task } from '@medplum/fhirtypes';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
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
  let renderResult: ReturnType<typeof render> | null = null;

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    renderResult = null;
  });

  afterEach(() => {
    if (renderResult) {
      renderResult.unmount();
      renderResult = null;
    }
    cleanup();
    vi.restoreAllMocks();
  });

  const setup = async (task: Task, enabled = true): Promise<void> => {
    await act(async () => {
      render(
        <MantineProvider env="test">
          <TaskStatusPanel
            task={task}
            enabled={enabled}
            onActionButtonClicked={mockOnActionButtonClicked}
            onChangeStatus={mockOnChangeStatus}
          />
        </MantineProvider>
      );
    });
  };

  test('renders task status label', async () => {
    await setup(mockTask);
    expect(screen.getByText('Task Status:')).toBeInTheDocument();
  });

  test('renders formatted task status when enabled', async () => {
    await setup(mockTask, true);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  test('renders formatted task status when disabled', async () => {
    await setup(mockTask, false);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  test('shows edit button when enabled', async () => {
    await setup(mockTask, true);
    const editButton = screen.getByRole('button', { name: 'Edit Task' });
    expect(editButton).toBeInTheDocument();
  });

  test('does not show edit button when disabled', async () => {
    await setup(mockTask, false);
    expect(screen.queryByRole('button', { name: 'Edit Task' })).not.toBeInTheDocument();
  });

  test('calls onActionButtonClicked when edit button is clicked', async () => {
    const user = userEvent.setup();
    await setup(mockTask, true);

    const editButton = screen.getByRole('button', { name: 'Edit Task' });
    await user.click(editButton);

    expect(mockOnActionButtonClicked).toHaveBeenCalledTimes(1);
  });

  test('shows menu dropdown when badge is clicked', async () => {
    const user = userEvent.setup();
    await setup(mockTask, true);

    await user.click(screen.getByText('In Progress'));

    const menuItems = await screen.findAllByRole('menuitem');
    expect(menuItems).toHaveLength(5);
    expect(screen.getByRole('menuitem', { name: 'Completed' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Ready' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'On Hold' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Cancelled' })).toBeInTheDocument();
  });

  test('calls onChangeStatus when menu item is clicked', async () => {
    const user = userEvent.setup();
    await setup(mockTask, true);

    await user.click(screen.getByText('In Progress'));
    await user.click(await screen.findByRole('menuitem', { name: 'Completed' }));

    expect(mockOnChangeStatus).toHaveBeenCalledWith('completed');
  });

  test('shows checkmark for current status in menu', async () => {
    const user = userEvent.setup();
    await setup(mockTask, true);

    await user.click(screen.getByText('In Progress'));

    const inProgressItem = await screen.findByRole('menuitem', { name: 'In Progress' });
    expect(inProgressItem.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Completed' }).querySelector('svg')).toBeNull();
  });

  test('handles all status options in menu', async () => {
    const user = userEvent.setup();
    await setup(mockTask, true);

    await user.click(screen.getByText('In Progress'));

    const menuItems = await screen.findAllByRole('menuitem');
    expect(menuItems.map((item) => item.textContent)).toEqual([
      'Completed',
      'Ready',
      'In Progress',
      'On Hold',
      'Cancelled',
    ]);
  });

  test('calls onChangeStatus with correct status for each menu item', async () => {
    const user = userEvent.setup();
    await setup(mockTask, true);

    await user.click(screen.getByText('In Progress'));
    await user.click(await screen.findByRole('menuitem', { name: 'Ready' }));

    expect(mockOnChangeStatus).toHaveBeenCalledWith('ready');
  });
});
