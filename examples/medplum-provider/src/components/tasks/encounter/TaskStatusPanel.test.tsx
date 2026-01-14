// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Task } from '@medplum/fhirtypes';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
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
        <MantineProvider>
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

    const badge = screen.getAllByText('In Progress')[0];
    await user.click(badge);

    await waitFor(
      () => {
        const menuItems = screen.getAllByRole('menuitem');
        expect(menuItems.length).toBe(5);
      },
      { timeout: 5000 }
    );

    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('On Hold')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  test('calls onChangeStatus when menu item is clicked', async () => {
    const user = userEvent.setup();
    await setup(mockTask, true);

    const badge = screen.getByText('In Progress');
    await user.click(badge);

    await waitFor(
      () => {
        expect(screen.getByText('Completed')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    const completedItem = screen.getByText('Completed');
    await user.click(completedItem);

    expect(mockOnChangeStatus).toHaveBeenCalledWith('completed');
  });

  test('shows checkmark for current status in menu', async () => {
    const user = userEvent.setup();
    await setup(mockTask, true);

    const badge = screen.getAllByText('In Progress')[0];
    await user.click(badge);

    let menuItems: HTMLElement[] = [];
    await waitFor(
      () => {
        menuItems = screen.getAllByRole('menuitem');
        expect(menuItems.length).toBeGreaterThan(0);
        // Verify menu is visible by checking opacity or display style
        const menuDropdown = document.querySelector('[role="menu"]');
        if (menuDropdown) {
          const style = window.getComputedStyle(menuDropdown);
          expect(style.display).not.toBe('none');
        }
      },
      { timeout: 5000 }
    );

    const inProgressItem = menuItems.find((item) => item.textContent?.includes('In Progress'));
    expect(inProgressItem).toBeDefined();
    // Check that the menu item has an SVG icon (IconCheck renders as SVG)
    const icon = inProgressItem?.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  test('handles all status options in menu', async () => {
    const user = userEvent.setup();
    await setup(mockTask, true);

    const badge = screen.getAllByText('In Progress')[0];
    await user.click(badge);

    await waitFor(
      () => {
        const menuItems = screen.getAllByRole('menuitem');
        expect(menuItems.length).toBe(5);

        const statusOptions = ['Completed', 'Ready', 'In Progress', 'On Hold', 'Cancelled'];
        statusOptions.forEach((status) => {
          const menuItem = menuItems.find((item) => item.textContent?.includes(status));
          expect(menuItem).toBeInTheDocument();
        });
      },
      { timeout: 5000 }
    );
  });

  test('calls onChangeStatus with correct status for each menu item', async () => {
    const user = userEvent.setup();
    await setup(mockTask, true);

    const badge = screen.getByText('In Progress');
    await user.click(badge);

    await waitFor(
      () => {
        expect(screen.getByText('Ready')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    const readyItem = screen.getByText('Ready');
    await user.click(readyItem);

    expect(mockOnChangeStatus).toHaveBeenCalledWith('ready');
  });
});
