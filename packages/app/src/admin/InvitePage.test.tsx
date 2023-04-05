import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';

const medplum = new MockClient();

async function setup(url: string): Promise<void> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <AppRoutes />
        </MemoryRouter>
      </MedplumProvider>
    );
  });
}

describe('InvitePage', () => {
  beforeAll(() => {
    medplum.setActiveLoginOverride({
      accessToken: '123',
      refreshToken: '456',
      profile: {
        reference: 'Practitioner/123',
      },
      project: {
        reference: 'Project/123',
      },
    });
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders', async () => {
    await setup('/admin/invite');
    await waitFor(() => screen.getByText('Invite'));

    expect(screen.getByText('Invite')).toBeInTheDocument();
  });

  test('Submit success', async () => {
    await setup('/admin/invite');
    await waitFor(() => screen.getByText('Invite'));

    expect(screen.getByText('Invite')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('First Name *'), {
        target: { value: 'George' },
      });
      fireEvent.change(screen.getByLabelText('Last Name *'), {
        target: { value: 'Washington' },
      });
      fireEvent.change(screen.getByLabelText('Email *'), {
        target: { value: 'george@example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Invite'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
    expect(screen.getByText('Email sent')).toBeInTheDocument();
  });

  test('Submit with access policy', async () => {
    await setup('/admin/invite');
    await waitFor(() => screen.getByText('Invite'));

    expect(screen.getByText('Invite')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('First Name *'), {
        target: { value: 'George' },
      });
      fireEvent.change(screen.getByLabelText('Last Name *'), {
        target: { value: 'Washington' },
      });
      fireEvent.change(screen.getByLabelText('Email *'), {
        target: { value: 'george@example.com' },
      });
    });

    const input = screen.getByRole('searchbox') as HTMLInputElement;

    // Enter "Example Access Policy"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Example Access Policy' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Invite'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });

  test('Invite patient', async () => {
    await setup('/admin/invite');
    await waitFor(() => screen.getByText('Invite'));

    expect(screen.getByText('Invite')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Role'), {
        target: { value: 'Patient' },
      });
      fireEvent.change(screen.getByLabelText('First Name *'), {
        target: { value: 'Peggy' },
      });
      fireEvent.change(screen.getByLabelText('Last Name *'), {
        target: { value: 'Patient' },
      });
      fireEvent.change(screen.getByLabelText('Email *'), {
        target: { value: 'peggypatient@example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Invite'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });

  test('Invite admin', async () => {
    await setup('/admin/invite');
    await waitFor(() => screen.getByText('Invite'));

    expect(screen.getByText('Invite')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Role'), {
        target: { value: 'Practitioner' },
      });
      fireEvent.change(screen.getByLabelText('First Name *'), {
        target: { value: 'Patty' },
      });
      fireEvent.change(screen.getByLabelText('Last Name *'), {
        target: { value: 'Practitioner' },
      });
      fireEvent.change(screen.getByLabelText('Email *'), {
        target: { value: 'pattypractitioner@example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Admin'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Invite'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });

  test('Do not send email', async () => {
    await setup('/admin/invite');
    await waitFor(() => screen.getByText('Invite'));

    expect(screen.getByText('Invite')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('First Name *'), {
        target: { value: 'George' },
      });
      fireEvent.change(screen.getByLabelText('Last Name *'), {
        target: { value: 'Washington' },
      });
      fireEvent.change(screen.getByLabelText('Email *'), {
        target: { value: 'george@example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Send email'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Invite'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
    expect(screen.queryByText('Email sent')).not.toBeInTheDocument();
  });

  test('Show error with bad email', async () => {
    await setup('/admin/invite');
    await waitFor(() => screen.getByText('Invite'));

    expect(screen.getByText('Invite')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('First Name *'), {
        target: { value: 'George' },
      });
      fireEvent.change(screen.getByLabelText('Last Name *'), {
        target: { value: 'Washington' },
      });
      fireEvent.change(screen.getByLabelText('Email *'), {
        target: { value: '' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Send email'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Invite'));
    });
    expect(screen.queryByText('success')).not.toBeInTheDocument();
    expect(screen.queryByText('Email sent')).not.toBeInTheDocument();
  });
});
