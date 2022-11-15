import { DiagnosticReport } from '@medplum/fhirtypes';
import { HomerDiagnosticReport, MockClient } from '@medplum/mock';
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { DiagnosticReportDisplay, DiagnosticReportDisplayProps } from './DiagnosticReportDisplay';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';

const syntheaReport: DiagnosticReport = {
  resourceType: 'DiagnosticReport',
  id: 'e508a0f9-17f1-49a9-8151-0e21cb19098f',
  status: 'final',
  category: [
    {
      coding: [
        {
          system: 'http://loinc.org',
          code: '34117-2',
          display: 'History and physical note',
        },
        {
          system: 'http://loinc.org',
          code: '51847-2',
          display: 'Evaluation+Plan note',
        },
      ],
    },
  ],
  code: {
    coding: [
      {
        system: 'http://loinc.org',
        code: '34117-2',
        display: 'History and physical note',
      },
      {
        system: 'http://loinc.org',
        code: '51847-2',
        display: 'Evaluation+Plan note',
      },
    ],
  },
  subject: {
    reference: 'Patient/55a90b63-a6a5-4a4d-86fb-40d156eb55b1',
  },
  encounter: {
    reference: 'Encounter/cc8f80b9-4ca6-48a2-a916-10992175e8d9',
  },
  effectiveDateTime: '2019-03-14T06:47:41-07:00',
  issued: '2019-03-14T06:47:41.275-07:00',
  performer: [
    {
      reference: 'Practitioner?identifier=http://hl7.org/fhir/sid/us-npi|9999909389',
      display: 'Dr. Antonietta855 Kilback373',
    },
  ],
  presentedForm: [
    {
      contentType: 'text/plain; charset=utf-8',
      data: 'SGVsbG8gd29ybGQ=',
    },
  ],
};

const medplum = new MockClient();

describe('DiagnosticReportDisplay', () => {
  function setup(args: DiagnosticReportDisplayProps): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <DiagnosticReportDisplay {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders by value', async () => {
    await act(async () => {
      setup({ value: HomerDiagnosticReport });
    });

    // See packages/mock/src/mocks/simpsons.ts
    expect(screen.getByText('Diagnostic Report')).toBeDefined();
    expect(screen.getByText('110 mmHg / 75 mmHg')).toBeDefined();
    expect(screen.getByText('> 50 x')).toBeDefined();
    expect(screen.getByText('Specimen hemolyzed. Results may be affected.', { exact: false })).toBeDefined();
    expect(screen.getByText('Specimen lipemic. Results may be affected.', { exact: false })).toBeDefined();
    expect(screen.getByText('Critical high')).toBeInTheDocument();
    expect(screen.getByText('Critical high')).toHaveStyle('background:');
  });

  test('Renders by reference', async () => {
    await act(async () => {
      setup({ value: { reference: 'DiagnosticReport/123' } });
    });

    // See packages/mock/src/mocks/simpsons.ts
    expect(screen.getByText('Diagnostic Report')).toBeDefined();
    expect(screen.getByText('110 mmHg / 75 mmHg')).toBeDefined();
    expect(screen.getByText('10 - 50 x')).toBeDefined();
    expect(screen.getByText('> 50 x')).toBeDefined();
  });

  test('Renders presented form', async () => {
    await act(async () => {
      setup({ value: syntheaReport });
    });
    expect(screen.getByText('Diagnostic Report')).toBeDefined();
    expect(screen.getByText('Hello world')).toBeDefined();
  });
});
