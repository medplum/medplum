// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type * as MedplumReact from '@medplum/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SmartHealthLinkInputStepProps } from './SmartHealthLinkInputStep';
import { SmartHealthLinkInputStep } from './SmartHealthLinkInputStep';

// Stand in for the camera so the scan view can be rendered without a device.
vi.mock('@medplum/react', async (importOriginal) => {
  const actual = await importOriginal<typeof MedplumReact>();
  return {
    ...actual,
    QrCodeScanner: ({ onScan }: { onScan: (data: string) => void }) => (
      <button type="button" onClick={() => onScan('shlink:/scanned')}>
        simulate-scan
      </button>
    ),
  };
});

describe('SmartHealthLinkInputStep', () => {
  let props: SmartHealthLinkInputStepProps;

  beforeEach(() => {
    vi.clearAllMocks();
    props = {
      shlink: '',
      onShlinkChange: vi.fn(),
      error: undefined,
      busy: false,
      scanning: false,
      scanSessionKey: 0,
      onStartScan: vi.fn(),
      onCancelScan: vi.fn(),
      onScan: vi.fn(),
      onResolve: vi.fn(),
    };
  });

  function setup(overrides: Partial<SmartHealthLinkInputStepProps> = {}): ReturnType<typeof render> {
    props = { ...props, ...overrides };
    return render(
      <MantineProvider>
        <SmartHealthLinkInputStep {...props} />
      </MantineProvider>
    );
  }

  describe('Paste view', () => {
    test('Reports typed input', async () => {
      setup();
      await userEvent.type(screen.getByLabelText('SMART Health Link'), 'shlink:/abc');
      expect(props.onShlinkChange).toHaveBeenCalled();
    });

    test('Opens the link on click', async () => {
      setup({ shlink: 'shlink:/abc' });
      await userEvent.click(screen.getByRole('button', { name: /open smart health link/i }));
      expect(props.onResolve).toHaveBeenCalledTimes(1);
    });

    test('Opens the link on Enter rather than adding a newline', async () => {
      setup({ shlink: 'shlink:/abc' });
      await userEvent.type(screen.getByLabelText('SMART Health Link'), '{Enter}');
      expect(props.onResolve).toHaveBeenCalledTimes(1);
      expect(props.onShlinkChange).not.toHaveBeenCalled();
    });

    test('Leaves Shift+Enter to insert a newline', async () => {
      setup({ shlink: 'shlink:/abc' });
      await userEvent.type(screen.getByLabelText('SMART Health Link'), '{Shift>}{Enter}{/Shift}');
      expect(props.onResolve).not.toHaveBeenCalled();
    });

    test('Ignores Enter while busy', async () => {
      setup({ shlink: 'shlink:/abc', busy: true });
      await userEvent.type(screen.getByLabelText('SMART Health Link'), '{Enter}');
      expect(props.onResolve).not.toHaveBeenCalled();
    });

    test('Ignores Enter mid-IME-composition', async () => {
      setup({ shlink: 'shlink:/abc' });
      const textarea = screen.getByLabelText('SMART Health Link');
      // userEvent has no composition support, so drive the composing keydown directly.
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      Object.defineProperty(event, 'isComposing', { value: true });
      textarea.dispatchEvent(event);
      expect(props.onResolve).not.toHaveBeenCalled();
    });

    test('Shows the error on the input', () => {
      setup({ error: 'Enter a SMART Health Link.' });
      expect(screen.getByText('Enter a SMART Health Link.')).toBeInTheDocument();
    });

    test('Starts a scan', async () => {
      setup();
      await userEvent.click(screen.getByRole('button', { name: /scan smart health card/i }));
      expect(props.onStartScan).toHaveBeenCalledTimes(1);
    });
  });

  describe('Scan view', () => {
    test('Reports scanned data', async () => {
      setup({ scanning: true });
      expect(screen.queryByLabelText('SMART Health Link')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'simulate-scan' }));
      expect(props.onScan).toHaveBeenCalledWith('shlink:/scanned');
    });

    test('Cancels the scan', async () => {
      setup({ scanning: true });
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(props.onCancelScan).toHaveBeenCalledTimes(1);
    });

    test('Overlays a loader while resolving a scanned code', () => {
      const { container } = setup({ scanning: true, busy: true });
      expect(container.querySelector('[class*="mantine-Loader-root"]')).not.toBeNull();
    });

    test('Shows the error under the scanner', () => {
      setup({ scanning: true, error: 'SMART Health Link could not be resolved.' });
      expect(screen.getByText('SMART Health Link could not be resolved.')).toBeInTheDocument();
    });
  });
});
