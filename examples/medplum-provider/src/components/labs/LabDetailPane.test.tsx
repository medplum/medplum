// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { ReadablePromise } from '@medplum/core';
import type { DiagnosticReport, ServiceRequest } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { showErrorNotification } from '../../utils/notifications';
import { LabDetailPane } from './LabDetailPane';

vi.mock('../../utils/notifications', () => ({
  showErrorNotification: vi.fn(),
}));

/**
 * The order and result detail views are covered by their own test suites; here they
 * are replaced by minimal stubs so the pane's routing and fetch logic can be observed.
 */
vi.mock('./LabOrderDetails', () => ({
  LabOrderDetails: (props: {
    order: WithId<ServiceRequest>;
    onChange?: (order: WithId<ServiceRequest>) => void;
  }): JSX.Element => (
    <div>
      <span>Order details: {props.order.id}</span>
      <span>Order status: {props.order.status}</span>
      <button type="button" onClick={() => props.onChange?.({ ...props.order, status: 'revoked' })}>
        Revoke stub
      </button>
    </div>
  ),
}));

vi.mock('./LabResultDetails', () => ({
  LabResultDetails: (props: { result: DiagnosticReport }): JSX.Element => (
    <div>Result details: {props.result.id}</div>
  ),
}));

const serviceRequest: WithId<ServiceRequest> = {
  resourceType: 'ServiceRequest',
  id: 'sr-1',
  status: 'active',
  intent: 'order',
  subject: { reference: 'Patient/123' },
  code: { text: 'CBC Panel' },
};

const reportWithOrder: WithId<DiagnosticReport> = {
  resourceType: 'DiagnosticReport',
  id: 'dr-1',
  status: 'final',
  code: { text: 'CBC Panel' },
  subject: { reference: 'Patient/123' },
  basedOn: [{ reference: 'CarePlan/cp-1' }, { reference: 'ServiceRequest/sr-1' }],
};

const standaloneReport: WithId<DiagnosticReport> = {
  resourceType: 'DiagnosticReport',
  id: 'dr-2',
  status: 'final',
  code: { text: 'Lipid Panel' },
  subject: { reference: 'Patient/123' },
};

describe('LabDetailPane', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
    await medplum.createResource(serviceRequest);
  });

  const setup = (
    item: WithId<ServiceRequest> | WithId<DiagnosticReport>,
    onOrderChange?: (order: WithId<ServiceRequest>) => void
  ): ReturnType<typeof render> =>
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <LabDetailPane item={item} onOrderChange={onOrderChange} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );

  test('renders order details immediately for a ServiceRequest item', async () => {
    const readReference = vi.spyOn(medplum, 'readReference');
    setup(serviceRequest);
    expect(screen.getByText('Order details: sr-1')).toBeInTheDocument();
    await waitFor(() => expect(readReference).not.toHaveBeenCalled());
  });

  test('shows a loader then the order details for a report based on a ServiceRequest', async () => {
    const { container } = setup(reportWithOrder);
    expect(container.querySelector('.mantine-Loader-root')).toBeInTheDocument();
    expect(await screen.findByText('Order details: sr-1')).toBeInTheDocument();
    expect(screen.queryByText('Result details: dr-1')).not.toBeInTheDocument();
  });

  test('renders result details for a report without a ServiceRequest basedOn', () => {
    setup(standaloneReport);
    expect(screen.getByText('Result details: dr-2')).toBeInTheDocument();
    expect(screen.queryByText(/Order details/)).not.toBeInTheDocument();
  });

  test('renders result details for a report whose basedOn has no ServiceRequest', () => {
    setup({ ...standaloneReport, basedOn: [{ reference: 'CarePlan/cp-1' }] });
    expect(screen.getByText('Result details: dr-2')).toBeInTheDocument();
  });

  test('shows an error notification and falls back to result details when the order fetch fails', async () => {
    const error = new Error('Not found');
    vi.spyOn(medplum, 'readReference').mockRejectedValue(error);
    setup(reportWithOrder);
    await waitFor(() => expect(showErrorNotification).toHaveBeenCalledWith(error));
    expect(await screen.findByText('Result details: dr-1')).toBeInTheDocument();
  });

  test('propagates order changes to the parent and re-renders with the updated order', async () => {
    const user = userEvent.setup();
    const onOrderChange = vi.fn();
    setup(serviceRequest, onOrderChange);

    expect(screen.getByText('Order status: active')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revoke stub' }));

    expect(onOrderChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'sr-1', status: 'revoked' }));
    expect(screen.getByText('Order status: revoked')).toBeInTheDocument();
  });

  test('handles order changes when no onOrderChange callback is provided', async () => {
    const user = userEvent.setup();
    setup(serviceRequest);
    await user.click(screen.getByRole('button', { name: 'Revoke stub' }));
    expect(screen.getByText('Order status: revoked')).toBeInTheDocument();
  });

  test('switches from an order to a standalone result when the item changes', async () => {
    const view = setup(serviceRequest);
    expect(screen.getByText('Order details: sr-1')).toBeInTheDocument();

    view.rerender(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <LabDetailPane item={standaloneReport} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText('Result details: dr-2')).toBeInTheDocument();
    expect(screen.queryByText(/Order details/)).not.toBeInTheDocument();
  });

  test('suppresses the error notification when a fetch fails after unmount', async () => {
    let rejectRead: (reason: unknown) => void = () => undefined;
    const readReference = vi.spyOn(medplum, 'readReference').mockReturnValue(
      new ReadablePromise(
        new Promise<WithId<ServiceRequest>>((_resolve, reject) => {
          rejectRead = reject;
        })
      )
    );
    const { unmount } = setup(reportWithOrder);
    expect(readReference).toHaveBeenCalledWith({ reference: 'ServiceRequest/sr-1' });
    unmount();
    await act(async () => {
      rejectRead(new Error('Network error'));
    });
    expect(showErrorNotification).not.toHaveBeenCalled();
  });

  test('ignores a stale order fetch after selecting a standalone result', async () => {
    let resolveRead: (value: WithId<ServiceRequest>) => void = () => undefined;
    const readReference = vi.spyOn(medplum, 'readReference').mockReturnValue(
      new ReadablePromise(
        new Promise<WithId<ServiceRequest>>((resolve) => {
          resolveRead = resolve;
        })
      )
    );
    const { rerender } = setup(reportWithOrder);
    expect(readReference).toHaveBeenCalledWith({ reference: 'ServiceRequest/sr-1' });

    rerender(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <LabDetailPane item={standaloneReport} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
    expect(screen.getByText('Result details: dr-2')).toBeInTheDocument();

    await act(async () => {
      resolveRead(serviceRequest);
    });

    expect(screen.getByText('Result details: dr-2')).toBeInTheDocument();
    expect(screen.queryByText(/Order details/)).not.toBeInTheDocument();
    expect(showErrorNotification).not.toHaveBeenCalled();
  });
});
