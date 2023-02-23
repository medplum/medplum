import { createReference } from '@medplum/core';
import { DiagnosticReport } from '@medplum/fhirtypes';
import { HomerDiagnosticReport, MockClient } from '@medplum/mock';
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { CreatinineObservation, ExampleReport } from '../stories/referenceLab';
import { DiagnosticReportDisplay, DiagnosticReportDisplayProps } from './DiagnosticReportDisplay';

const syntheaReport: DiagnosticReport = {
  resourceType: 'DiagnosticReport',
  id: 'e508a0f9-17f1-49a9-8151-0e21cb19098f',
  status: 'final',
  specimen: HomerDiagnosticReport.specimen,
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
    expect(screen.getAllByText('final')).toHaveLength(7);
    expect(screen.getAllByText('corrected')).toHaveLength(1);
    screen.getAllByText('final').forEach((badge) => expect(badge).toHaveClass('mantine-Badge-inner'));
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

  test('Renders performer', async () => {
    const obs = await medplum.createResource(CreatinineObservation);
    ExampleReport.result = [createReference(obs)];
    await medplum.updateResource(ExampleReport);
    await act(async () => {
      setup({ value: ExampleReport });
    });

    expect(screen.getByText('Test Organization')).not.toBeNull();
    expect(screen.getByText('Alice Smith')).not.toBeNull();
  });

  test('Renders observation category', async () => {
    const obs = await medplum.createResource(CreatinineObservation);
    ExampleReport.result = [createReference(obs)];
    await medplum.updateResource(ExampleReport);
    await act(async () => {
      setup({ value: ExampleReport });
    });
    expect(screen.getByText('Diagnostic Report')).toBeDefined();
    expect(screen.getByText('Day 2')).toBeDefined();
  });

  test('Renders observation note', async () => {
    const obs = await medplum.createResource(CreatinineObservation);
    ExampleReport.result = [createReference(obs)];
    await medplum.updateResource(ExampleReport);
    await act(async () => {
      setup({ value: ExampleReport });
    });
    expect(screen.getByText('Previously reported as 167 mg/dL on 2/3/2023, 8:40:14 PM')).not.toBeNull();
  });

  test('Hide observation note', async () => {
    const obs = await medplum.createResource(CreatinineObservation);
    ExampleReport.result = [createReference(obs)];
    await medplum.updateResource(ExampleReport);
    await act(async () => {
      setup({ value: ExampleReport, hideObservationNotes: true });
    });
    expect(screen.queryByText('Previously reported as 167 mg/dL on 2/3/2023, 8:40:14 PM')).toBeNull();
  });

  test('Renders specimen note', async () => {
    await act(async () => {
      setup({ value: syntheaReport });
    });

    expect(screen.queryByText('Specimen hemolyzed. Results may be affected.')).not.toBeNull();
    expect(screen.queryByText('Specimen lipemic. Results may be affected.')).not.toBeNull();
  });

  test('Renders specimen collected time', async () => {
    await act(async () => {
      setup({ value: syntheaReport });
    });

    expect(screen.queryByText('Collected:')).not.toBeNull();
  });

  test('Renders hide specimen info', async () => {
    await act(async () => {
      setup({ value: syntheaReport, hideSpecimenInfo: true });
    });

    expect(screen.queryByText('Collected:')).toBeNull();
  });
});
