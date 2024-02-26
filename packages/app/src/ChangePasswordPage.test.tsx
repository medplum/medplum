import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { ChangePasswordPage } from './ChangePasswordPage';
import { act, fireEvent, render, screen } from './test-utils/render';

const medplum = new MockClient();

function setup(): void {
  render(
    <MedplumProvider medplum={medplum}>
      <ChangePasswordPage />
    </MedplumProvider>
  );
}

describe('ChangePasswordPage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  test('Renders', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument();
  });

  test('Submit success', async () => {
    setup();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Old password *'), {
        target: { value: 'orange' },
      });
      fireEvent.change(screen.getByLabelText('New password *'), {
        target: { value: 'purple' },
      });
      fireEvent.change(screen.getByLabelText('Confirm new password *'), {
        target: { value: 'purple' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });

  test('Wrong old password', async () => {
    setup();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Old password *'), {
        target: { value: 'watermelon' },
      });
      fireEvent.change(screen.getByLabelText('New password *'), {
        target: { value: 'purple' },
      });
      fireEvent.change(screen.getByLabelText('Confirm new password *'), {
        target: { value: 'purple' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    await act(async () => {
      await jest.runAllTimersAsync();
    });

    expect(screen.getByText('Incorrect password')).toBeInTheDocument();
  });
});
