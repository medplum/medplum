import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

/* -- GetPatientByIdGraphQL -- */

/*
// start-block GetPatientByIdGraphQL
{
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
curl -X POST 'https://api.medplum.com/fhir/R4/$graphql' \
-H 'Content-Type: application/json' \
-H "Authorization: Bearer $your_access_token" \
-d '{"query": "{ Patient(id: \"example-id\") { resourceType id name { text } address { text } } }"}'
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
{
  PatientList(name: "Eve", address_city: "Philadelphia") {
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
curl 'https://api.medplum.com/fhir/R4/$graphql' \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $your_access_token" \
  -d '{"query":"{ PatientList(name: \"Eve\", address_city: \"Philadelphia\") { resourceType id name { family given } address { line city state postalCode } } }"}'
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
  // end-block SearchPatientsByNameAndCityResponse
};

console.log(response);

/* --- DiagnosticReportWithObservations -- */
/*
// start-block DiagnosticReportWithObservationsGraphQL
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
}
// end-block DiagnosticReportWithObservationsGraphQL
*/

/*
// start-block DiagnosticReportWithObservationsCurl
curl 'https://api.medplum.com/fhir/R4/$graphql' \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $your_access_token" \
  -d '{"query":"{ DiagnosticReport(id: \"example-id-1\") { resourceType id result { resource { ... on Observation { resourceType id valueQuantity { value unit } } } } } }"}'
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
// end-block PatientWithRelatedEncountersGraphQL
*/

/*
// start-block PatientWithRelatedEncountersCurl
curl -X POST 'https://api.medplum.com/fhir/R4/$graphql' \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $your_access_token" \
  -d '{"query":"{ Patient(id: \"example-patient-id\") { resourceType id encounters: EncounterList(_reference: patient) { resourceType id } } }"}'
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
{
  # Search for a list of Patients named "Eve", living in "Philadelphia"
  PatientList(name: "Eve", address_city: "Philadelphia") {
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
    # Search for DiagnosticReports linked to each Patient
    reports: DiagnosticReportList(_reference: subject) {
      resourceType
      id
      # Resolve the Observations referenced by DiagnosticReport.result
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
curl -X POST 'https://api.medplum.com/fhir/R4/$graphql' \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $your_access_token" \
  --data-raw '{"query":"query { PatientList(name: \"Eve\", address_city: \"Philadelphia\") { resourceType id name { family given } address { line city state postalCode } DiagnosticReportList(_reference: subject) { resourceType id result { resource { ... on Observation { resourceType id valueQuantity { value unit } } } } } } }"}'
// end-block PatientsWithReportsCurl
*/

// start-block PatientsWithReportsTS
await medplum.graphql(`
{
  PatientList(name: "Eve", address_city: "Philadelphia") {
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
    PatientList: [
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

/*
 * Filter Patient.name by HumanName.use
 */

/*
// start-block FilterPatientNameByUseGraphQL
{
  PatientList {
    resourceType
    id
    name(use: "official") {
      given
      family
    }
  }
}
// end-block FilterPatientNameByUseGraphQL
*/

/*
// start-block FilterPatientNameByUseCurl
curl -X POST 'https://api.medplum.com/fhir/R4/$graphql' \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $your_access_token" \
  -d '{"query":"{ PatientList(family: \"doe\") { resourceType id name(use: \"official\") { use given family } extension(url: \"https://example.com/extension-url-2\") { value : valueString } } }"}'
// end-block FilterPatientNameByUseCurl
*/

// start-block FilterPatientNameByUseTS
await medplum.graphql(`
{
  PatientList {
    resourceType
    id
    name(use: "official") {
      given
      family
    }
  }
}
`);
// end-block FilterPatientNameByUseTS

response = {
  // start-block FilterPatientNameByUseResponse
  data: {
    PatientList: [
      {
        resourceType: 'Patient',
        id: 'patient-id-1',
        name: [
          {
            given: ['John'],
            family: 'Doe',
          },
        ],
      },
    ],
  },
  // end-block FilterPatientNameByUseResponse
};

console.log(response);

/*
 * Filter Patient.extension by Extension.url
 */

/*
// start-block FilterExtensionByUrlGraphQL
{
  PatientList {
    resourceType
    id
    extension(url: "https://example.com/123") {
      valueString
    }
  }
}
// end-block FilterExtensionByUrlGraphQL
*/

/*
// start-block FilterExtensionByUrlCurl
curl -X POST 'https://api.medplum.com/fhir/R4/$graphql' \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $your_access_token" \
  -d '{"query":"{ PatientList { resourceType id extension(url: \"https://example.com/123\") { valueString } } }"}'
// end-block FilterExtensionByUrlCurl
*/

// start-block FilterExtensionByUrlTS
await medplum.graphql(`
{
  PatientList {
    resourceType
    id
    extension(url: "https://example.com/123") {
      valueString
    }
  }
}
`);
// end-block FilterExtensionByUrlTS

response = {
  // start-block FilterExtensionByUrlResponse
  data: {
    PatientList: [
      {
        resourceType: 'Patient',
        id: 'patient-id-1',
        extension: [
          {
            valueString: 'Sample extension value',
          },
        ],
      },
    ],
  },
  // end-block FilterExtensionByUrlResponse
};

console.log(response);

/*
 * Filter Patient.name by FHIRPath expression
 */

/*
// start-block FilterExtensionByFHIRPathGraphQL
{
  PatientList {
    resourceType
    id
    name(fhirpath: "family.exists().not()") {
      use given family text
    }
  }
}
// end-block FilterExtensionByFHIRPathGraphQL
*/

// start-block FilterPatientNameByFHIRPathTS
await medplum.graphql(`{
  PatientList {
    resourceType
    id
    name(fhirpath: "family.exists().not()") {
      use given family text
    }
  }
}`);
// end-block FilterPatientNameByFHIRPathTS

response = {
  // start-block FilterPatientNameByFHIRPathResponse
  data: {
    PatientList: [
      {
        resourceType: 'Patient',
        id: 'patient-id-1',
        name: [
          {
            use: 'usual',
            given: ['Johnny'],
            family: null,
            text: null,
          },
          {
            use: 'anonymous',
            given: null,
            family: null,
            text: 'd87a7e2f264680fe',
          },
        ],
      },
    ],
  },
  // end-block FilterPatientNameByFHIRPathResponse
};

console.log(response);

/*
 * Connection API
 */

/*
// start-block ConnectionApiGraphQL
{
  PatientConnection {
    count
    edges {
      resource {
        resourceType
        id
        name { given family }
      }
    }
  }
}
// end-block ConnectionApiGraphQL
*/

/*
// start-block ConnectionApiCurl
curl -X POST 'https://api.medplum.com/fhir/R4/$graphql' \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $your_access_token" \
  -d '{"query":"{ PatientConnection count { edges { resource { resourceType id name { given family } } } } }"}'
// end-block ConnectionApiCurl
*/

// start-block ConnectionApiTS
await medplum.graphql(`
{
  PatientConnection {
    count
    edges {
      resource {
        resourceType
        id
        name { given family }
      }
    }
  }
}
`);
// end-block ConnectionApiTS

response = {
  // start-block ConnectionApiResponse
  data: {
    PatientConnection: {
      count: 2,
      edges: [
        {
          resource: {
            resourceType: 'Patient',
            id: 'example-patient-id-1',
            name: [
              {
                given: ['Bart'],
                family: 'Simpson',
              },
            ],
          },
        },
        {
          resource: {
            resourceType: 'Patient',
            id: 'example-patient-id-2',
            name: [
              {
                given: ['Homer'],
                family: 'Simpson',
              },
            ],
          },
        },
      ],
    },
  },
  // end-block ConnectionApiResponse
};

console.log(response);
