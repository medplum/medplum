// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { TaskSelectEmpty } from './TaskSelectEmpty';

describe('TaskSelectEmpty', () => {
  const setup = (props: { notFound?: boolean } = {}): ReturnType<typeof render> => {
    return render(
      <MantineProvider>
        <TaskSelectEmpty {...props} />
      </MantineProvider>
    );
  };

  test('renders "No task selected" message by default', () => {
    setup();
    expect(screen.getByText('No task selected')).toBeInTheDocument();
    expect(
      screen.getByText('Select a task from the list to view details, add notes, and manage properties')
    ).toBeInTheDocument();
  });

  test('renders "Task not found" message when notFound is true', () => {
    setup({ notFound: true });
    expect(screen.getByText('Task not found')).toBeInTheDocument();
    expect(
      screen.queryByText('Select a task from the list to view details, add notes, and manage properties')
    ).not.toBeInTheDocument();
  });
});
