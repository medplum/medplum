// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { createReference } from '@medplum/core';
import type { CodeableConcept, DiagnosticReport } from '@medplum/fhirtypes';
import { DrAliceSmith, MockClient, TestOrganization } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test } from 'vitest';
import { LabResultListItem } from './LabResultListItem';

const baseReport: DiagnosticReport = {
  resourceType: 'DiagnosticReport',
  id: 'dr-1',
  status: 'final',
  code: { text: 'CBC Panel', coding: [{ display: 'Complete Blood Count' }] },
  issued: '2024-01-15T10:00:00Z',
};

describe('LabResultListItem', () => {
  const setup = (report: DiagnosticReport, selected = false): ReturnType<typeof render> =>
    render(
      <MemoryRouter>
        <MedplumProvider medplum={new MockClient()}>
          <MantineProvider>
            <LabResultListItem report={report} selected={selected} to={`/lab/${report.id}`} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );

  test.each<[string, CodeableConcept | undefined, string]>([
    ['code text when there is a single coding', baseReport.code, 'CBC Panel'],
    ['coding displays joined by comma', { coding: [{ display: 'Test A' }, { display: 'Test B' }] }, 'Test A, Test B'],
    ['first coding display when code text is missing', { coding: [{ display: 'Single Test' }] }, 'Single Test'],
    ['fallback text when no code is available', undefined, 'Lab Result'],
  ])('renders %s with the issued date', (_name, code, text) => {
    setup({ ...baseReport, code } as DiagnosticReport);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByText('Completed 1/15/2024')).toBeInTheDocument();
  });

  test.each([
    ['performing practitioner name', DrAliceSmith, 'Performed by Alice Smith'],
    ['performing organization name', TestOrganization, 'Test Organization'],
  ])('shows the %s', async (_name, performer, text) => {
    setup({ ...baseReport, performer: [createReference(performer)] });
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  test('falls back to the collection date when there is no performer and no issued date', () => {
    setup({ ...baseReport, issued: undefined, effectiveDateTime: '2024-01-10T10:00:00Z' });
    expect(screen.getByText('Completed 1/10/2024')).toBeInTheDocument();
    expect(screen.getByText('Collected 1/10/2024')).toBeInTheDocument();
  });

  test('links to the destination, applies the selected class and omits empty sub text', () => {
    const { container } = setup(baseReport, true);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/lab/dr-1');
    expect(container.querySelector('[class*="selected"]')).toBeInTheDocument();
    expect(screen.queryByText(/Collected|Performed by/)).not.toBeInTheDocument();
  });
});
