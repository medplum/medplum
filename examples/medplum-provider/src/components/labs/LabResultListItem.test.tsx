// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { DiagnosticReport, Organization, Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { LabResultListItem } from './LabResultListItem';

const performingPractitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: 'practitioner-1',
  name: [{ given: ['Alice'], family: 'Smith', prefix: ['Dr.'] }],
};

const performingOrganization: Organization = {
  resourceType: 'Organization',
  id: 'org-1',
  name: 'Quest Diagnostics',
};

const baseReport: DiagnosticReport = {
  resourceType: 'DiagnosticReport',
  id: 'dr-1',
  status: 'final',
  code: { text: 'CBC Panel', coding: [{ display: 'Complete Blood Count' }] },
  subject: { reference: 'Patient/123' },
  issued: '2024-01-15T10:00:00Z',
};

describe('LabResultListItem', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
    await medplum.createResource(performingPractitioner);
    await medplum.createResource(performingOrganization);
  });

  const setup = (report: DiagnosticReport, selected = false, to = `/lab/${report.id}`): ReturnType<typeof render> =>
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <LabResultListItem report={report} selected={selected} to={to} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );

  describe('Display text', () => {
    test('renders code text when there is a single coding', () => {
      setup(baseReport);
      expect(screen.getByText('CBC Panel')).toBeInTheDocument();
    });

    test('renders multiple coding displays joined by comma', () => {
      setup({
        ...baseReport,
        code: { text: 'Ignored', coding: [{ display: 'Test A' }, { display: 'Test B' }] },
      });
      expect(screen.getByText('Test A, Test B')).toBeInTheDocument();
    });

    test('renders first coding display when code text is missing', () => {
      setup({ ...baseReport, code: { coding: [{ display: 'Single Test' }] } });
      expect(screen.getByText('Single Test')).toBeInTheDocument();
    });

    test('renders fallback text when no code is available', () => {
      setup({ ...baseReport, code: undefined as unknown as DiagnosticReport['code'] });
      expect(screen.getByText('Lab Result')).toBeInTheDocument();
    });
  });

  describe('Completed date', () => {
    test('uses issued date when present', () => {
      setup(baseReport);
      expect(screen.getByText(/^Completed 1\/15\/2024$/)).toBeInTheDocument();
    });

    test('falls back to effectiveDateTime when issued is missing', () => {
      setup({ ...baseReport, issued: undefined, effectiveDateTime: '2024-02-01T10:00:00Z' });
      expect(screen.getByText(/^Completed 2\/1\/2024$/)).toBeInTheDocument();
    });

    test('falls back to meta.lastUpdated when issued and effectiveDateTime are missing', () => {
      setup({ ...baseReport, issued: undefined, meta: { lastUpdated: '2024-03-10T10:00:00Z' } });
      expect(screen.getByText(/^Completed 3\/10\/2024$/)).toBeInTheDocument();
    });
  });

  describe('Sub text', () => {
    test('shows performing practitioner name', async () => {
      setup({ ...baseReport, performer: [{ reference: 'Practitioner/practitioner-1' }] });
      expect(await screen.findByText('Performed by Dr. Alice Smith')).toBeInTheDocument();
    });

    test('shows performing organization name', async () => {
      setup({ ...baseReport, performer: [{ reference: 'Organization/org-1' }] });
      expect(await screen.findByText('Quest Diagnostics')).toBeInTheDocument();
    });

    test('shows collected date when there is no performer', () => {
      setup({ ...baseReport, effectiveDateTime: '2024-01-10T10:00:00Z' });
      expect(screen.getByText('Collected 1/10/2024')).toBeInTheDocument();
    });

    test('falls back to collected date when the organization has no name', async () => {
      await medplum.createResource<Organization>({ resourceType: 'Organization', id: 'org-unnamed' });
      setup({
        ...baseReport,
        effectiveDateTime: '2024-01-10T10:00:00Z',
        performer: [{ reference: 'Organization/org-unnamed' }],
      });
      expect(await screen.findByText('Collected 1/10/2024')).toBeInTheDocument();
    });

    test('omits sub text when there is no performer and no collection date', () => {
      setup(baseReport);
      expect(screen.queryByText(/Collected/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Performed by/)).not.toBeInTheDocument();
    });
  });

  describe('Selection and link', () => {
    test('links to the provided destination', () => {
      setup(baseReport, false, '/Patient/123/labs/DiagnosticReport/dr-1');
      expect(screen.getByRole('link')).toHaveAttribute('href', '/Patient/123/labs/DiagnosticReport/dr-1');
    });

    test('applies selected class when selected', () => {
      const { container } = setup(baseReport, true);
      expect(container.querySelector('[class*="selected"]')).toBeInTheDocument();
    });

    test('does not apply selected class when not selected', () => {
      const { container } = setup(baseReport, false);
      expect(container.querySelector('[class*="selected"]')).not.toBeInTheDocument();
    });
  });
});
