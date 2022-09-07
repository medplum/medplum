---
sidebar_position: 1
---

# Creating FHIR Data

This is a quickstart sample application that introduces some basic FHIR and Medplum concepts.

## Prerequisites

You will need the following to get started and instructions on how to set this up were covered in the previous article.

- Make sure you have an account and log into [Medplum](https://app.medplum.com)
- Log in and create [Client Application](https://app.medplum.com/ClientApplication)
- Save the Client ID and Client Secret, they will be needed to get your sample to run.

These three requirements will need to be in place to connect

```js
const MY_CLIENT_ID = 'MY_CLIENT_ID';
const MY_CLIENT_SECRET = 'MY_CLIENT_SECRET';
```

## Example App - Simple Lab Results Workflow

This example represents a common healthcare workflow, creating an order for lab tests (a.k.a `ServiceRequest` in FHIR) for patients and when the lab test is complete creating results (a.k.a. `Observation` and `DiagnosticReport` in FHIR) that correspond to the original `ServiceRequest`.

This example will illustrate how to create FHIR object, how to update them, how to link them, and them how to read them back in bulk.

Here is a breakdown of workflow at a high level

- Authenticate with the server using OAuth client credentials flow
- Use FHIR batch request to create a [Patient](../../api/fhir/resources/patient) and a [ServiceRequest](../../api/fhir/resources/servicerequest)
  - The example will use a conditional to only create the Patient if it does not already exist
  - The example will link the ServiceRequest to the Patient
- Create an [Observation](../../api/fhir/resources/observation) and DiagnosticReport resources
- Read back the [DiagnosticReport](../../api/fhir/resources/diagnosticreport) and [Observations](../../api/fhir/resources/observation)
  - Use a batch request to read all Observations in one go, versus making mulitple requests

## Authenticating using OAuth client credentials flow

The [client credentials](https://oauth.net/2/grant-types/client-credentials/) flow is a type of connection that is used to obtain an access token outside the context of the user.

```ts
import fetch from 'node-fetch';
import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient({
  baseUrl: 'https://api.medplum.com/',
  fetch: fetch,
});
await medplum.startClientLogin(MY_CLIENT_ID, MY_CLIENT_SECRET);
```

## Creating the Patient and Service Request

[Patient](../../api/fhir/resources/patient) and a [ServiceRequest](../../api/fhir/resources/servicerequest) sounds simple, but there are several nuances. If the [Patient](../../api/fhir/resources/patient) already exists, a new one should not be created. We also need to ensure that the [ServiceRequest](../../api/fhir/resources/servicerequest) is linked to the correct patient.

### Creating Patient

Creating a Patient if one does not exist uses the **conditional create** logic in FHIR. In this example, a patient has an Medical Record Number or MRN. If that MRN exists, then a new patient should not be created. In a lab workflow, it is common for a lab to serve patients repeatedly. In this case where there is already a patient in the system, it would be incorrect (and confusing) to make a new patient record.

```ts
import { Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';

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
```

The behavior of the the `Patient.identifier` field is important to note. `Patient.identifier` usually has a reference string or URL that describes which system that identifier came from. [Identifiers](/docs/fhir-basics#identifiers-naming-resources) are a concept in FHIR which describe the context in which that identifier is generated, for example, and identifier could be a Social Security Number (SSN) or be created by a health system for their own internal purposes. Here is an example of an identifier scheme for the [Australian Healthcare system](https://namespaces.digitalhealth.gov.au/id/hi/ihi/1.0/).

We recommend that providers put documentation of their identifier system online for interoperability purposes.

### Create the ServiceRequest

Creating a new [ServiceRequest](/docs/api/fhir/resources/servicerequest) also has some nuance to it. ServiceRequests in this context can be thought of as a "requisition for a lab test" and the `ServiceRequest.code` specifies _what test panel_ is being ordered. Most labs will have a concept of a test menu and that should indicate which labs should be run for this service request.

Note that there are many fields on the requisition, and filling them in with the right data is crucial. This example is minimal for clarity.

```ts
import { ServiceRequest } from '@medplum/fhirtypes';
import { createReference } from '@medplum/core';

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
```

If you are using the [hosted Medplum service](https://app.medplum.com) you can see your `ServiceRequest` objects [here](https://app.medplum.com/ServiceRequest). Similarly, you can see `Patients` [here](https://app.medplum.com/Patient).

## Creating the Diagnostic Report

Once the lab test has been completed and the specimens analyzed, it is time to create a diagnostic report - but it is really important to link that diagnostic report back to the `Patient` and the corresponding `ServiceRequest`.

To get this to be linked up, you'll need to have the identifiers for the Patient and ServiceRequest that were created in the previous section.

You can then create a diagnostic report using the function below.

### Create the Observations

```ts
import { Observation } from '@medplum/fhirtypes';

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
```

### Create Report

```ts
import { DiagnosticReport } from '@medplum/fhirtypes';

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
```

This will create a `DiagnosticReport` that is linked to the `ServiceRequest` and to the `Patient`. If you are using hosted Medplum, you can view all `DiagnosticReports` [here](https://app.medplum.com/DiagnosticReport).

## Conclusion

Hopefully this simple lab workflow, "ordering a lab" and "getting a lab report" was a good beginner illustration on getting started with FHIR. We welcome your feedback. Please feel free to file issues or submit pull requests.

This sample is based on a service where data is hosted on Medplum, but for those who need the data stored on premise, we do support self-hosting the backend.
