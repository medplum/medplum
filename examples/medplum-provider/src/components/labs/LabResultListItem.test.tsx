// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { createReference } from '@medplum/core';
import type { DiagnosticReport } from '@medplum/fhirtypes';
import { DrAliceSmith, MockClient, TestOrganization } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { LabResultListItem } from './LabResultListItem';

const report: DiagnosticReport = { resourceType: 'DiagnosticReport', status: 'final', code: { text: 'CBC Panel' } };

describe('LabResultListItem', () => {
  const setup = (report: DiagnosticReport, selected = false): ReturnType<typeof render> =>
    render(
      <MedplumProvider medplum={new MockClient()}>
        <MantineProvider>
          <LabResultListItem report={report} selected={selected} to="/lab/1" />
        </MantineProvider>
      </MedplumProvider>
    );

  test.each<[string, Partial<DiagnosticReport>, string]>([
    ['the code text', {}, 'CBC Panel'],
    ['the issued date', { issued: '2024-01-15T10:00:00Z' }, 'Completed 1/15/2024'],
    ['coding displays joined by comma', { code: { coding: [{ display: 'A' }, { display: 'B' }] } }, 'A, B'],
    ['the coding display when code text is missing', { code: { coding: [{ display: 'Single' }] } }, 'Single'],
    ['fallback text when no code is available', { code: undefined }, 'Lab Result'],
    ['the performing practitioner', { performer: [createReference(DrAliceSmith)] }, 'Performed by Alice Smith'],
    ['the performing organization', { performer: [createReference(TestOrganization)] }, 'Test Organization'],
    ['the collection date', { effectiveDateTime: '2024-01-10T10:00:00Z' }, 'Collected 1/10/2024'],
  ])('renders %s', async (_name, overrides, text) => {
    setup({ ...report, ...overrides });
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  test('links to the destination, applies the selected class and omits empty sub text', () => {
    const { container } = setup(report, true);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/lab/1');
    expect(container.querySelector('[class*="selected"]')).toBeInTheDocument();
    expect(screen.queryByText(/Collected|Performed by/)).not.toBeInTheDocument();
  });
});
