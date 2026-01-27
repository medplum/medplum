// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { ServiceRequest } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { LabsPage } from './LabsPage';

describe('LabsPage', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (initialPath = `/Patient/${HomerSimpson.id}/ServiceRequest`): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/Patient/:patientId/ServiceRequest/:serviceRequestId" element={<LabsPage />} />
              <Route path="/Patient/:patientId/ServiceRequest" element={<LabsPage />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('renders tabs and new order button', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Open')).toBeInTheDocument();
    });

    // Find the plus button by its icon (ActionIcon with IconPlus)
    const plusButtons = screen.getAllByRole('button', { name: '' });
    const plusButton = plusButtons.find((btn) => btn.querySelector('.tabler-icon-plus'));
    expect(plusButton).toBeInTheDocument();
  });

  test('shows loading skeleton when loading', async () => {
    // Mock searchResources to return a promise that never resolves
    medplum.searchResources = vi.fn().mockImplementation(() => new Promise(() => {}));
    setup();

    await waitFor(() => {
      const skeletons = document.querySelectorAll('.mantine-Skeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  test('shows empty state when no orders are found', async () => {
    medplum.searchResources = vi.fn().mockResolvedValue([]);
    setup();

    await waitFor(() => {
      expect(screen.getByText(/No completed labs to display/i)).toBeInTheDocument();
    });
  });

  test('displays completed orders in completed tab', async () => {
    const completedOrder: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: 'completed-1',
      status: 'completed',
      intent: 'order',
      code: { text: 'Complete Blood Count' },
      subject: { reference: `Patient/${HomerSimpson.id}` },
      requisition: { value: 'REQ-001' },
      meta: {
        lastUpdated: '2024-01-01T10:00:00Z',
      },
    };

    await medplum.createResource(completedOrder);
    medplum.searchResources = vi.fn().mockResolvedValue([completedOrder]);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Complete Blood Count')).toBeInTheDocument();
    });
  });

  test('displays open orders in open tab', async () => {
    const openOrder: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: 'open-1',
      status: 'active',
      intent: 'order',
      code: { text: 'Metabolic Panel' },
      subject: { reference: `Patient/${HomerSimpson.id}` },
      requisition: { value: 'REQ-002' },
      meta: {
        lastUpdated: '2024-01-02T10:00:00Z',
      },
    };

    await medplum.createResource(openOrder);
    medplum.searchResources = vi.fn().mockResolvedValue([openOrder]);
    setup();

    // Switch to open tab
    const openTab = screen.getByText('Open');
    await userEvent.click(openTab);

    await waitFor(() => {
      expect(screen.getByText('Metabolic Panel')).toBeInTheDocument();
    });
  });

  test('switches between tabs', async () => {
    const completedOrder: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: 'completed-1',
      status: 'completed',
      intent: 'order',
      code: { text: 'Completed Test' },
      subject: { reference: `Patient/${HomerSimpson.id}` },
      requisition: { value: 'REQ-001' },
      meta: {
        lastUpdated: '2024-01-01T10:00:00Z',
      },
    };

    const openOrder: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: 'open-1',
      status: 'active',
      intent: 'order',
      code: { text: 'Open Test' },
      subject: { reference: `Patient/${HomerSimpson.id}` },
      requisition: { value: 'REQ-002' },
      meta: {
        lastUpdated: '2024-01-02T10:00:00Z',
      },
    };

    await medplum.createResource(completedOrder);
    await medplum.createResource(openOrder);
    medplum.searchResources = vi.fn().mockResolvedValue([completedOrder, openOrder]);
    setup();

    // Initially shows completed tab
    await waitFor(() => {
      expect(screen.getByText('Completed Test')).toBeInTheDocument();
    });

    // Switch to open tab
    const openTab = screen.getByText('Open');
    await userEvent.click(openTab);

    await waitFor(() => {
      expect(screen.getByText('Open Test')).toBeInTheDocument();
      expect(screen.queryByText('Completed Test')).not.toBeInTheDocument();
    });

    // Switch back to completed tab
    const completedTab = screen.getByText('Completed');
    await userEvent.click(completedTab);

    await waitFor(() => {
      expect(screen.getByText('Completed Test')).toBeInTheDocument();
      expect(screen.queryByText('Open Test')).not.toBeInTheDocument();
    });
  });

  test('opens new order modal when plus button is clicked', async () => {
    medplum.searchResources = vi.fn().mockResolvedValue([]);
    setup();

    // Find the plus button by its icon (ActionIcon with IconPlus)
    const plusButtons = screen.getAllByRole('button', { name: '' });
    const plusButton = plusButtons.find((btn) => btn.querySelector('.tabler-icon-plus'));
    expect(plusButton).toBeDefined();
    if (plusButton) {
      await userEvent.click(plusButton);
    }

    await waitFor(() => {
      expect(screen.getByText('Order Labs')).toBeInTheDocument();
    });
  });

  test('closes new order modal when onClose is called', async () => {
    medplum.searchResources = vi.fn().mockResolvedValue([]);
    setup();

    // Find the plus button by its icon (ActionIcon with IconPlus)
    const plusButtons = screen.getAllByRole('button', { name: '' });
    const plusButton = plusButtons.find((btn) => btn.querySelector('.tabler-icon-plus'));
    expect(plusButton).toBeDefined();
    if (plusButton) {
      await userEvent.click(plusButton);
    }

    await waitFor(() => {
      expect(screen.getByText('Order Labs')).toBeInTheDocument();
    });

    const closeButton = document.querySelector('.mantine-Modal-close');
    if (closeButton) {
      await userEvent.click(closeButton);
    }

    await waitFor(() => {
      expect(screen.queryByText('Order Labs')).not.toBeInTheDocument();
    });
  });

  test('filters out draft and entered-in-error orders from open tab', async () => {
    const activeOrder: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: 'active-1',
      status: 'active',
      intent: 'order',
      code: { text: 'Active Order' },
      subject: { reference: `Patient/${HomerSimpson.id}` },
      meta: {
        lastUpdated: '2024-01-02T10:00:00Z',
      },
    };

    const draftOrder: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: 'draft-1',
      status: 'draft',
      intent: 'order',
      code: { text: 'Draft Order' },
      subject: { reference: `Patient/${HomerSimpson.id}` },
      meta: {
        lastUpdated: '2024-01-01T10:00:00Z',
      },
    };

    const errorOrder: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: 'error-1',
      status: 'entered-in-error',
      intent: 'order',
      code: { text: 'Error Order' },
      subject: { reference: `Patient/${HomerSimpson.id}` },
      meta: {
        lastUpdated: '2024-01-01T09:00:00Z',
      },
    };

    await medplum.createResource(activeOrder);
    await medplum.createResource(draftOrder);
    await medplum.createResource(errorOrder);
    medplum.searchResources = vi.fn().mockResolvedValue([activeOrder, draftOrder, errorOrder]);
    setup();

    // Switch to open tab
    const openTab = screen.getByText('Open');
    await userEvent.click(openTab);

    await waitFor(() => {
      expect(screen.getByText('Active Order')).toBeInTheDocument();
      expect(screen.queryByText('Draft Order')).not.toBeInTheDocument();
      expect(screen.queryByText('Error Order')).not.toBeInTheDocument();
    });
  });

  test('displays order details when order is selected', async () => {
    const completedOrder: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: 'completed-1',
      status: 'completed',
      intent: 'order',
      code: { text: 'Complete Blood Count' },
      subject: { reference: `Patient/${HomerSimpson.id}` },
      requisition: { value: 'REQ-001' },
      meta: {
        lastUpdated: '2024-01-01T10:00:00Z',
      },
    };

    await medplum.createResource(completedOrder);
    medplum.searchResources = vi.fn().mockResolvedValue([completedOrder]);
    setup(`/Patient/${HomerSimpson.id}/ServiceRequest/${completedOrder.id}`);

    await waitFor(() => {
      // The order should be found in the search results and displayed (may appear multiple times)
      const elements = screen.getAllByText('Complete Blood Count');
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  test('fetches order when serviceRequestId is not in current items', async () => {
    const completedOrder: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: 'completed-1',
      status: 'completed',
      intent: 'order',
      code: { text: 'Complete Blood Count' },
      subject: { reference: `Patient/${HomerSimpson.id}` },
      requisition: { value: 'REQ-001' },
      meta: {
        lastUpdated: '2024-01-01T10:00:00Z',
      },
    };

    await medplum.createResource(completedOrder);
    // Return empty results so the order is not in currentItems
    medplum.searchResources = vi.fn().mockResolvedValue([]);
    const readResourceSpy = vi.spyOn(medplum, 'readResource').mockResolvedValue(completedOrder as any);
    setup(`/Patient/${HomerSimpson.id}/ServiceRequest/${completedOrder.id}`);

    // Wait for search to complete first
    await waitFor(() => {
      expect(medplum.searchResources).toHaveBeenCalled();
    });

    // Then wait for readResource to be called
    await waitFor(
      () => {
        expect(readResourceSpy).toHaveBeenCalledWith('ServiceRequest', completedOrder.id);
      },
      { timeout: 3000 }
    );
  });

  test('shows empty state message for open tab when no open orders', async () => {
    medplum.searchResources = vi.fn().mockResolvedValue([]);
    setup();

    const openTab = screen.getByText('Open');
    await userEvent.click(openTab);

    await waitFor(() => {
      expect(screen.getByText(/No open labs to display/i)).toBeInTheDocument();
    });
  });

  test('filters orders based on requisition numbers', async () => {
    const order1: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: 'order-1',
      status: 'completed',
      intent: 'order',
      code: { text: 'Test 1' },
      subject: { reference: `Patient/${HomerSimpson.id}` },
      requisition: { value: 'REQ-001' },
      meta: {
        lastUpdated: '2024-01-01T10:00:00Z',
      },
    };

    const order2: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: 'order-2',
      status: 'completed',
      intent: 'order',
      code: { text: 'Test 2' },
      subject: { reference: `Patient/${HomerSimpson.id}` },
      requisition: { value: 'REQ-001' }, // Same requisition number
      meta: {
        lastUpdated: '2024-01-01T11:00:00Z',
      },
    };

    await medplum.createResource(order1);
    await medplum.createResource(order2);
    medplum.searchResources = vi.fn().mockResolvedValue([order1, order2]);
    setup();

    // Only one order with the same requisition number should be shown
    await waitFor(() => {
      const test1Elements = screen.queryAllByText('Test 1');
      const test2Elements = screen.queryAllByText('Test 2');
      // One should be shown, the other filtered out
      expect(test1Elements.length + test2Elements.length).toBe(1);
    });
  });

  test('filters out orders based on completed basedOn references', async () => {
    const completedOrder: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: 'completed-base',
      status: 'completed',
      intent: 'order',
      code: { text: 'Base Order' },
      subject: { reference: `Patient/${HomerSimpson.id}` },
      requisition: { value: 'REQ-BASE' },
      meta: {
        lastUpdated: '2024-01-01T10:00:00Z',
      },
    };

    const basedOnOrder: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: 'based-on-order',
      status: 'active',
      intent: 'order',
      code: { text: 'Based On Order' },
      subject: { reference: `Patient/${HomerSimpson.id}` },
      basedOn: [{ reference: 'ServiceRequest/completed-base' }],
      meta: {
        lastUpdated: '2024-01-02T10:00:00Z',
      },
    };

    await medplum.createResource(completedOrder);
    await medplum.createResource(basedOnOrder);
    medplum.searchResources = vi.fn().mockResolvedValue([completedOrder, basedOnOrder]);
    setup();

    // Switch to open tab
    const openTab = screen.getByText('Open');
    await userEvent.click(openTab);

    await waitFor(() => {
      // The basedOn order should be filtered out because its base order is completed
      expect(screen.queryByText('Based On Order')).not.toBeInTheDocument();
    });
  });
});
