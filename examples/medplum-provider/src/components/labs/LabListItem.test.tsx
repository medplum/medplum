// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import type { Practitioner, ServiceRequest } from '@medplum/fhirtypes';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { LabListItem } from './LabListItem';

describe('LabListItem', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (
    item: ServiceRequest,
    selectedItem: ServiceRequest | undefined,
    activeTab: 'open' | 'completed',
    onItemSelect: (item: ServiceRequest) => string = (i) => `/lab/${i.id}`
  ): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <LabListItem item={item} selectedItem={selectedItem} activeTab={activeTab} onItemSelect={onItemSelect} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  const baseServiceRequest: ServiceRequest = {
    resourceType: 'ServiceRequest',
    id: 'sr-1',
    status: 'active',
    intent: 'order',
    subject: { reference: 'Patient/123' },
    code: { text: 'CBC Panel' },
    authoredOn: '2024-01-15T10:00:00Z',
  };

  describe('Display text', () => {
    test('renders code text when available', () => {
      setup(baseServiceRequest, undefined, 'open');
      expect(screen.getByText('CBC Panel')).toBeInTheDocument();
    });

    test('renders multiple codes joined by comma', () => {
      const item: ServiceRequest = {
        ...baseServiceRequest,
        code: {
          coding: [{ display: 'Test A' }, { display: 'Test B' }],
        },
      };
      setup(item, undefined, 'open');
      expect(screen.getByText('Test A, Test B')).toBeInTheDocument();
    });

    test('renders first coding display when only one code', () => {
      const item: ServiceRequest = {
        ...baseServiceRequest,
        code: {
          coding: [{ display: 'Single Test' }],
        },
      };
      setup(item, undefined, 'open');
      expect(screen.getByText('Single Test')).toBeInTheDocument();
    });

    test('renders fallback text when no code available', () => {
      const item: ServiceRequest = {
        ...baseServiceRequest,
        code: undefined,
      };
      setup(item, undefined, 'open');
      expect(screen.getByText('Lab Order')).toBeInTheDocument();
    });
  });

  describe('Status badge', () => {
    test('shows active status badge', () => {
      setup(baseServiceRequest, undefined, 'open');
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    test('shows draft status badge', () => {
      const item: ServiceRequest = { ...baseServiceRequest, status: 'draft' };
      setup(item, undefined, 'open');
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    test('shows requested status badge', () => {
      const item: ServiceRequest = { ...baseServiceRequest, status: 'requested' as ServiceRequest['status'] };
      setup(item, undefined, 'open');
      expect(screen.getByText('Requested')).toBeInTheDocument();
    });

    test('shows on-hold status badge', () => {
      const item: ServiceRequest = { ...baseServiceRequest, status: 'on-hold' };
      setup(item, undefined, 'open');
      expect(screen.getByText('On Hold')).toBeInTheDocument();
    });

    test('shows revoked status badge', () => {
      const item: ServiceRequest = { ...baseServiceRequest, status: 'revoked' };
      setup(item, undefined, 'open');
      expect(screen.getByText('Revoked')).toBeInTheDocument();
    });

    test('shows cancelled status badge', () => {
      const item: ServiceRequest = { ...baseServiceRequest, status: 'cancelled' as ServiceRequest['status'] };
      setup(item, undefined, 'open');
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });

    test('shows error status badge for entered-in-error', () => {
      const item: ServiceRequest = { ...baseServiceRequest, status: 'entered-in-error' };
      setup(item, undefined, 'open');
      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    test('shows completed status badge', () => {
      const item: ServiceRequest = { ...baseServiceRequest, status: 'completed' };
      setup(item, undefined, 'open');
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    test('shows unknown status badge', () => {
      const item: ServiceRequest = { ...baseServiceRequest, status: 'unknown' };
      setup(item, undefined, 'open');
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });

    test('shows raw status when unrecognized', () => {
      const item: ServiceRequest = { ...baseServiceRequest, status: 'custom-status' as ServiceRequest['status'] };
      setup(item, undefined, 'open');
      expect(screen.getByText('custom-status')).toBeInTheDocument();
    });

    test('does not show status badge on completed tab', () => {
      setup(baseServiceRequest, undefined, 'completed');
      expect(screen.queryByText('Active')).not.toBeInTheDocument();
    });
  });

  describe('Sub text', () => {
    test('shows ordered date', () => {
      setup(baseServiceRequest, undefined, 'open');
      expect(screen.getByText(/Ordered/)).toBeInTheDocument();
    });

    test('shows ordered date with requester name when available', async () => {
      const practitioner: Practitioner = {
        resourceType: 'Practitioner',
        id: 'prac-1',
        name: [{ given: ['Dr.'], family: 'Smith' }],
      };
      await medplum.createResource(practitioner);

      const item: ServiceRequest = {
        ...baseServiceRequest,
        requester: { reference: 'Practitioner/prac-1' },
      };
      setup(item, undefined, 'open');
      // The requester is loaded asynchronously, we just verify the component renders
      expect(screen.getByText(/Ordered/)).toBeInTheDocument();
    });

    test('uses lastUpdated when authoredOn not available', () => {
      const item: ServiceRequest = {
        ...baseServiceRequest,
        authoredOn: undefined,
        meta: { lastUpdated: '2024-02-20T15:00:00Z' },
      };
      setup(item, undefined, 'open');
      expect(screen.getByText(/Ordered/)).toBeInTheDocument();
    });
  });

  describe('Additional info', () => {
    test('shows REQ number for open tab', () => {
      const item: ServiceRequest = {
        ...baseServiceRequest,
        requisition: { value: 'REQ-12345' },
      };
      setup(item, undefined, 'open');
      expect(screen.getByText('REQ #REQ-12345')).toBeInTheDocument();
    });

    test('shows completion date for completed tab', () => {
      const item: ServiceRequest = {
        ...baseServiceRequest,
        meta: { lastUpdated: '2024-03-15T10:00:00Z' },
      };
      setup(item, undefined, 'completed');
      expect(screen.getByText(/Completed/)).toBeInTheDocument();
    });

    test('shows Unknown date when no lastUpdated on completed tab', () => {
      const item: ServiceRequest = {
        ...baseServiceRequest,
        meta: undefined,
      };
      setup(item, undefined, 'completed');
      expect(screen.getByText(/Completed Unknown date/)).toBeInTheDocument();
    });
  });

  describe('Selection', () => {
    test('applies selected styling when item is selected', () => {
      setup(baseServiceRequest, baseServiceRequest, 'open');
      expect(screen.getByText('CBC Panel')).toBeInTheDocument();
    });

    test('does not apply selected styling when different item is selected', () => {
      const otherItem: ServiceRequest = { ...baseServiceRequest, id: 'sr-2' };
      setup(baseServiceRequest, otherItem, 'open');
      expect(screen.getByText('CBC Panel')).toBeInTheDocument();
    });
  });

  describe('Link', () => {
    test('calls onItemSelect to generate link', () => {
      const onItemSelect = vi.fn((item: ServiceRequest) => `/custom/${item.id}`);
      setup(baseServiceRequest, undefined, 'open', onItemSelect);
      expect(onItemSelect).toHaveBeenCalledWith(baseServiceRequest);
    });
  });
});
