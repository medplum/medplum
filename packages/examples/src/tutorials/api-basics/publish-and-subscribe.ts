// start-block core-imports
import { createReference, getReferenceString, MedplumClient } from '@medplum/core';
import fetch from 'node-fetch';

// end-block core-imports

// start-block specimen-imports
import { Specimen } from '@medplum/fhirtypes';

// end-block specimen-imports

// start-block report-imports
import { Observation, DiagnosticReport } from '@medplum/fhirtypes';

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

// start-block create-service-request
/**
 * Creates an order by creating Patient and ServiceRequest resources.
 *
 * We will use this in the "conditional create".
 * When creating an order, and if you don't know if the patient exists,
 * you can use this MRN to check.
 */
async function createServiceRequest(patientMrn: string): Promise<void> {
  // First, create the patient if they don't exist.
  // Use the "conditional create" ("ifNoneExist") feature to only create the patient if they do not exist.
  const patient = await medplum.createResourceIfNoneExist(
    {
      resourceType: 'Patient',
      name: [{ given: ['Batch'], family: 'Test' }],
      birthDate: '2020-01-01',
      gender: 'male',
      identifier: [
        {
          system: 'https://namespace.example.health/',
          value: patientMrn,
        },
      ],
    },
    'identifier=' + patientMrn
  );

  const serviceRequest = await medplum.createResource({
    resourceType: 'ServiceRequest',
    subject: createReference(patient),
    code: {
      coding: [
        {
          system: 'https://samplelab.com/tests',
          code: 'A1C_ONLY',
        },
      ],
    },
  });

  // Should print "Patient/{id}"
  console.log(getReferenceString(patient));

  // Should print "ServiceRequest/{id}"
  console.log(getReferenceString(serviceRequest));
}
// end-block create-service-request

await createServiceRequest('MRN1234');

// start-block create-specimen
/**
 * Creates a Specimen for a given ServiceRequest
 */
async function createSpecimenForServiceRequest(serviceRequestID: string): Promise<void> {
  // First, create the specimen resource
  const specimen: Specimen = await medplum.createResource({
    resourceType: 'Specimen',
    status: 'available',
    request: [
      {
        reference: `ServiceRequest/${serviceRequestID}`,
      },
    ],
    type: {
      text: 'SERUM',
      coding: [
        {
          system: 'https://namespace.specimentype.health/',
          code: 'SERUM',
        },
      ],
    },
  });

  // Next, update the ServiceRequest to show that the specimen was collected.
  const serviceRequest = await medplum.readResource('ServiceRequest', serviceRequestID);
  serviceRequest.orderDetail = [
    {
      text: 'SAMPLE_COLLECTED',
    },
  ];
  const updatedServiceRequest = await medplum.updateResource(serviceRequest);

  // Should print "Specimen/{id}"
  console.log(getReferenceString(specimen));

  // Should print "SAMPLE_COLLECTED"
  console.log(updatedServiceRequest.orderDetail?.[0].text);
}
// end-block create-specimen

await createSpecimenForServiceRequest('1234');

// start-block create-report
async function createReport(patientId: string, serviceRequestId: string): Promise<void> {
  // Retrieve the Patient and ServiceRequest
  const patient = await medplum.readResource('Patient', patientId);
  const serviceRequest = await medplum.readResource('ServiceRequest', serviceRequestId);

  // Create the first Observation resource.
  const observation: Observation = await medplum.createResource({
    resourceType: 'Observation',
    basedOn: [createReference(serviceRequest)],
    subject: createReference(patient),
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
  });

  // Create a DiagnosticReport resource.
  const report: DiagnosticReport = await medplum.createResource({
    resourceType: 'DiagnosticReport',
    basedOn: [
      {
        reference: serviceRequestId,
      },
    ],
    subject: {
      reference: patientId,
    },
    code: {
      coding: [
        {
          system: 'https://samplelab.com/testpanels',
          code: 'A1C_ONLY',
        },
      ],
    },
    result: [createReference(observation)],
  });

  // Next, update the ServiceRequest to show that the sample was processed and the report created.
  serviceRequest.orderDetail = [
    {
      text: 'LAB_PROCESSED',
    },
  ];
  await medplum.updateResource(serviceRequest);

  // Should print DiagnosticReport/{id}
  console.log(getReferenceString(report));
}
// end-block create-report
await createReport('1234', '5678');
