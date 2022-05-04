---
sidebar_position: 2
---

# Publish and Subscribe

In a healthcare setting, Publish and Subcribe is a common pattern. For example: an everyday workflow in a laboratory setting is for a physician to create a lab order for a patient, and then receive a finalized lab report once the sample has been collected from the patient and processed.

In the past, this would have been a scenario where the patient is sent to a lab to get a blood test, and the lab report is faxed back to the doctor who ordered it.

This example will walk through how to technically using FHIR objects and [FHIRPath](https://hl7.org/fhirpath/) triggers. For those unfamiliar with FHIRPath triggers, it is helpful to think of them a kind of webhook that is triggered on changes to a FHIR search filter.

This tutorial will walk through an common clinical example, to demonstrate both the functionality and a use case.

- Create a ServiceRequest that "orders" the lab test
- Update the ServiceRequest it moves through a workflow, for example - the sample is collected, the sample is analyzed, diagnostic report is created etc.
- Create the Observations and DiagnosticReport that corresponds to the ServiceRequest above
- Send a notification to another web application as the ServiceRequest is updated

## Prerequisites

You will need to have a `ClientApplication` and `ClientSecret` in order to get this sample to work via the API. You can find your [ClientApplication](https://app.medplum.com/ClientApplication)s on Medplum.

If you just want to set up the FHIR notifications, you can drive the full workflow through the [Medplum](https://app.medplum.com) webapp by editing the objects from the web application.

## Setting up the "Subscription"

In this example, we will set up the system to send a FHIRPath notification (webhook) to another application every time there is a change to a ServiceRequest.

To set up your [Subscription](https://app.medplum.com/Subscription) page in Medplum and [create a new](https://app.medplum.com/Subscription/new) subscription.

The `Criteria` section in the setup is what determines the triggering event for notifications. For example you put `ServiceRequest` in the `Criteria` section, all changes to ServiceRequests will generate a notification.

The `Endpoint` is the place where the subscribing web application URL should be placed. A full JSON representation of the object will be posted to the URL provided.

Before moving on to the rest of the tutorial, **we recommend testing your subscription** by attempting to trigger the webhook and inspect the data. If you have set up your webhook correctly you should see events when you [create a new](https://app.medplum.com/ServiceRequest/new) ServiceRequest or edit an existing [ServiceRequest](https://app.medplum.com/ServiceRequest). You will also see [AuditEvents](https://app.medplum.com/AuditEvent) created for the Subscription.

You can use any enpoint you like, and there are free services like [Pipedream](https://pipedream.com/) that you can use to set up an endpoint for testing purposes.

## Creating the "Order" or ServiceRequest

This section shows how to create a ServiceRequest for a lab test needs that belongs to a Patient using the API. Notably, the snippet below _conditional creates_ (only if patient does not exist) and creates a service request for a lab panel.

```js
/**
 * Creates an order by creating Patient and ServiceRequest resources.
 */
async function createServiceRequest() {
  // Generate the patient URN.
  // The "urn:uuid:" prefis is special in a FHIR bundle.
  // It means "this is a local ID", so any references to the local ID will be
  // updated to the final ID once it has been assigned.
  const patientUrn = 'urn:uuid:' + randomUUID();

  // Generate an example MRN (Medical Record Number).
  // We will use this in the "conditional create".
  // When creating an order, and if you don't know if the patient exists,
  // you can use this MRN to check.
  const exampleMrn = randomUUID();

  // Make one batch to request to create both the Patient and ServiceRequest.
  // Use the "conditional create" ("ifNoneExist") feature to only create the patient if they do not exist.
  // Use the local ID feature ("urn:uuid:") to link the ServiceRequest to the Patient.
  const response = await fetch(BASE_URL + 'fhir/R4/', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/fhir+json',
    },
    body: JSON.stringify({
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        // First, create the patient if they don't exist.
        // Use the "conditional create" ("ifNoneExist") feature to only create the patient if they do not exist.
        {
          fullUrl: patientUrn,
          request: {
            method: 'POST',
            url: 'Patient',
            ifNoneExist: 'identifier=' + exampleMrn,
          },
          resource: {
            resourceType: 'Patient',
            name: [{ given: ['Batch'], family: 'Test' }],
            birthDate: '2020-01-01',
            gender: 'male',
            identifier: [
              {
                system: 'https://namespace.example.health/',
                value: exampleMrn,
              },
            ],
          },
        },
        // Next, create the service request.
        // Use the local ID feature ("urn:uuid:") to link the ServiceRequest to the Patient.
        {
          request: {
            method: 'POST',
            url: 'ServiceRequest',
          },
          resource: {
            resourceType: 'ServiceRequest',
            subject: {
              reference: patientUrn,
            },
            code: {
              coding: [
                {
                  system: 'https://samplelab.com/tests',
                  code: 'A1C_ONLY',
                },
              ],
            },
          },
        },
      ],
    }),
  });

  const data = await response.json();
  console.log(JSON.stringify(data, undefined, 2));

  // Should print "Created" or "OK"
  console.log(data.entry[0].response.outcome.issue[0].details.text);

  // Should print "Patient/{id}"
  console.log(data.entry[0].response.location);

  // Should print "Created"
  console.log(data.entry[1].response.outcome.issue[0].details.text);

  // Should print "ServiceRequest/{id}"
  console.log(data.entry[1].response.location);

  // Return the patient and service request IDs as reference strings.
  return [data.entry[0].response.location, data.entry[1].response.location];
}
```

Using this code snippet ServiceRequest was created and linked to a Patient. You should be able to see [Patient](https://app.medplum.com/Patient) created here and the [ServiceRequest](https://app.medplum.com/ServiceRequest) created here.

Because the [ServiceRequest](https://app.medplum.com/ServiceRequest) was created, the [Subscription](https://app.medplum.com/Subscription)
that was created in the previous section will trigger a web request to the provided endpoint.

## Updating the status of the ServiceRequest as it moves through the workflow

After the ServiceRequest was created, it needs to be updated continuously as it moves through a workflow. It can be hard to visualize what is happening here, but the way to think about this from a perspective of a Patient getting a lab test.

- A physician orders the test
- The specimen is collected
- The oberservation is determined by the analyzer and diagnostic report is created

Step 1 above was completed in the previous step, so the next step is to record a specimen collection and link it back to the `ServiceRequest`, and then update the ServiceRequest to indicate that the `Specimen` is available.

Step 2 can be accomplished using the below code snippet:

```js
/**
 * Creates a Specimen for a given ServiceRequest
 */
async function createSpecimenForServiceRequest(serviceRequestID) {
  // Create an identifier for the specimen
  const specimenUrn = 'urn:uuid:' + randomUUID();
  // Make one batch to request to create both the Specimen and Update the ServiceRequest
  // Use the local ID feature ("urn:uuid:") to link the ServiceRequest to the Patient.
  const response = await fetch(BASE_URL + 'fhir/R4/', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/fhir+json',
    },
    body: JSON.stringify({
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        // First, create the patient if they don't exist.
        // Use the "conditional create" ("ifNoneExist") feature to only create the patient if they do not exist.
        {
          fullUrl: specimenUrn,
          request: {
            method: 'POST',
            url: 'Specimen',
          },
          resource: {
            resourceType: 'Specimen',
            status: 'available',
            request: serviceRequestID,
            type: [
              {
                system: 'https://namespace.specimentype.health/',
                value: 'SERUM',
              },
            ],
          },
        },
        // Next, update the ServiceRequest to show that the specimen was collected.
        {
          fullUrl: serviceRequestID,
          request: {
            method: 'POST',
            url: 'ServiceRequest',
          },
          resource: {
            resourceType: 'ServiceRequest',
            orderDetail: {
              coding: [
                {
                  system: 'https://samplelab.com/status',
                  code: 'SAMPLE_COLLECTED',
                },
              ],
            },
          },
        },
      ],
    }),
  });

  const data = await response.json();
  console.log(JSON.stringify(data, undefined, 2));

  // Should print "Created" or "OK"
  console.log(data.entry[0].response.outcome.issue[0].details.text);

  // Should print "Speciment/{id}"
  console.log(data.entry[0].response.location);

  // Should print "ServiceRequest/{id}"
  console.log(data.entry[1].response.location);

  // Return the Specimen and ServiceRequest IDs as reference strings.
  return [data.entry[0].response.location, data.entry[1].response.location];
}
```

## Creating an Observation and a DiagnosticReport

Now coming back to the core workflow, now that the specimen is collected, we need to run the samples on the lab instruments and produce the results.

- A physician orders the test - COMPLETE
- The specimen is collected - COMPLETE
- The oberservation is determined by the analyzer and diagnostic report is created

Usually, this data is generated by a lab instrument or Laboratory Information System (LIS), or comes from a Laboratory provided FHIR interface. After the data is generated, it is important to update the status of the original `ServiceRequest`

```js
async function createReport(patientId, serviceRequestId) {
  const observtionUrn1 = 'urn:uuid:' + randomUUID();

  // Use the local ID feature ("urn:uuid:") to link the ServiceRequest to the Patient.
  const response = await fetch(BASE_URL + 'fhir/R4/', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/fhir+json'
    },
    body: JSON.stringify({
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        // Create the first Observation resource.
        {
          fullUrl: observtionUrn1,
          request: {
            method: 'POST',
            url: 'Observation'
          },
          resource: {
            resourceType: 'Observation',
            basedOn: [{
              reference: serviceRequestId
            }],
            subject: {
              reference: patientId
            },
            code: {
              coding: [{
                system: 'https://samplelabtests.com/tests',
                code: 'A1c',
                display: 'A1c'
              }]
            },
            valueQuantity: {
              value: 5.7,
              unit: 'mg/dL',
              system: 'http://unitsofmeasure.org',
              code: 'mg/dL'
            }
          }
        }
        // Create a DiagnosticReport resource.
        {
          request: {
            method: 'POST',
            url: 'DiagnosticReport'
          },
          resource: {
            resourceType: 'DiagnosticReport',
            basedOn: [{
              reference: serviceRequestId
            }],
            subject: {
              reference: patientId
            },
            code: {
              coding: [{
                system: 'https://samplelab.com/testpanels',
                code: 'A1C_ONLY'
              }]
            },
            result: [
              {
                reference: observtionUrn1
              }
            ]
          }
        },
        // Next, update the ServiceRequest to show that the sample was processed and the report created.
        {
          fullUrl: serviceRequestID,
          request: {
            method: 'POST',
            url: 'ServiceRequest'
          },
          resource: {
            resourceType: 'ServiceRequest',
            orderDetail: {
              coding: [{
                system: 'https://samplelab.com/status',
                code: 'LAB_PROCESSED'
              }]
            }
          }
        }
      ]
    })
  });

  const data = await response.json();

  // Return the DiagnosticReport IDs as reference strings.
  return [data.entry[2].response.location];
}
```

## In Conclusion

In this example we demonstrated the use of subscriptions and how to set them up for a simple lab workflow. FHIRPath subscriptions are very powerful and can be used to integrate systems with ease. This is similar to the workflow that large commercial labs use, and can be configured with additional features like advanced permissions (only get updates for very specific requests), multiples service types and more.
