import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

/* -- GetPatientByIdGraphQL -- */

/*
// start-block GetPatientByIdGraphQL
query {
  Patient(id: "example-id") {
    resourceType
    id
    name {
      text
    }
    address {
      text
    }
  }
}
// end-block GetPatientByIdGraphQL
*/
/*
// start-block GetPatientByIdCurl
curl -X POST 'https://api.medplum.com/$graphql' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer your-access-token' \
-d '{
  "query": "
    query {
      Patient(id: \"example-id\") {
        resourceType
        id
        name {
          text
        }
        address {
          text
        }
      }
    }
  "
}'
// end-block GetPatientByIdCurl
*/
// start-block GetPatientByIdTS
const patientId = 'example-id';
await medplum.graphql(`
  Patient(id: "${patientId}") {
    resourceType
    id
    name {
      text
    }
    address {
      text
    }
  }`);
// end-block GetPatientByIdTS

let response: any =
  // start-block GetPatientByIdResponse
  {
    data: {
      Patient: {
        resourceType: 'Patient',
        id: 'example-id',
        name: [
          {
            text: 'John Doe',
          },
        ],
        address: [
          {
            text: '123 Main St, Springfield',
          },
        ],
      },
    },
  };
// end-block GetPatientByIdResponse

/* --- SearchPatientsByNameAndCity -- */
/*
// start-block SearchPatientsByNameAndCityGraphQL
query {
  patients: PatientList(filter: { name: "Eve", addressCity: "Philadelphia" }) {
    resourceType
    id
    name {
      family
      given
    }
    address {
      line
      city
      state
      postalCode
    }
  }
}

// end-block SearchPatientsByNameAndCityGraphQL
*/

/*
// start-block SearchPatientsByNameAndCityCurl
curl -X POST "https://api.medplum.com/$graphql" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "
      query {
        patients: PatientList(name: \"Eve\", addressCity: \"Philadelphia\" ) {
          resourceType
          id
          name {
            family
            given
          }
          address {
            line
            city
            state
            postalCode
          }
        }
      }"
  }'
// end-block SearchPatientsByNameAndCityCurl
*/

// start-block SearchPatientsByNameAndCityTS
const name = 'Eve';
const city = 'Philadelphia';
await medplum.graphql(`
patients: PatientList(filter: { name: "${name}", addressCity: "${city}" }) {
  resourceType
  id
  name {
    family
    given
  }
  address {
    line
    city
    state
    postalCode
  }
}
`);
// end-block SearchPatientsByNameAndCityTS

response =
  // start-block SearchPatientsByNameAndCityResponse
  {
    data: {
      patients: [
        {
          resourceType: 'Patient',
          id: 'example-id-1',
          name: [
            {
              family: 'Johnson',
              given: ['Eve'],
            },
          ],
          address: [
            {
              line: ['456 Market St'],
              city: 'Philadelphia',
              state: 'PA',
              postalCode: '19104',
            },
          ],
        },
        {
          resourceType: 'Patient',
          id: 'example-id-2',
          name: [
            {
              family: 'Smith',
              given: ['Eve'],
            },
          ],
          address: [
            {
              line: ['789 Broad St'],
              city: 'Philadelphia',
              state: 'PA',
              postalCode: '19107',
            },
          ],
        },
      ],
    },
  };
// end-block SearchPatientsByNameAndCityResponse

console.log(response);

/* -- GetDiagnosticReportAndObservations -- */

/*
// start-block GetDiagnosticReportAndObservationsGraphQL
query {
  DiagnosticReport(id: "example-id") {
    resourceType
    id
    result {
      resource {
        ... on Observation {
          resourceType
          id
        }
      }
    }
  }
}
// end-block GetDiagnosticReportAndObservationsGraphQL
*/

/*
// start-block GetDiagnosticReportAndObservationsCurl
curl -X POST 'https://api.medplum.com/$graphql' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer your-access-token' \
-d '{
  "query": "
    query {
      DiagnosticReport(id: \"example-id\") {
        resourceType
        id
        result {
          resource {
            ... on Observation {
              resourceType
              id
            }
          }
        }
      }
    }
  "
}'
// end-block GetDiagnosticReportAndObservationsCurl
*/

// start-block GetDiagnosticReportAndObservationsTS
const reportId = 'example-report-1';
await medplum.graphql(`
    query {
      DiagnosticReport(id: "${reportId}") {
        resourceType
        id
        result {
          resource {
            ... on Observation {
              resourceType
              id
            }
          }
        }
      }
    }
  `);
// end-block GetDiagnosticReportAndObservationsTS

response =
  // start-block GetDiagnosticReportAndObservationsResponse

  {
    data: {
      DiagnosticReport: {
        resourceType: 'DiagnosticReport',
        id: 'example-id',
        result: [
          {
            resource: {
              resourceType: 'Observation',
              id: 'observation-id-1',
            },
          },
          {
            resource: {
              resourceType: 'Observation',
              id: 'observation-id-2',
            },
          },
        ],
      },
    },
  };
// end-block GetDiagnosticReportAndObservationsResponse

/* -- SearchEncountersByPatient -- */
/*
// start-block SearchEncountersByPatientGraphQL
query {
  EncounterList(filter: { _reference: "subject:Patient/example-id" }) {
    entries {
      resource {
        ... on Encounter {
          resourceType
          id
          subject {
            resource {
              ... on Patient {
                resourceType
                id
              }
            }
          }
        }
      }
    }
  }
}

// end-block SearchEncountersByPatientGraphQL
 */

/*
// start-block SearchEncountersByPatientCurl
curl -X POST 'https://api.medplum.com/graphql' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer your-access-token' \
-d '{
  "query": "
    query {
      EncounterList(filter: { _reference: \"subject:Patient/example-id\" }) {
        entries {
          resource {
            ... on Encounter {
              resourceType
              id
              subject {
                resource {
                  ... on Patient {
                    resourceType
                    id
                  }
                }
              }
            }
          }
        }
      }
    }
  "
}'
// end-block SearchEncountersByPatientCurl
*/

// start-block SearchEncountersByPatientTS
await medplum.graphql(`
    query {
      EncounterList(filter: { _reference: "subject:Patient/${patientId}" }) {
        entries {
          resource {
            ... on Encounter {
              resourceType
              id
              subject {
                resource {
                  ... on Patient {
                    resourceType
                    id
                  }
                }
              }
            }
          }
        }
      }
    }
  `);
// end-block SearchEncountersByPatientTS

response =
  // start-block SearchEncountersByPatientResponse
  {
    data: {
      Patient: {
        resourceType: 'Patient',
        id: 'example-id',
        encounters: {
          resource: [
            {
              resourceType: 'Encounter',
              id: 'encounter-id-1',
              subject: {
                resource: {
                  resourceType: 'Patient',
                  id: 'example-id',
                },
              },
            },
            {
              resourceType: 'Encounter',
              id: 'encounter-id-2',
              subject: {
                resource: {
                  resourceType: 'Patient',
                  id: 'example-id',
                },
              },
            },
          ],
        },
      },
    },
  };
// end-block SearchEncountersByPatientResponse
