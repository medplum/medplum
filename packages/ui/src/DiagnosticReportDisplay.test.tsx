import { DiagnosticReport, Observation, Patient, Practitioner } from '@medplum/core';
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
  subject: {
    reference: 'Patient/123',
  },
  resultsInterpreter: [{
    reference: 'Practitioner/123',
  }],
  result: [
    { reference: 'Observation/1' },
    { reference: 'Observation/2' },
    { reference: 'Observation/3' },
    { reference: 'Observation/4' },
    { reference: 'Observation/5' },
    { reference: 'Observation/6' },
  ]
};

const patient: Patient = {
  resourceType: 'Patient',
  id: '123',
  name: [{
    given: ['Alice'],
    family: 'Smith'
  }]
};

const practitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: '123',
  name: [{
    prefix: ['Dr.'],
    given: ['Carol'],
    family: 'White'
  }]
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

const syntheaReport: DiagnosticReport = {
  "resourceType": "DiagnosticReport",
  "id": "e508a0f9-17f1-49a9-8151-0e21cb19098f",
  "status": "final",
  "category": [
    {
      "coding": [
        {
          "system": "http://loinc.org",
          "code": "34117-2",
          "display": "History and physical note"
        },
        {
          "system": "http://loinc.org",
          "code": "51847-2",
          "display": "Evaluation+Plan note"
        }
      ]
    }
  ],
  "code": {
    "coding": [
      {
        "system": "http://loinc.org",
        "code": "34117-2",
        "display": "History and physical note"
      },
      {
        "system": "http://loinc.org",
        "code": "51847-2",
        "display": "Evaluation+Plan note"
      }
    ]
  },
  "subject": {
    "reference": "Patient/55a90b63-a6a5-4a4d-86fb-40d156eb55b1"
  },
  "encounter": {
    "reference": "Encounter/cc8f80b9-4ca6-48a2-a916-10992175e8d9"
  },
  "effectiveDateTime": "2019-03-14T06:47:41-07:00",
  "issued": "2019-03-14T06:47:41.275-07:00",
  "performer": [
    {
      "reference": "Practitioner?identifier=http://hl7.org/fhir/sid/us-npi|9999909389",
      "display": "Dr. Antonietta855 Kilback373"
    }
  ],
  "presentedForm": [
    {
      "contentType": "text/plain; charset=utf-8",
      "data": "CjIwMTktMDMtMTQKCiMgQ2hpZWYgQ29tcGxhaW50Ck5vIGNvbXBsYWludHMuCgojIEhpc3Rvcnkgb2YgUHJlc2VudCBJbGxuZXNzCkRpbm8yMTQKIGlzIGEgMzAgeWVhci1vbGQgbm9uLWhpc3BhbmljIHdoaXRlIG1hbGUuIFBhdGllbnQgaGFzIGEgaGlzdG9yeSBvZiBwYXJ0LXRpbWUgZW1wbG95bWVudCAoZmluZGluZyksIGxhY2VyYXRpb24gb2YgdGhpZ2gsIG5vdCBpbiBsYWJvciBmb3JjZSAoZmluZGluZyksIGZ1bGwtdGltZSBlbXBsb3ltZW50IChmaW5kaW5nKSwgdmlyYWwgc2ludXNpdGlzIChkaXNvcmRlciksIGZpcnN0IGRlZ3JlZSBidXJuLCBzdHJlc3MgKGZpbmRpbmcpLCBzb2NpYWwgaXNvbGF0aW9uIChmaW5kaW5nKS4KCiMgU29jaWFsIEhpc3RvcnkKUGF0aWVudCBpcyBtYXJyaWVkLiBQYXRpZW50IGlzIGFuIGFjdGl2ZSBzbW9rZXIgYW5kIGlzIGFuIGFsY29ob2xpYy4KIFBhdGllbnQgaWRlbnRpZmllcyBhcyBoZXRlcm9zZXh1YWwuCgpQYXRpZW50IGNvbWVzIGZyb20gYSBtaWRkbGUgc29jaW9lY29ub21pYyBiYWNrZ3JvdW5kLgogUGF0aWVudCBoYXMgY29tcGxldGVkIHNvbWUgY29sbGVnZSBjb3Vyc2VzLgpQYXRpZW50IGN1cnJlbnRseSBoYXMgSHVtYW5hLgoKIyBBbGxlcmdpZXMKTm8gS25vd24gQWxsZXJnaWVzLgoKIyBNZWRpY2F0aW9ucwphY2V0YW1pbm9waGVuIDMyNSBtZyBvcmFsIHRhYmxldDsgbmFwcm94ZW4gc29kaXVtIDIyMCBtZyBvcmFsIHRhYmxldDsgYWNldGFtaW5vcGhlbiAzMDAgbWcgLyBoeWRyb2NvZG9uZSBiaXRhcnRyYXRlIDUgbWcgb3JhbCB0YWJsZXQKCiMgQXNzZXNzbWVudCBhbmQgUGxhbgpQYXRpZW50IGlzIHByZXNlbnRpbmcgd2l0aCBmdWxsLXRpbWUgZW1wbG95bWVudCAoZmluZGluZyksIGxpbWl0ZWQgc29jaWFsIGNvbnRhY3QgKGZpbmRpbmcpLiAKCiMjIFBsYW4KUGF0aWVudCB3YXMgZ2l2ZW4gdGhlIGZvbGxvd2luZyBpbW11bml6YXRpb25zOiBpbmZsdWVuemEsIHNlYXNvbmFsLCBpbmplY3RhYmxlLCBwcmVzZXJ2YXRpdmUgZnJlZS4gClRoZSBmb2xsb3dpbmcgcHJvY2VkdXJlcyB3ZXJlIGNvbmR1Y3RlZDoKLSBhc3Nlc3NtZW50IG9mIGhlYWx0aCBhbmQgc29jaWFsIGNhcmUgbmVlZHMgKHByb2NlZHVyZSkKLSBkZXByZXNzaW9uIHNjcmVlbmluZyAocHJvY2VkdXJlKQotIGRlcHJlc3Npb24gc2NyZWVuaW5nIHVzaW5nIHBhdGllbnQgaGVhbHRoIHF1ZXN0aW9ubmFpcmUgdHdvLWl0ZW0gc2NvcmUgKHByb2NlZHVyZSkKVGhlIHBhdGllbnQgd2FzIHByZXNjcmliZWQgdGhlIGZvbGxvd2luZyBtZWRpY2F0aW9uczoKLSBhY2V0YW1pbm9waGVuIDMwMCBtZyAvIGh5ZHJvY29kb25lIGJpdGFydHJhdGUgNSBtZyBvcmFsIHRhYmxldAo="
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
  'fhir/R4/Patient/123': {
    'GET': patient
  },
  'fhir/R4/Practitioner/123': {
    'GET': practitioner
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
    expect(screen.getByText('110/75')).toBeDefined();
  });

  test('Renders by reference', async () => {
    await act(async () => {
      setup({ value: { reference: 'DiagnosticReport/123' } });
    });
    expect(screen.getByText('Diagnostic Report')).toBeDefined();
    expect(screen.getByText('110/75')).toBeDefined();
  });

  test('Renders presented form', async () => {
    await act(async () => {
      setup({ value: syntheaReport });
    });
    expect(screen.getByText('Diagnostic Report')).toBeDefined();
    expect(screen.getByText('Chief Complaint')).toBeDefined();
  });

});
