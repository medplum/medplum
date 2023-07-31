import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

// start-block MutationCreatePatient
const patient = await medplum.graphql(`
  mutation {
    # Define the fields for the resource being created
    PatientCreate(
      res: {
        resourceType: "Patient"
        gender: "male"
        name: [
            {
                given: "Homer"
            }
          ]
         }
        )
        # Specify which of the newly created fields to return in the response
        {
          id
          gender
          name {
            given
          }
        }
    }`);
// end-block MutationCreatePatient

console.log(patient);

const response: any =
  // start-block MutationCreateResponse
  {
    data: {
      PatientCreate: {
        id: 'example-id',
        name: {
          given: 'Homer',
        },
        gender: 'male',
      },
    },
  };

// end-block MutationCreateResponse

console.log(response);

/*
// start-block MutationCreatePatientGraphQL
  mutation {
    # Define the fields for the resource being created
    PatientCreate(
      res: {
        resourceType: "Patient"
        gender: "male"
        name: [
            {
                given: "Homer"
            }
          ]
         }
        )
        # Specify which of the newly created fields to return in the response
        {
          id
          gender
          name {
            given
          }
        }
    }
// end-block MutationCreatePatientGraphQL
*/

// start-block MutationCreatePatientAliased
const patientAlias = await medplum.graphql(`
  mutation {
    # Define the fields for the resource being created, and alias as "newPatient"
    newPatient: PatientCreate(
      res: {
        resourceType: "Patient"
        gender: "male"
        name: [
            {
                given: "Homer"
            }
          ]
         }
        )
        # Specify which of the newly created fields to return in the response
        {
          id
          gender
          name {
            given
          }
        }
    }`);
// end-block MutationCreatePatientAliased

console.log(patientAlias);

const responseAliased: any =
  // start-block MutationCreateResponseAliased
  {
    data: {
      newPatient: {
        id: 'example-id',
        name: {
          given: 'Homer',
        },
        gender: 'male',
      },
    },
  };

// end-block MutationCreateResponseAliased

console.log(responseAliased);

/*
// start-block MutationCreatePatientGraphQLAliased
  mutation {
    # Define the fields for the resource being created, and alias as "newPatient"
    newPatient: PatientCreate(
      res: {
        resourceType: "Patient"
        gender: "male"
        name: [
            {
                given: "Homer"
            }
          ]
         }
        )
        # Specify which of the newly created fields to return in the response
        {
          id
          gender
          name {
            given
          }
        }
    }
// end-block MutationCreatePatientGraphQLAliased
*/

// start-block MutationCreateCommunication
const communication = await medplum.graphql(`
# Use the built-in type CommunicationPayloadCreate as a parameter
mutation CreateCommunicationWithPayload($payload: [CommunicationPayloadCreate!]!) {
  CommunicationCreate(res: {
    resourceType: "Communication",
    status: "draft",
    payload: $payload
  })
  # Specify which of the newly created fields to return in the response
  {
    id,
    resourceType,
    payload {
      contentString,
      contentAttachment {
        url
      }
    }
  }
}`);
// end-block MutationCreateCommunication

console.log(communication);

/*
// start-block MutationCreateCommunicationGraphQL
  # Use the built-in type `CommunicationPayloadCreate` as a parameter
  mutation CreateCommunicationWithPayload($payload: [CommunicationPayloadCreate!]!) {
  CommunicationCreate(res: {
    resourceType: "Communication",
    status: "draft",
    payload: $payload
  })
  # Specify which of the newly created fields to return in the response
  {
    id,
    resourceType,
    payload {
      contentString,
      contentAttachment {
        url
      }
    }
  }
}
// end-block MutationCreateCommunicationGraphQL
*/

// start-block MutationPatientUpdateTS
const update = await medplum.graphql(`
mutation {
  # Define the elements for the updated resources. Note that this will *overwrite* the entire resource.
    PatientUpdate(
      id: "example-id"
      res: {
        id: "example-id"
        resourceType: "Patient"
        gender: "male"
        name: [
          {
            given: "Bob"
          },
          {
            family: "Smith"
          }
        ]
      }
    )
    # Specify which fields to return from the updated resource
    {
      id
      gender
      name {
        given
      }
    }
  }
  `);
// end-block MutationPatientUpdateTS
console.log(update);

const updateResponse: any =
  // start-block MutationUpdateResponse
  {
    data: {
      PatientUpdate: {
        id: 'example-id',
        name: {
          given: 'Homer',
        },
        gender: 'male',
      },
    },
  };

// end-block MutationUpdateResponse

console.log(updateResponse);

/*
// start-block MutationPatientUpdateGraphQL
mutation {
  # Define the elements for the updated resources. Note that this will *overwrite* the entire resource.
    PatientUpdate(
      id: "example-id"
      res: {
        id: "example-id"
        resourceType: "Patient"
        gender: "male"
        name: [
          {
            given: "Bob"
          },
          {
            family: "Smith"
          }
        ]
      }
    )
    # Specify which fields to return from the updated resource
    {
      id
      gender
      name {
        given
      }
    }
  }
// end-block MutationPatientUpdateGraphQL
*/

// start-block MutationPatientDeleteTS
const deleteObject = await medplum.graphql(`
mutation {
    PatientDelete(
      id: "example-id"
    ) {
      id
    }
  }
  `);
// end-block MutationPatientDeleteTS
console.log(deleteObject);

/*
// start-block MutationPatientDeleteGraphQL
mutation {
    PatientDelete(
      id: "example-id"
    ) {
      id
    }
  }
// end-block MutationPatientDeleteGraphQL
*/
