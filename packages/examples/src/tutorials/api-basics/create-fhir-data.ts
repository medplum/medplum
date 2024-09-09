/* eslint-disable no-duplicate-imports */

// start-block core-imports
import { MedplumClient, UCUM } from '@medplum/core';
import fetch from 'node-fetch';

// end-block core-imports
// start-block patient-imports
import { Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';

// end-block patient-imports
// start-block service-request-imports
import { createReference } from '@medplum/core';
import { ServiceRequest } from '@medplum/fhirtypes';

// end-block service-request-imports
// start-block observation-imports
import { Observation } from '@medplum/fhirtypes';

// end-block observation-imports
// start-block report-imports
import { DiagnosticReport } from '@medplum/fhirtypes';

// end-block report-imports
// start-block api-keys
const MY_CLIENT_ID = 'MY_CLIENT_ID';
const MY_CLIENT_SECRET = 'MY_CLIENT_SECRET';
// end-block api-keys

// start-block create-client
const medplum = new MedplumClient({
  baseUrl: 'https://api.medplum.com/',
  fetch: fetch,
});
await medplum.startClientLogin(MY_CLIENT_ID, MY_CLIENT_SECRET);
// end-block create-client

// start-block create-patient
// Generate an example MRN (Medical Record Number)
// We will use this in the "conditional create" and "upsert"
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
// you can use this MRN to check. Use the 'identifier=' search criterion for a
// conditional create: if a resource with the given `identifier` already exists,
// that resource will be returned instead.
const patient = await medplum.createResourceIfNoneExist(patientData, 'identifier=' + exampleMrn);
console.log('Patient record created', patient);
// end-block create-patient

/*

// start-block upsertCli
medplum put 'Patient?identifier=<exampleMrn>'  <patientResource>
// end-block upsertCli


// start-block upsertCurl
curl -X PUT 'https://api.medplum.com/fhir/R4/Patient?identifier=<exampleMrn>' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
  -d '<patientResource>'
// end-block upsertCurl

*/

// start-block upsertTs
// An "upsert" (i.e. update/insert) will either update the resource in place if it
// already exists, otherwise is will be created.  This is performed in a single,
// transactional request to guarantee data consistency.
const updatedPatient = medplum.upsertResource(patient, 'identifier=' + exampleMrn);
console.log('Patient record updated', updatedPatient);
// end-block upsertTs

// start-block create-service-request

const serviceRequestData: ServiceRequest = {
  resourceType: 'ServiceRequest',
  status: 'active',
  intent: 'order',
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
// end-block create-service-request

// start-block create-observations
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
      system: UCUM,
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
      system: UCUM,
      code: 'mg/dL',
    },
  },
];

// Map through the observation data to create all the observations
const observations = await Promise.all(observationData.map(async (data) => medplum.createResource(data)));

for (const observation of observations) {
  console.log('Created Observation', observation.id);
}
// end-block create-observations

// start-block create-report
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
console.log('Created Report', report.id);
// end-block create-report
