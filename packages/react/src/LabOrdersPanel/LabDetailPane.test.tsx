// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { DiagnosticReport, Reference, ServiceRequest } from '@medplum/fhirtypes';
import { HomerDiagnosticReport, HomerServiceRequest, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import { LabDetailPane } from './LabDetailPane';

vi.mock('@mantine/notifications');

vi.mock('./LabOrderDetails', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./LabOrderDetails')>();
  return {
    ...actual,
    LabOrderDetailsView: (props: {
      order: WithId<ServiceRequest>;
      report?: DiagnosticReport;
      onRevoke?: () => void;
    }): JSX.Element => (
      <button type="button" onClick={() => props.onRevoke?.()}>
        Order {props.order.id}: {props.order.status} (selected:{' '}
        {props.report ? `DiagnosticReport/${props.report.id}` : 'none'})
      </button>
    ),
    useLabOrderDetailsData: (order: WithId<ServiceRequest> | undefined, selectedReport?: Reference<DiagnosticReport>) => ({
      patient: undefined,
      requester: undefined,
      report: selectedReport?.reference
        ? ({ resourceType: 'DiagnosticReport', id: selectedReport.reference.split('/')[1] } as DiagnosticReport)
        : undefined,
      reportLoading: false,
      reportAttachments: [],
      reportResources: undefined,
      requisitionDocuments: [],
      requisitionDocumentsLoading: false,
      specimenLabelDocuments: [],
      specimenLabelDocumentsLoading: false,
      questionnaireResponse: undefined,
      revoke: vi.fn().mockImplementation(async () => (order ? { ...order, status: 'revoked' } : undefined)),
    }),
  };
});

vi.mock('./LabResultDetails', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./LabResultDetails')>();
  return {
    ...actual,
    LabResultDetailsView: (props: { result: DiagnosticReport }): JSX.Element => (
      <div>Result details: {props.result.id}</div>
    ),
    useLabResultDetailsData: () => ({ attachments: [], resources: undefined }),
  };
});

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
  await userEvent.setup().click(screen.getByText('Order 123: active (selected: none)'));
  expect(onOrderChange).toHaveBeenCalledWith(expect.objectContaining({ id: '123', status: 'revoked' }));
  expect(screen.getByText('Order 123: revoked (selected: none)')).toBeInTheDocument();
});

test('shows a loader then the order details for a report based on a ServiceRequest', async () => {
  const { container } = setup({ item: report });
  expect(container.querySelector('.mantine-Loader-root')).toBeInTheDocument();
  expect(await screen.findByText('Order 123: active (selected: DiagnosticReport/123)')).toBeInTheDocument();
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
  expect(showNotification).toHaveBeenCalledWith({ color: 'red', message: 'Not found' });
});

test('passes a Reference to the selected report, and updates it when switching reports under the same order', async () => {
  const { rerender } = setup({ item: report });
  expect(await screen.findByText('Order 123: active (selected: DiagnosticReport/123)')).toBeInTheDocument();

  const secondReport = { ...report, id: 'dr-2' };
  rerender(
    <MedplumProvider medplum={medplum}>
      <MantineProvider>
        <LabDetailPane item={secondReport} />
      </MantineProvider>
    </MedplumProvider>
  );

  expect(await screen.findByText('Order 123: active (selected: DiagnosticReport/dr-2)')).toBeInTheDocument();
});
