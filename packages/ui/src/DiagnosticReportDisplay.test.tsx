import { DiagnosticReport, Observation } from '@medplum/core';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { DiagnosticReportDisplay, DiagnosticReportDisplayProps } from './DiagnosticReportDisplay';
import { MedplumProvider } from './MedplumProvider';
import { MockClient } from './MockClient';

const diagnosticReport: DiagnosticReport = {
  resourceType: 'DiagnosticReport',
  id: '123',
  result: [
    { reference: 'Observation/1' },
    { reference: 'Observation/2' },
    { reference: 'Observation/3' },
    { reference: 'Observation/4' },
    { reference: 'Observation/5' },
    { reference: 'Observation/6' },
  ]
};

const observation1: Observation = {
  resourceType: 'Observation',
  id: '1',
  valueString: 'test'
};

const observation2: Observation = {
  resourceType: 'Observation',
  id: '2',
  valueQuantity: {
    value: 20,
    unit: 'x'
  },
  referenceRange: [{
    low: {
      value: 10
    }
  }]
};

const observation3: Observation = {
  resourceType: 'Observation',
  id: '3',
  valueQuantity: {
    value: 30,
    unit: 'x'
  },
  referenceRange: [{
    high: {
      value: 50
    }
  }]
};

const observation4: Observation = {
  resourceType: 'Observation',
  id: '4',
  valueQuantity: {
    value: 50,
    unit: 'x'
  },
  referenceRange: [{
    low: {
      value: 10
    },
    high: {
      value: 50
    }
  }],
  interpretation: [{
    text: 'HIGH'
  }]
};

const observation5: Observation = {
  resourceType: 'Observation',
  id: '5',
  valueQuantity: {
    value: 100,
    unit: 'x'
  },
  referenceRange: [{}],
  interpretation: [{}]
};

const observation6: Observation = {
  resourceType: 'Observation',
  component: [
    {
      valueQuantity: {
        value: 110,
        unit: 'mmHg',
        system: 'http://unitsofmeasure.org'
      }
    },
    {
      valueQuantity: {
        value: 75,
        unit: 'mmHg',
        system: 'http://unitsofmeasure.org'
      }
    }
  ]
};

const medplum = new MockClient({
  'auth/login': {
    'POST': {
      profile: { reference: 'Practitioner/123' }
    }
  },
  'fhir/R4/DiagnosticReport/123': {
    'GET': diagnosticReport
  },
  'fhir/R4/Observation/1': {
    'GET': observation1
  },
  'fhir/R4/Observation/2': {
    'GET': observation2
  },
  'fhir/R4/Observation/3': {
    'GET': observation3
  },
  'fhir/R4/Observation/4': {
    'GET': observation4
  },
  'fhir/R4/Observation/5': {
    'GET': observation5
  },
  'fhir/R4/Observation/6': {
    'GET': observation6
  },
});

describe('DiagnosticReportDisplay', () => {

  const setup = (args: DiagnosticReportDisplayProps) => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <DiagnosticReportDisplay {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders by value', async () => {
    await act(async () => {
      setup({ value: diagnosticReport });
    });
    expect(screen.getByText('Diagnostic Report')).toBeDefined();
    expect(screen.getByText('110/75'));
  });

  test('Renders by reference', async () => {
    await act(async () => {
      setup({ value: { reference: 'DiagnosticReport/123' } });
    });
    expect(screen.getByText('Diagnostic Report')).toBeDefined();
    expect(screen.getByText('110/75'));
  });

});
