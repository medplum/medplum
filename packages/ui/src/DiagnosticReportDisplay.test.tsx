import { DiagnosticReport, MedplumClient, Observation } from '@medplum/core';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { DiagnosticReportDisplay, DiagnosticReportDisplayProps } from './DiagnosticReportDisplay';
import { MedplumProvider } from './MedplumProvider';

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

function mockFetch(url: string, options: any): Promise<any> {
  let result = {};


  if (url.endsWith('/DiagnosticReport/123')) {
    result = diagnosticReport;
  } else if (url.endsWith('/Observation/1')) {
    result = observation1;
  } else if (url.endsWith('/Observation/2')) {
    result = observation2;
  } else if (url.endsWith('/Observation/3')) {
    result = observation3;
  } else if (url.endsWith('/Observation/4')) {
    result = observation4;
  } else if (url.endsWith('/Observation/5')) {
    result = observation5;
  } else if (url.endsWith('/Observation/6')) {
    result = observation6;
  }

  const response: any = {
    request: {
      url,
      options
    },
    ...result
  };

  return Promise.resolve({
    blob: () => Promise.resolve(response),
    json: () => Promise.resolve(response)
  });
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: mockFetch
});

describe('DiagnosticReportDisplay', () => {

  beforeAll(async () => {
    await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
  });

  const setup = (args: DiagnosticReportDisplayProps) => {
    return render(
      <MedplumProvider medplum={medplum}>
        <DiagnosticReportDisplay {...args} />
      </MedplumProvider>
    );
  };

  test('Renders by value', async () => {
    await act(async () => {
      setup({ value: diagnosticReport });
    });
    expect(screen.getByText('Diagnostic Report')).not.toBeUndefined();
    expect(screen.getByText('110/75'));
  });

  test('Renders by reference', async () => {
    await act(async () => {
      setup({ value: { reference: 'DiagnosticReport/123' } });
    });
    expect(screen.getByText('Diagnostic Report')).not.toBeUndefined();
    expect(screen.getByText('110/75'));
  });

});
