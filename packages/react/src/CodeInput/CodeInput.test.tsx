// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import { act, render, screen, selectAutocompleteOption } from '../test-utils/render';
import { CodeInput } from './CodeInput';

const medplum = new MockClient();
const binding = 'https://example.com/test';

describe('CodeInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  const defaultProps = { maxValues: 1, binding, name: 'test', onChange: undefined };

  async function setup(child: ReactNode): Promise<void> {
    await act(async () => {
      render(<MedplumProvider medplum={medplum}>{child}</MedplumProvider>);
    });
  }

  test('Renders', async () => {
    await setup(<CodeInput {...defaultProps} />);

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  test('Renders string default value', async () => {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <CodeInput {...defaultProps} defaultValue="xyz" maxValues={undefined} />
        </MedplumProvider>
      );
    });

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.getByText('xyz')).toBeDefined();
  });

  test('Searches for results', async () => {
    await setup(<CodeInput {...defaultProps} />);

    const input = screen.getByRole('searchbox');
    await selectAutocompleteOption(input, 'Test', 'Test Display');

    expect(screen.getByText('Test Display')).toBeDefined();
  });

  test('Searches for results with creatable set to false', async () => {
    await setup(<CodeInput {...defaultProps} creatable={false} clearable={false} />);

    const input = screen.getByRole('searchbox');
    await selectAutocompleteOption(input, 'Test', 'Test Display');

    expect(screen.getByText('Test Display')).toBeDefined();
  });
});
