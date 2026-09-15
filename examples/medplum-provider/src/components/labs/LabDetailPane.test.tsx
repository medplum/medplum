// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { DiagnosticReport, ServiceRequest } from '@medplum/fhirtypes';
import { HomerDiagnosticReport, HomerServiceRequest, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import { showErrorNotification } from '../../utils/notifications';
import { LabDetailPane } from './LabDetailPane';

vi.mock('../../utils/notifications', () => ({ showErrorNotification: vi.fn() }));

vi.mock('./LabOrderDetails', () => ({
  LabOrderDetails: (props: { order: ServiceRequest; onChange?: (order: ServiceRequest) => void }): JSX.Element => (
    <button type="button" onClick={() => props.onChange?.({ ...props.order, status: 'revoked' })}>
      Order {props.order.id}: {props.order.status}
    </button>
  ),
}));

vi.mock('./LabResultDetails', () => ({
  LabResultDetails: (props: { result: DiagnosticReport }): JSX.Element => <div>Result details: {props.result.id}</div>,
}));

const medplum = new MockClient();
const report = HomerDiagnosticReport as WithId<DiagnosticReport>;
const setup = (props: Parameters<typeof LabDetailPane>[0]): ReturnType<typeof render> =>
  render(
    <MedplumProvider medplum={medplum}>
      <MantineProvider>
        <LabDetailPane {...props} />
      </MantineProvider>
    </MedplumProvider>
  );

beforeEach(() => vi.clearAllMocks());

test('renders a ServiceRequest item as the order without fetching and propagates order changes', async () => {
  const onOrderChange = vi.fn();
  const readReference = vi.spyOn(medplum, 'readReference');
  setup({ item: HomerServiceRequest as WithId<ServiceRequest>, onOrderChange });
  expect(readReference).not.toHaveBeenCalled();
  await userEvent.setup().click(screen.getByText('Order 123: active'));
  expect(onOrderChange).toHaveBeenCalledWith(expect.objectContaining({ id: '123', status: 'revoked' }));
  expect(screen.getByText('Order 123: revoked')).toBeInTheDocument();
});

test('shows a loader then the order details for a report based on a ServiceRequest', async () => {
  const { container } = setup({ item: report });
  expect(container.querySelector('.mantine-Loader-root')).toBeInTheDocument();
  expect(await screen.findByText('Order 123: active')).toBeInTheDocument();
  expect(screen.queryByText('Result details: 123')).not.toBeInTheDocument();
});

test('renders result details for a report without a ServiceRequest basedOn', () => {
  setup({ item: { ...report, id: 'dr-2', basedOn: undefined } });
  expect(screen.getByText('Result details: dr-2')).toBeInTheDocument();
  expect(screen.queryByText(/Order/)).not.toBeInTheDocument();
});

test('shows an error notification and falls back to result details when the order fetch fails', async () => {
  vi.spyOn(medplum, 'readReference').mockRejectedValueOnce(new Error('Not found'));
  setup({ item: report });
  expect(await screen.findByText('Result details: 123')).toBeInTheDocument();
  expect(showErrorNotification).toHaveBeenCalledWith(new Error('Not found'));
});
