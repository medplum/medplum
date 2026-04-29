// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ClaimSubmittedPanel } from './ClaimSubmittedPanel';

const defaultProps = {
  claimAmount: 400,
  exportMenu: <button>Export</button>,
};

function setup(props: Partial<React.ComponentProps<typeof ClaimSubmittedPanel>> = {}): void {
  render(
    <MantineProvider>
      <ClaimSubmittedPanel {...defaultProps} {...props} />
    </MantineProvider>
  );
}

describe('ClaimSubmittedPanel', () => {
  test('renders claim amount', () => {
    setup({ claimAmount: 399.5 });
    expect(screen.getByText('$399.5')).toBeInTheDocument();
  });

  test('renders export menu', () => {
    setup();
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  test('shows formatted status badge when status is provided', () => {
    setup({ status: 'waiting_for_provider' });
    expect(screen.getByText('Waiting For Provider')).toBeInTheDocument();
  });

  test('hides status badge when status is not provided', () => {
    setup();
    expect(screen.queryByText('Waiting For Provider')).not.toBeInTheDocument();
  });

  test('shows submission date when createdAt is provided', () => {
    setup({ createdAt: '2026-03-02T21:32:57.748Z' });
    expect(screen.getByText(/Submitted on/)).toBeInTheDocument();
  });

  test('hides submission date when createdAt is not provided', () => {
    setup();
    expect(screen.queryByText(/Submitted on/)).not.toBeInTheDocument();
  });

  test('shows View Claim on Candid button when candidEncounterId is provided', () => {
    setup({ candidEncounterId: 'enc-123' });
    expect(screen.getByText('View Claim on Candid')).toBeInTheDocument();
  });

  test('hides View Claim on Candid button when candidEncounterId is not provided', () => {
    setup();
    expect(screen.queryByText('View Claim on Candid')).not.toBeInTheDocument();
  });

  test('View Claim on Candid button opens correct URL', async () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    setup({ candidEncounterId: 'enc-123' });
    await userEvent.click(screen.getByText('View Claim on Candid'));
    expect(windowOpenSpy).toHaveBeenCalled();
    windowOpenSpy.mockRestore();
  });

  test('formats underscored status into title case badge', () => {
    setup({ status: 'waiting_for_provider' });
    expect(screen.getByText('Waiting For Provider')).toBeInTheDocument();
  });
});
