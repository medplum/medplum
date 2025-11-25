// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { DrAliceSmith, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../../test-utils/render';
import { ChatModal } from './ChatModal';

describe('ChatModal', () => {
  let defaultMedplum: MockClient;

  beforeAll(() => {
    defaultMedplum = new MockClient({ profile: DrAliceSmith });
  });

  interface TestComponentProps {
    open?: boolean;
  }

  function TestComponent(props: TestComponentProps): JSX.Element | null {
    const [open, setOpen] = useState(props.open ?? false);
    return (
      <ChatModal open={open} setOpen={setOpen}>
        <div key="test-render">Rendered!</div>
      </ChatModal>
    );
  }

  async function setup(
    props?: TestComponentProps,
    medplum?: MockClient
  ): Promise<{ rerender: (props?: TestComponentProps) => Promise<void> }> {
    const { rerender: _rerender } = await act(async () =>
      render(<TestComponent {...props} />, ({ children }) => (
        <MemoryRouter>
          <MedplumProvider medplum={medplum ?? defaultMedplum}>{children}</MedplumProvider>
        </MemoryRouter>
      ))
    );
    return {
      rerender: async (props?: TestComponentProps) => {
        await act(async () => _rerender(<TestComponent {...props} />));
      },
    };
  }

  test('Render nothing when no profile', async () => {
    const medplum = new MockClient({ profile: null });
    const { rerender } = await setup(undefined, medplum);
    expect(screen.queryByRole('button', { name: 'Open chat' })).not.toBeInTheDocument();

    act(() => {
      medplum.setProfile(DrAliceSmith);
    });

    await rerender();
    expect(await screen.findByRole('button', { name: 'Open chat' })).toBeInTheDocument();
  });

  test('Clicking toggles chat open and closed', async () => {
    await setup();
    expect(screen.queryByText('Rendered!')).not.toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
    });
    expect(screen.getByText('Rendered!')).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close chat' }));
    });
    expect(screen.queryByText('Rendered!')).not.toBeInTheDocument();
  });
});
