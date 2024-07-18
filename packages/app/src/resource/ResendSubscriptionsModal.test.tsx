import { Notifications, notifications } from '@mantine/notifications';
import { allOk, badRequest } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Resource } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { ResendSubscriptionsModal, ResendSubscriptionsModalProps } from './ResendSubscriptionsModal';

describe('ResendSubscriptionsModal', () => {
  let medplum: MockClient;

  beforeEach(() => {
    jest.useFakeTimers();
    medplum = new MockClient();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  function setup(props: ResendSubscriptionsModalProps): void {
    render(
      <MedplumProvider medplum={medplum}>
        <ResendSubscriptionsModal {...props} />
        <Notifications />
      </MedplumProvider>
    );
  }

  afterEach(async () => {
    await act(async () => notifications.clean());
  });

  test('Closed', async () => {
    setup({ resource: undefined, opened: false, onClose: jest.fn() });
    expect(screen.queryByText('Resend Subscriptions')).toBeNull();
  });

  test('Submit no options', async () => {
    const resendCallback = jest.fn(async (_arg: FhirRequest) => [allOk, {} as Resource] as FhirResponse);
    medplum.router.router.add('POST', ':resourceType/:id/$resend', resendCallback);

    setup({
      resource: HomerSimpson,
      opened: true,
      onClose: jest.fn(),
    });

    expect(await screen.findByText('Resend Subscriptions')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Resend'));
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(resendCallback).toHaveBeenCalledTimes(1);

    const request = resendCallback.mock.calls[0][0];
    expect(request.body.subscription).toBeUndefined();
    expect(request.body.verbose).toBe(false);
  });

  test('Submit with options', async () => {
    // Create a Subscription to find with autocomplete
    await medplum.createResource({
      resourceType: 'Subscription',
      id: '123',
      status: 'active',
      reason: 'test',
      criteria: 'Patient',
      channel: { type: 'rest-hook', endpoint: 'http://example.com' },
    });

    const resendCallback = jest.fn(async (_arg: FhirRequest) => [allOk, {} as Resource] as FhirResponse);
    medplum.router.router.add('POST', ':resourceType/:id/$resend', resendCallback);

    setup({
      resource: HomerSimpson,
      opened: true,
      onClose: jest.fn(),
    });

    expect(await screen.findByText('Resend Subscriptions')).toBeInTheDocument();

    // Check the "Choose subscription" checkbox
    await act(async () => {
      fireEvent.click(screen.getByText('Choose subscription', { exact: false }));
    });

    const input = screen.getByPlaceholderText('Subscription') as HTMLInputElement;

    // Enter "Patient"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Patient' } });
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

    // Check the "Verbose mode" checkbox
    await act(async () => {
      fireEvent.click(screen.getByText('Verbose mode', { exact: false }));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Resend'));
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(resendCallback).toHaveBeenCalledTimes(1);

    const request = resendCallback.mock.calls[0][0];
    expect(request.body.subscription).toBe('Subscription/123');
    expect(request.body.verbose).toBe(true);
  });

  test('Handle error', async () => {
    const resendCallback = jest.fn(async () => [badRequest('Dummy error')] as FhirResponse);
    medplum.router.router.add('POST', ':resourceType/:id/$resend', resendCallback);

    setup({
      resource: HomerSimpson,
      opened: true,
      onClose: jest.fn(),
    });

    expect(await screen.findByText('Resend Subscriptions')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Resend'));
    });

    expect(resendCallback).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Dummy error')).toBeInTheDocument();
  });
});
