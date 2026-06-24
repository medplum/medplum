// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { conflict, multipleMatches, OperationOutcomeError } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../AppRoutes';
import { act, fireEvent, render, screen } from '../test-utils/render';

const medplum = new MockClient();

interface InviteFormFields {
  resourceType?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

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

async function fillInviteForm(fields: InviteFormFields = {}): Promise<void> {
  const { resourceType, firstName = 'George', lastName = 'Washington', email = 'george@example.com' } = fields;

  await act(async () => {
    if (resourceType) {
      fireEvent.change(screen.getByLabelText('Role'), {
        target: { value: resourceType },
      });
    }
    fireEvent.change(screen.getByLabelText('First Name *'), {
      target: { value: firstName },
    });
    fireEvent.change(screen.getByLabelText('Last Name *'), {
      target: { value: lastName },
    });
    fireEvent.change(screen.getByLabelText('Email *'), {
      target: { value: email },
    });
  });
}

async function submitInviteForm(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByText('Invite'));
  });
}

async function fillAndSubmitInviteForm(fields?: InviteFormFields): Promise<void> {
  await fillInviteForm(fields);
  await submitInviteForm();
}

describe('InvitePage', () => {
  beforeAll(() => {
    medplum.setActiveLoginOverride({
      accessToken: '123',
      refreshToken: '456',
      profile: {
        reference: 'Practitioner/124',
      },
      project: {
        reference: 'Project/123',
      },
    });
  });

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    vi.useRealTimers();
  });

  test('Renders', async () => {
    await setup('/admin/invite');
    expect(await screen.findByText('Invite')).toBeInTheDocument();
  });

  test('Submit success', async () => {
    await setup('/admin/invite');
    expect(await screen.findByText('Invite')).toBeInTheDocument();
    await fillAndSubmitInviteForm();

    expect(screen.getByTestId('success')).toBeInTheDocument();
    expect(screen.getByText('Email sent')).toBeInTheDocument();
  });

  test('Submit with access policy', async () => {
    await setup('/admin/invite');
    expect(await screen.findByText('Invite')).toBeInTheDocument();
    await fillInviteForm();

    const input = screen.getByPlaceholderText('Access Policy');

    // Enter "Example Access Policy"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Example Access Policy' } });
    });

    // Wait for the drop down
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await submitInviteForm();

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });

  test('Invite patient', async () => {
    await setup('/admin/invite');
    expect(await screen.findByText('Invite')).toBeInTheDocument();
    await fillAndSubmitInviteForm({
      resourceType: 'Patient',
      firstName: 'Peggy',
      lastName: 'Patient',
      email: 'peggypatient@example.com',
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });

  test('Invite admin', async () => {
    await setup('/admin/invite');
    expect(await screen.findByText('Invite')).toBeInTheDocument();
    await fillInviteForm({
      resourceType: 'Practitioner',
      firstName: 'Patty',
      lastName: 'Practitioner',
      email: 'pattypractitioner@example.com',
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Admin'));
    });

    await submitInviteForm();

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });

  test('Invite project scoped user', async () => {
    await setup('/admin/invite');
    expect(await screen.findByText('Invite')).toBeInTheDocument();
    await fillInviteForm({
      resourceType: 'Practitioner',
      firstName: 'Patty',
      lastName: 'Practitioner',
      email: 'pattypractitioner@example.com',
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Project scoped'));
    });

    await submitInviteForm();

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });

  test('Do not send email', async () => {
    await setup('/admin/invite');
    expect(await screen.findByText('Invite')).toBeInTheDocument();
    await fillInviteForm();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Send email'));
    });

    await submitInviteForm();

    expect(screen.getByTestId('success')).toBeInTheDocument();
    expect(screen.queryByText('Email sent')).not.toBeInTheDocument();
  });

  test('Show error with bad email', async () => {
    await setup('/admin/invite');
    expect(await screen.findByText('Invite')).toBeInTheDocument();

    await fillInviteForm({ email: '' });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Send email'));
    });

    await submitInviteForm();

    expect(screen.queryByText('success')).not.toBeInTheDocument();
    expect(screen.queryByText('Email sent')).not.toBeInTheDocument();
  });

  test('Show duplicate resource error', async () => {
    vi.spyOn(medplum, 'invite').mockRejectedValueOnce(new OperationOutcomeError(multipleMatches));

    await setup('/admin/invite');
    expect(await screen.findByText('Invite')).toBeInTheDocument();
    await fillAndSubmitInviteForm();

    expect(screen.getByTestId('invite-error')).toHaveTextContent('Multiple resources found matching condition');
    expect(screen.queryByText("User created, email couldn't be sent")).not.toBeInTheDocument();
    expect(screen.getByText('Invite new member')).toBeInTheDocument();
  });

  test('Show conflict error', async () => {
    vi.spyOn(medplum, 'invite').mockRejectedValueOnce(
      new OperationOutcomeError(conflict('User is already a member of this project'))
    );

    await setup('/admin/invite');
    expect(await screen.findByText('Invite')).toBeInTheDocument();
    await fillAndSubmitInviteForm();

    expect(screen.getByTestId('invite-error')).toHaveTextContent('User is already a member of this project');
    expect(screen.queryByText("User created, email couldn't be sent")).not.toBeInTheDocument();
    expect(screen.getByText('Invite new member')).toBeInTheDocument();
  });

  test('Show email failure when invite returns OperationOutcome', async () => {
    vi.spyOn(medplum, 'invite').mockResolvedValueOnce({
      resourceType: 'OperationOutcome',
      id: 'ok',
      issue: [
        {
          severity: 'error',
          code: 'exception',
          details: {
            text: 'Could not send email. Make sure you have AWS SES set up.',
          },
        },
      ],
    });

    await setup('/admin/invite');
    expect(await screen.findByText('Invite')).toBeInTheDocument();
    await fillAndSubmitInviteForm();

    expect(screen.getByTestId('email-failure')).toBeInTheDocument();
    expect(screen.getByText("User created, email couldn't be sent")).toBeInTheDocument();
    expect(screen.getByText('Could not send email. Make sure you have AWS SES set up.')).toBeInTheDocument();
    expect(screen.queryByTestId('invite-error')).not.toBeInTheDocument();
  });
});
