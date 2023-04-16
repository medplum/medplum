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
{
  Patient(id: "${patientId}") {
    resourceType
    id
    name {
      text
    }
    address {
      text
    }
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
  patients: PatientList(name: "Eve", address_city: "Philadelphia") {
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
      postal_code
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
        patients: PatientList(name: \"Eve\", address_city: \"Philadelphia\") {
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
            postal_code
          }
        }
      }"
  }'
// end-block SearchPatientsByNameAndCityCurl
*/

// start-block SearchPatientsByNameAndCityTS

await medplum.graphql(`
{
  patients: PatientList(name: "Eve", address_city: "Philadelphia") {
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
}`);
// end-block SearchPatientsByNameAndCityTS

response = {
  // start-block SearchPatientsByNameAndCityResponse
  data: {
    PatientList: [
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
  // end-block SearchPatientsByNameAndCityResponse
};

console.log(response);

/* -- GetDiagnosticReportAndObservations -- */

/* --- DiagnosticReportWithObservations -- */
/*
// start-block DiagnosticReportWithObservationsGraphQL
query {
  DiagnosticReport(id: "example-id-1") {
    resourceType
    id
    result {
      resource {
        ... on Observation {
          resourceType
          id
          valueQuantity {
            value
            unit
          }
        }
      }
    }
  }
}
// end-block DiagnosticReportWithObservationsGraphQL
*/

/*
// start-block DiagnosticReportWithObservationsCurl
curl -X POST "https://api.medplum.com/$graphql" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "
      query {
        DiagnosticReport(id: \"example-id-1\") {
          resourceType
          id
          result {
            resource {
              ... on Observation {
                resourceType
                id
                valueQuantity {
                  value
                  unit
                }
              }
            }
          }
        }
      }"
  }'
// end-block DiagnosticReportWithObservationsCurl
*/

// start-block DiagnosticReportWithObservationsTS
await medplum.graphql(`
{
  DiagnosticReport(id: "example-id-1") {
    resourceType
    id
    result {
      resource {
        ... on Observation {
          resourceType
          id
          valueQuantity {
            value
            unit
          }
        }
      }
    }
  }
}`);
// end-block DiagnosticReportWithObservationsTS

response = {
  // start-block DiagnosticReportWithObservationsResponse
  data: {
    DiagnosticReport: {
      resourceType: 'DiagnosticReport',
      id: 'example-id-1',
      result: [
        {
          resource: {
            resourceType: 'Observation',
            id: 'observation-id-1',
            valueQuantity: {
              value: 5.5,
              unit: 'mg/dL',
            },
          },
        },
        {
          resource: {
            resourceType: 'Observation',
            id: 'observation-id-2',
            valueQuantity: {
              value: 3.2,
              unit: 'mg/dL',
            },
          },
        },
      ],
    },
  },
  // end-block DiagnosticReportWithObservationsResponse
};

console.log(response);

/* --- PatientWithRelatedEncounters -- */

/*
// start-block PatientWithRelatedEncountersGraphQL
query {
  {
    Patient(id: "example-patient-id") {
      resourceType
      id
      encounters: EncounterList(_reference: patient) {
        resourceType
        id
      }
    }
  }
}
// end-block PatientWithRelatedEncountersGraphQL
*/

/*
// start-block PatientWithRelatedEncountersCurl
curl -X POST "https://api.medplum.com/$graphql" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "
      query {
        {
          Patient(id: "example-patient-id") {
            resourceType
            id
            encounters: EncounterList(_reference: patient) {
              resourceType
              id
            }
          }
        }
      "
  }'
// end-block PatientWithRelatedEncountersCurl
*/

// start-block PatientWithRelatedEncountersTS
await medplum.graphql(`
{
  Patient(id: "example-patient-id") {
    resourceType
    id
    encounters: EncounterList(_reference: patient) {
      resourceType
      id
    }
  }
}`);

// end-block PatientWithRelatedEncountersTS

response = {
  // start-block PatientWithRelatedEncountersResponse
  data: {
    Patient: {
      resourceType: 'Patient',
      id: 'example-patient-id',
      encounters: [
        {
          resourceType: 'Encounter',
          id: 'encounter-id-1',
        },
        {
          resourceType: 'Encounter',
          id: 'encounter-id-2',
        },
      ],
    },
  },
  // end-block PatientWithRelatedEncountersResponse
};

console.log(response);

/* --- PatientsWithReports -- */
/*
// start-block PatientsWithReportsGraphQL
query {
  // Search for a list of Patients named "Eve", living in "Philadelphia"
  patients: PatientList(name: "Eve", address_city: "Philadelphia") {
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
    // Search for DiagnosticReports linked to each Patient
    reports: DiagnosticReportList(_reference: subject) {
      resourceType
      id
      // Resolve the Observations referenced by DiagnosticReport.result
      result {
        resource {
          ... on Observation {
            resourceType
            id
            valueQuantity {
              value
              unit
            }
          }
        }
      }
    }
  }
}
// end-block PatientsWithReportsGraphQL
*/

/*
// start-block PatientsWithReportsCurl
curl -X POST "https://api.medplum.com/graphql" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "
      query {
        patients: PatientList(name: \"Eve\", address_city: \"Philadelphia\") {
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
          reports: DiagnosticReportList(_reference: subject) {
            resourceType
            id

            result {
              resource {
                ... on Observation {
                  resourceType
                  id
                  valueQuantity {
                    value
                    unit
                  }
                }
              }
            }
          }
        }
      }"
  }'
// end-block PatientsWithReportsCurl
*/

// start-block PatientsWithReportsTS
await medplum.graphql(`
{
  patients: PatientList(name: "Eve", address_city: "Philadelphia") {
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
    reports: DiagnosticReportList(_reference: subject) {
      resourceType
      id
      result {
        resource {
          ... on Observation {
            resourceType
            id
            valueQuantity {
              value
              unit
            }
          }
        }
      }
    }
  }
}
`);
// end-block PatientsWithReportsTS

response = {
  // start-block PatientsWithReportsResponse
  data: {
    patients: [
      {
        resourceType: 'Patient',
        id: 'patient-id-1',
        name: [
          {
            family: 'Smith',
            given: ['Eve'],
          },
        ],
        address: [
          {
            line: ['123 Main St'],
            city: 'Philadelphia',
            state: 'PA',
            postalCode: '19107',
          },
        ],
        reports: [
          {
            resourceType: 'DiagnosticReport',
            id: 'report-id-1',
            result: [
              {
                resource: {
                  resourceType: 'Observation',
                  id: 'observation-id-1',
                  valueQuantity: {
                    value: 5.5,
                    unit: 'mg/dL',
                  },
                },
              },
            ],
          },
        ],
      },
      {
        resourceType: 'Patient',
        id: 'patient-id-2',
        name: [
          {
            family: 'Johnson',
            given: ['Eve'],
          },
        ],
        address: [
          {
            line: ['456 Oak St'],
            city: 'Philadelphia',
            state: 'PA',
            postalCode: '19107',
          },
        ],
        reports: [
          {
            resourceType: 'DiagnosticReport',
            id: 'report-id-2',
            result: [
              {
                resource: {
                  resourceType: 'Observation',
                  id: 'observation-id-2',
                  valueQuantity: {
                    value: 6.7,
                    unit: 'mg/dL',
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  },
  // end-block PatientsWithReportsResponse
};

console.log(response);
