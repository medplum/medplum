import fetch from 'node-fetch';
import { MedplumClient } from '@medplum/core';

import { Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';

import { ServiceRequest } from '@medplum/fhirtypes';
import { createReference } from '@medplum/core';

import { Observation } from '@medplum/fhirtypes';

import { DiagnosticReport } from '@medplum/fhirtypes';

const MY_CLIENT_ID = 'MY_CLIENT_ID';
const MY_CLIENT_SECRET = 'MY_CLIENT_SECRET';

const medplum = new MedplumClient({
  baseUrl: 'https://api.medplum.com/',
  fetch: fetch,
});
await medplum.startClientLogin(MY_CLIENT_ID, MY_CLIENT_SECRET);

// Generate an example MRN (Medical Record Number)
// We will use this in the "conditional create"
const exampleMrn = randomUUID();
const patientData: Patient = {
  resourceType: 'Patient',
  name: [{ given: ['Batch'], family: 'Test' }],
  birthDate: '2020-01-01',
  gender: 'female',
  identifier: [
    {
      system: 'https://namespace.example.health/',
      value: exampleMrn,
    },
  ],
};

// When creating an order, and if you don't know if the patient exists,
// you can use this MRN to check. Use this search criterion to make sure the 'identifier=' criterion
// for a conditional create
const patient = await medplum.createResourceIfNoneExist(patientData, 'identifier=' + exampleMrn);
console.log('Created Patient', patient.id);

const serviceRequestData: ServiceRequest = {
  resourceType: 'ServiceRequest',
  subject: createReference(patient), // link this ServiceRequest to the Patient
  code: {
    coding: [
      {
        system: 'https://samplelab.com/tests',
        code: 'SAMPLE_SKU',
      },
    ],
  },
};

const serviceRequest = await medplum.createResource(serviceRequestData);
console.log('Service Request', serviceRequest.id);

// Create two observations from the array
const observationData: Observation[] = [
  {
    resourceType: 'Observation',
    basedOn: [createReference(serviceRequest)], // Connect this Observation to the ServiceRequest
    subject: createReference(patient), // Connect this Observation to the Patient
    status: 'preliminary',
    code: {
      coding: [
        {
          system: 'https://samplelabtests.com/tests',
          code: 'A1c',
          display: 'A1c',
        },
      ],
    },
    valueQuantity: {
      value: 5.7,
      unit: 'mg/dL',
      system: 'http://unitsofmeasure.org',
      code: 'mg/dL',
    },
  },
  {
    resourceType: 'Observation',
    basedOn: [createReference(serviceRequest)], // Connect this Observation to the ServiceRequest
    subject: createReference(patient), // Connect this Observation to the Patient
    status: 'preliminary',
    code: {
      coding: [
        {
          system: 'https://samplelabtests.com/tests',
          code: 'blood_glucose',
          display: 'Blood Glucose',
        },
      ],
    },
    valueQuantity: {
      value: 100,
      unit: 'mg/dL',
      system: 'http://unitsofmeasure.org',
      code: 'mg/dL',
    },
  },
];

// Map through the observation data to create all the observations
const observations = await Promise.all(observationData.map(async (data) => medplum.createResource(data)));

for (const observation of observations) {
  console.log('Created Observation', observation.id);
}

const reportData: DiagnosticReport = {
  resourceType: 'DiagnosticReport',
  basedOn: [createReference(serviceRequest)], // Connect this DiagnosticReport to the ServiceRequest
  subject: createReference(patient), // Connect this DiagnosticReport to the Patient,
  status: 'preliminary',
  code: {
    coding: [
      {
        system: 'https://samplelab.com/testpanels',
        code: 'SAMPLE_SKU',
      },
    ],
  },
  result: observations.map(createReference), // Create an array of references to the relevant observations
};
const report = await medplum.createResource(reportData);
console.log(report);
