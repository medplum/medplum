// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Communication } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { IconMail } from '@tabler/icons-react';
import 'jest-websocket-mock';
import { act, render, screen } from '../test-utils/render';
import { InboxIcon } from './InboxIcon';

describe('InboxIcon', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test('Renders without count when zero', async () => {
    const medplum = new MockClient();

    render(
      <MedplumProvider medplum={medplum}>
        <InboxIcon
          resourceType="Communication"
          countCriteria={`recipient=Practitioner/456&status:not=completed&_summary=count`}
          subscriptionCriteria={`Communication?recipient=Practitioner/456`}
          iconComponent={<IconMail data-testid="mail-icon" />}
        />
      </MedplumProvider>
    );

    // On first render, the count should be zero, so no count text should be shown
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.getByTestId('mail-icon')).toBeInTheDocument();
  });

  test('Updates count on subscription event', async () => {
    const medplum = new MockClient();

    render(
      <MedplumProvider medplum={medplum}>
        <InboxIcon
          resourceType="Communication"
          countCriteria={`recipient=Practitioner/456&status:not=completed&_summary=count`}
          subscriptionCriteria={`Communication?recipient=Practitioner/456`}
          iconComponent={<IconMail data-testid="mail-icon" />}
        />
      </MedplumProvider>
    );

    // On first render, the count should be zero
    expect(screen.queryByText('1')).not.toBeInTheDocument();

    // Create a communication
    const communication = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'in-progress',
      recipient: [{ reference: 'Practitioner/456' }],
    });

    // Emulate the server sending a message
    await act(async () => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>('Communication?recipient=Practitioner/456', {
        type: 'message',
        payload: { resourceType: 'Bundle', id: communication.id, type: 'history' },
      });
    });

    // After emitting a message, the count should be 1, and should be shown as text
    expect(await screen.findByText('1')).toBeInTheDocument();
  });
});
