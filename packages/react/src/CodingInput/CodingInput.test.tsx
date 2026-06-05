// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import { act, render, screen, selectAutocompleteOption } from '../test-utils/render';
import { CodingInput } from './CodingInput';

const medplum = new MockClient();
const binding = 'https://example.com/test';

describe('CodingInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  async function setup(child: ReactNode): Promise<void> {
    await act(async () => {
      render(<MedplumProvider medplum={medplum}>{child}</MedplumProvider>);
    });
  }

  test('Renders', async () => {
    await setup(<CodingInput path="" binding={binding} name="test" />);

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  test('Renders Coding default value', async () => {
    await setup(<CodingInput path="" binding={binding} name="test" defaultValue={{ code: 'abc' }} />);

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.getByText('abc')).toBeDefined();
  });

  test('Searches for results', async () => {
    await setup(<CodingInput path="" binding={binding} name="test" />);

    const input = screen.getByRole('searchbox') as HTMLInputElement;
    await selectAutocompleteOption(input, 'Test', 'Test Display');

    expect(screen.getByText('Test Display')).toBeDefined();
  });

  test('Renders with empty binding property', async () => {
    await setup(<CodingInput path="" binding={undefined} name="test" />);

    const input = screen.getByRole('searchbox') as HTMLInputElement;
    await selectAutocompleteOption(input, 'Test Empty');

    // Despite an undefined binding value, the app still renders and functions
    expect(screen.getByText('Test Empty')).toBeDefined();
  });
});
