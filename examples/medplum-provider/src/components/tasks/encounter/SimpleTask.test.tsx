// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SimpleTask } from './SimpleTask';
import type { Task } from '@medplum/fhirtypes';
import { MantineProvider } from '@mantine/core';

describe('SimpleTask', () => {
  const mockTask: Task = {
    resourceType: 'Task',
    id: 'task-123',
    status: 'in-progress',
    intent: 'order',
    code: { text: 'Test Task Code' },
    description: 'Test Task Description',
  };

  const setup = (task: Task): void => {
    render(
      <MantineProvider>
        <SimpleTask task={task} />
      </MantineProvider>
    );
  };

  it('renders task details correctly', () => {
    setup(mockTask);
    expect(screen.getByText('Test Task Code')).toBeInTheDocument();
    expect(screen.getByText('Test Task Description')).toBeInTheDocument();
  });

  it('renders View Service Request button when focus is ServiceRequest', () => {
    const taskWithFocus: Task = {
      ...mockTask,
      focus: { reference: 'ServiceRequest/123' },
    };
    setup(taskWithFocus);
    expect(screen.getByText('View Service Request')).toBeInTheDocument();
    expect(screen.getByText('View Service Request').closest('a')).toHaveAttribute('href', '/ServiceRequest/123');
  });

  it('does not render View Service Request button when focus is not ServiceRequest', () => {
    setup(mockTask);
    expect(screen.queryByText('View Service Request')).not.toBeInTheDocument();
  });
});
