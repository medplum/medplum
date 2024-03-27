import { DrAliceSmith, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen } from '../../test-utils/render';
import { ChatModal, ChatModalProps } from './ChatModal';

describe('ChatModal', () => {
  let defaultMedplum: MockClient;

  beforeAll(() => {
    defaultMedplum = new MockClient({ profile: DrAliceSmith });
  });

  type TestComponentProps = Omit<ChatModalProps, 'children'>;
  function TestComponent(props: TestComponentProps): JSX.Element | null {
    return (
      <ChatModal {...props}>
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

  test('Setting `open` to `true`', async () => {
    const { rerender } = await setup();
    expect(screen.getByRole('button', { name: 'Open chat' })).toBeInTheDocument();

    await rerender({ open: true });
    expect(screen.queryByRole('button', { name: 'Open chat' })).not.toBeInTheDocument();
    expect(screen.getByText('Rendered!')).toBeInTheDocument();
  });

  test('Setting `open` to `false` then `true` then to `false` again', async () => {
    const { rerender } = await setup({ open: false });
    expect(screen.getByRole('button', { name: 'Open chat' })).toBeInTheDocument();

    await rerender({ open: true });
    expect(screen.queryByRole('button', { name: 'Open chat' })).not.toBeInTheDocument();

    await rerender({ open: false });
    expect(screen.getByRole('button', { name: 'Open chat' })).toBeInTheDocument();
  });

  test('Setting `open` to `true` then `undefined`', async () => {
    const { rerender } = await setup({ open: true });
    expect(screen.getByText('Rendered!')).toBeInTheDocument();

    await rerender({ open: undefined });
    expect(screen.getByText('Rendered!')).toBeInTheDocument();
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
