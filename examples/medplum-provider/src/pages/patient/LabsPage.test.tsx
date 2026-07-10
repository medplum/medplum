// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { DiagnosticReport, ServiceRequest } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { LabsPage } from './LabsPage';

describe('LabsPage', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  // The page issues two searches (ServiceRequest for the Open tab, DiagnosticReport
  // for the Completed tab); dispatch the mock by resource type.
  const mockSearch = (orders: ServiceRequest[], reports: DiagnosticReport[]): void => {
    medplum.searchResources = vi
      .fn()
      .mockImplementation((resourceType: string) =>
        Promise.resolve(resourceType === 'DiagnosticReport' ? reports : orders)
      );
  };

  // Wire MedplumProvider's navigate to react-router so the URL-driven tabs
  // (rendered as MedplumLinks) actually change the route when clicked.
  function NavProvider({ children }: { children: ReactNode }): JSX.Element {
    const navigate = useNavigate();
    return (
      <MedplumProvider
        medplum={medplum}
        navigate={(path) => {
          navigate(path)?.catch(() => undefined);
        }}
      >
        {children}
      </MedplumProvider>
    );
  }

  // Surfaces the current URL query string so tests can assert URL normalization.
  function LocationProbe(): JSX.Element {
    const probeLocation = useLocation();
    return <div data-testid="location-search">{probeLocation.search}</div>;
  }

  // Returns the query string of the most recent searchResources call for a resource type.
  const queryFor = (resourceType: string): string | undefined => {
    const call = [...vi.mocked(medplum.searchResources).mock.calls].reverse().find((c) => c[0] === resourceType);
    return call?.[1] as string | undefined;
  };

  // Builds a ResourceArray-like value carrying a bundle total, as searchResources returns.
  const resourceArray = <T,>(resources: T[], total: number): T[] =>
    Object.assign(resources.slice(), { bundle: { resourceType: 'Bundle', type: 'searchset', total } });

  // Default landing is the Completed tab, which lives on the DiagnosticReport route.
  const setup = (initialPath = `/Patient/${HomerSimpson.id}/DiagnosticReport`): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <NavProvider>
          <MantineProvider>
            <Notifications />
            <LocationProbe />
            <Routes>
              <Route path="/Patient/:patientId/ServiceRequest/:serviceRequestId" element={<LabsPage tab="open" />} />
              <Route path="/Patient/:patientId/ServiceRequest" element={<LabsPage tab="open" />} />
              <Route
                path="/Patient/:patientId/DiagnosticReport/:diagnosticReportId"
                element={<LabsPage tab="completed" />}
              />
              <Route path="/Patient/:patientId/DiagnosticReport" element={<LabsPage tab="completed" />} />
            </Routes>
          </MantineProvider>
        </NavProvider>
      </MemoryRouter>
    );
  };

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

  test('renders tabs and order button', async () => {
    mockSearch([], []);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Open')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Order Labs' })).toBeInTheDocument();
  });

  test('shows loading skeleton when loading', async () => {
    medplum.searchResources = vi.fn().mockImplementation(() => new Promise(() => {}));
    setup();

    await waitFor(() => {
      const skeletons = document.querySelectorAll('.mantine-Skeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  test('shows empty state for the completed tab when no reports are found', async () => {
    mockSearch([], []);
    setup();

    await waitFor(() => {
      expect(screen.getByText(/No completed labs to display/i)).toBeInTheDocument();
    });
  });

  test('shows empty state for the open tab when no orders are found', async () => {
    mockSearch([], []);
    setup(`/Patient/${HomerSimpson.id}/ServiceRequest`);

    await waitFor(() => {
      expect(screen.getByText(/No open labs to display/i)).toBeInTheDocument();
    });
  });

  test('displays final diagnostic reports in the completed tab', async () => {
    mockSearch([], [completedReport]);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Lipid Panel')).toBeInTheDocument();
    });
  });

  test('queries DiagnosticReport with status=final and default sort for the completed tab', async () => {
    mockSearch([], [completedReport]);
    setup();

    await waitFor(() => {
      const query = queryFor('DiagnosticReport');
      expect(query).toBeDefined();
      expect(query).toContain('status=final');
      expect(query).toContain('_sort=-_lastUpdated');
      // Reports legitimately reference their order via basedOn; the top-level
      // filter applies only to the Open (ServiceRequest) tab.
      expect(query).not.toContain('based-on');
    });
  });

  test('normalizes the URL with a default sort when none is provided', async () => {
    mockSearch([], [completedReport]);
    setup();

    await waitFor(() => {
      const urlSearch = screen.getByTestId('location-search').textContent ?? '';
      expect(urlSearch).toContain('_sort=-_lastUpdated');
      expect(urlSearch).toContain('status=final');
    });
  });

  test('honors a sort provided in the URL instead of the default', async () => {
    mockSearch([], [completedReport]);
    setup(`/Patient/${HomerSimpson.id}/DiagnosticReport?_sort=-issued`);

    await waitFor(() => {
      const query = queryFor('DiagnosticReport');
      expect(query).toBeDefined();
      expect(query).toContain('_sort=-issued');
      expect(query).not.toContain('_sort=-_lastUpdated');
    });
  });

  test('displays open orders in the open tab', async () => {
    mockSearch([activeOrder], []);
    setup(`/Patient/${HomerSimpson.id}/ServiceRequest`);

    await waitFor(() => {
      expect(screen.getByText('Metabolic Panel')).toBeInTheDocument();
    });
  });

  test('queries ServiceRequest with open statuses (active, draft, on-hold)', async () => {
    mockSearch([activeOrder], []);
    setup(`/Patient/${HomerSimpson.id}/ServiceRequest`);

    await waitFor(() => {
      const query = queryFor('ServiceRequest');
      expect(query).toBeDefined();
      // Commas are URL-encoded in the serialized query string.
      expect(query).toContain('status=active%2Cdraft%2Con-hold');
      expect(query).toContain('_sort=-_lastUpdated');
    });
  });

  test('includes draft orders in the open tab', async () => {
    const draftOrder: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: 'draft-1',
      status: 'draft',
      intent: 'order',
      code: { text: 'Draft Order' },
      subject: { reference: `Patient/${HomerSimpson.id}` },
      meta: { lastUpdated: '2024-01-01T10:00:00Z' },
    };

    mockSearch([draftOrder], []);
    setup(`/Patient/${HomerSimpson.id}/ServiceRequest`);

    await waitFor(() => {
      expect(screen.getByText('Draft Order')).toBeInTheDocument();
    });
  });

  test('switches between tabs', async () => {
    mockSearch([activeOrder], [completedReport]);
    setup();

    // Starts on the Completed tab.
    await waitFor(() => {
      expect(screen.getByText('Lipid Panel')).toBeInTheDocument();
    });

    // Switch to the Open tab.
    await userEvent.click(screen.getByText('Open'));

    await waitFor(() => {
      expect(screen.getByText('Metabolic Panel')).toBeInTheDocument();
      expect(screen.queryByText('Lipid Panel')).not.toBeInTheDocument();
    });

    // Switch back to the Completed tab.
    await userEvent.click(screen.getByText('Completed'));

    await waitFor(() => {
      expect(screen.getByText('Lipid Panel')).toBeInTheDocument();
      expect(screen.queryByText('Metabolic Panel')).not.toBeInTheDocument();
    });
  });

  test('lists only top-level orders, excluding per-test child requests', async () => {
    mockSearch([activeOrder], []);
    setup(`/Patient/${HomerSimpson.id}/ServiceRequest`);

    await waitFor(() => {
      const query = queryFor('ServiceRequest');
      expect(query).toBeDefined();
      // A lab order is a parent ServiceRequest plus per-test children that are
      // basedOn the parent; the list shows one row per order.
      expect(query).toContain('based-on:missing=true');
    });
  });

  test('displays report details when a completed report is selected', async () => {
    mockSearch([], [completedReport]);
    setup(`/Patient/${HomerSimpson.id}/DiagnosticReport/${completedReport.id}`);

    await waitFor(() => {
      // Appears in both the list row and the detail pane.
      expect(screen.getAllByText('Lipid Panel').length).toBeGreaterThan(1);
      // The detail pane header shows the issued date and the status badge.
      expect(screen.getByText(/Issued/)).toBeInTheDocument();
      expect(screen.getByText('Final')).toBeInTheDocument();
    });
  });

  test('reads the report when the diagnosticReportId is not in the loaded list', async () => {
    mockSearch([], []);
    const readResourceSpy = vi.spyOn(medplum, 'readResource').mockResolvedValue(completedReport as any);
    setup(`/Patient/${HomerSimpson.id}/DiagnosticReport/${completedReport.id}`);

    await waitFor(() => {
      expect(medplum.searchResources).toHaveBeenCalled();
    });

    await waitFor(
      () => {
        expect(readResourceSpy).toHaveBeenCalledWith('DiagnosticReport', completedReport.id);
      },
      { timeout: 3000 }
    );
  });

  test('reads the order when the serviceRequestId is not in the loaded list', async () => {
    mockSearch([], []);
    const readResourceSpy = vi.spyOn(medplum, 'readResource').mockResolvedValue(activeOrder as any);
    setup(`/Patient/${HomerSimpson.id}/ServiceRequest/${activeOrder.id}`);

    await waitFor(() => {
      expect(medplum.searchResources).toHaveBeenCalled();
    });

    await waitFor(
      () => {
        expect(readResourceSpy).toHaveBeenCalledWith('ServiceRequest', activeOrder.id);
      },
      { timeout: 3000 }
    );
  });

  test('shows pagination and pages via the URL when results exceed the page size', async () => {
    const manyReports = Array.from({ length: 20 }, (_, i) => ({ ...completedReport, id: `report-${i}` }));
    medplum.searchResources = vi
      .fn()
      .mockImplementation((resourceType: string) =>
        Promise.resolve(resourceType === 'DiagnosticReport' ? resourceArray(manyReports, 45) : [])
      );
    setup();

    // total=45 with a page size of 20 => 3 pages, so a "2" control is rendered.
    const page2 = await screen.findByRole('button', { name: '2' });
    await userEvent.click(page2);

    await waitFor(() => {
      expect(screen.getByTestId('location-search').textContent ?? '').toContain('_offset=20');
    });

    await waitFor(() => {
      expect(queryFor('DiagnosticReport')).toContain('_offset=20');
    });
  });

  test('does not show pagination when results fit on one page', async () => {
    medplum.searchResources = vi
      .fn()
      .mockImplementation((resourceType: string) =>
        Promise.resolve(resourceType === 'DiagnosticReport' ? resourceArray([completedReport], 1) : [])
      );
    setup();

    await waitFor(() => {
      expect(screen.getByText('Lipid Panel')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: '2' })).not.toBeInTheDocument();
  });

  test('opens the new order modal when the order button is clicked', async () => {
    mockSearch([], []);
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Order Labs' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit Order' })).toBeInTheDocument();
    });
  });

  test('closes the new order modal when onClose is called', async () => {
    mockSearch([], []);
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Order Labs' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit Order' })).toBeInTheDocument();
    });

    const closeButton = document.querySelector('.mantine-Modal-close');
    if (closeButton) {
      await userEvent.click(closeButton);
    }

    await waitFor(
      () => {
        expect(screen.queryByRole('button', { name: 'Submit Order' })).not.toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });
});
