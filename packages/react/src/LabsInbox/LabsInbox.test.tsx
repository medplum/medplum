// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { createReference, parseSearchRequest } from '@medplum/core';
import type { DiagnosticReport, ServiceRequest } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { RenderResult } from '@testing-library/react';
import { act, render, screen, userEvent, waitFor } from '../test-utils/render';
import type { LabItem, LabsInboxOrderModalProps, LabsInboxProps, LabTab } from './LabsInbox';
import { LabsInbox } from './LabsInbox';

const completedReport: DiagnosticReport = {
  resourceType: 'DiagnosticReport',
  id: 'report-1',
  status: 'final',
  code: { text: 'Lipid Panel' },
  subject: { reference: `Patient/${HomerSimpson.id}` },
  issued: '2024-01-01T10:00:00Z',
  meta: { lastUpdated: '2024-01-01T10:00:00Z' },
};

const activeOrder: ServiceRequest = {
  resourceType: 'ServiceRequest',
  id: 'order-1',
  status: 'active',
  intent: 'order',
  code: { text: 'Metabolic Panel' },
  subject: { reference: `Patient/${HomerSimpson.id}` },
  requisition: { value: 'REQ-002' },
  meta: { lastUpdated: '2024-01-02T10:00:00Z' },
};

// The normalized searches the page passes in for each tab.
const TAB_SEARCH: Record<LabTab, string> = {
  completed: 'DiagnosticReport?status=final,corrected,amended&_sort=-_lastUpdated&_count=20',
  open: 'ServiceRequest?status=active,draft,on-hold&_sort=-_lastUpdated&_count=20',
  revoked: 'ServiceRequest?status=revoked&_sort=-_lastUpdated&_count=20',
};

// Builds a ResourceArray-like value carrying a bundle total, as searchResources returns.
const resourceArray = <T,>(resources: T[], total: number): T[] =>
  Object.assign(resources.slice(), { bundle: { resourceType: 'Bundle', type: 'searchset', total } });

describe('LabsInbox', () => {
  let medplum: MockClient;
  let orderModalProps: LabsInboxOrderModalProps | undefined;

  beforeEach(() => {
    medplum = new MockClient();
    orderModalProps = undefined;
  });

  const mockSearch = (orders: ServiceRequest[], reports: DiagnosticReport[]): void => {
    medplum.searchResources = vi
      .fn()
      .mockImplementation((resourceType: string) =>
        Promise.resolve(resourceType === 'DiagnosticReport' ? reports : orders)
      );
  };

  const lastQuery = (): string => vi.mocked(medplum.searchResources).mock.calls.at(-1)?.[1] as string;

  function setup(tab: LabTab, props: Partial<LabsInboxProps> = {}): RenderResult {
    return render(
      <MedplumProvider medplum={medplum}>
        <LabsInbox
          patient={createReference(HomerSimpson)}
          search={parseSearchRequest(TAB_SEARCH[tab])}
          activeTab={tab}
          selectedId={undefined}
          getItemUri={(item: LabItem) => `/${item.resourceType}/${item.id}`}
          onChange={vi.fn()}
          completedUri="/completed"
          openUri="/open"
          revokedUri="/revoked"
          renderOrderModal={(p) => {
            orderModalProps = p;
            return p.opened ? <div>Order Modal {p.draftOrder?.id ?? 'new'}</div> : null;
          }}
          {...props}
        />
      </MedplumProvider>
    );
  }

  test('queries final reports with the default sort for the completed tab', async () => {
    mockSearch([], [completedReport]);
    setup('completed');

    expect(await screen.findByText('Lipid Panel')).toBeInTheDocument();
    expect(medplum.searchResources).toHaveBeenCalledWith('DiagnosticReport', expect.any(String), expect.anything());
    expect(lastQuery()).toContain('status=final');
    expect(lastQuery()).toContain('_sort=-_lastUpdated');
    expect(lastQuery()).toContain(`subject=Patient%2F${HomerSimpson.id}`);
    // Reports reference their order via basedOn; the top-level filter only applies to orders.
    expect(lastQuery()).not.toContain('based-on');
  });

  test('queries only top-level open orders for the open tab', async () => {
    mockSearch([activeOrder], []);
    setup('open');

    expect(await screen.findByText('Metabolic Panel')).toBeInTheDocument();
    expect(lastQuery()).toContain('status=active%2Cdraft%2Con-hold');
    expect(lastQuery()).toContain('based-on:missing=true');
  });

  test('shows the empty state for the active tab', async () => {
    mockSearch([], []);
    setup('revoked');

    expect(await screen.findByText(/No revoked labs to display/i)).toBeInTheDocument();
    expect(lastQuery()).toContain('status=revoked');
  });

  test('shows the selected report in the detail pane', async () => {
    mockSearch([], [completedReport]);
    setup('completed', { selectedId: completedReport.id });

    await waitFor(() => expect(screen.getAllByText('Lipid Panel').length).toBeGreaterThan(1));
    expect(screen.getByText('Final')).toBeInTheDocument();
  });

  test('reads the selected item when it is not in the loaded list', async () => {
    mockSearch([], []);
    const readResourceSpy = vi.spyOn(medplum, 'readResource').mockResolvedValue(activeOrder as any);
    setup('open', { selectedId: activeOrder.id });

    await waitFor(() => expect(readResourceSpy).toHaveBeenCalledWith('ServiceRequest', activeOrder.id));
  });

  test('links items with getItemUri', async () => {
    mockSearch([], [completedReport]);
    setup('completed');

    expect((await screen.findByText('Lipid Panel')).closest('a')).toHaveAttribute('href', '/DiagnosticReport/report-1');
  });

  test('pages through onChange with the next offset', async () => {
    const manyReports = Array.from({ length: 20 }, (_, i) => ({ ...completedReport, id: `report-${i}` }));
    mockSearch([], resourceArray(manyReports, 45));
    const onChange = vi.fn();
    setup('completed', { onChange });

    await userEvent.click(await screen.findByRole('button', { name: '2' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining<Partial<SearchRequest>>({ offset: 20 }));
  });

  test('hides the order button without renderOrderModal', async () => {
    mockSearch([], []);
    setup('completed', { renderOrderModal: undefined });

    await screen.findByText(/No completed labs to display/i);
    expect(screen.queryByRole('button', { name: 'Order Labs' })).not.toBeInTheDocument();
  });

  test('refetches and calls onNew after an order is saved', async () => {
    mockSearch([], []);
    const onNew = vi.fn();
    setup('completed', { onNew });

    await userEvent.click(await screen.findByRole('button', { name: 'Order Labs' }));
    expect(screen.getByText('Order Modal new')).toBeInTheDocument();

    const searchCount = vi.mocked(medplum.searchResources).mock.calls.length;
    await act(async () => orderModalProps?.onSaved());

    expect(screen.queryByText('Order Modal new')).not.toBeInTheDocument();
    expect(medplum.searchResources).toHaveBeenCalledTimes(searchCount + 1);
    expect(onNew).toHaveBeenCalled();
  });

  test('opens the order modal with the draft when a draft is resumed', async () => {
    const draftOrder: ServiceRequest = { ...activeOrder, id: 'draft-1', status: 'draft', requisition: undefined };
    mockSearch([draftOrder], []);
    setup('open', { selectedId: draftOrder.id });

    await userEvent.click(await screen.findByRole('button', { name: 'Draft' }));
    await userEvent.click(await screen.findByText('Active'));

    expect(await screen.findByText('Order Modal draft-1')).toBeInTheDocument();
  });
});
