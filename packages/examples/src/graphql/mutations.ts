import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

// start-block MutationCreatePatient
const patient = await medplum.graphql(`      
  mutation {
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
        ) {
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
    id: 'example-id',
    name: {
      given: 'Homer',
    },
    gender: 'male',
  };

// end-block MutationCreateResponse

console.log(response);

/*
// start-block MutationCreatePatientGraphQL
  mutation {
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
        ) {
          id
          gender
          name {
            given
          }
        }
    }
// end-block MutationCreatePatientGraphQL
*/

// start-block MutationPatientUpdateTS
const update = await medplum.graphql(`
mutation {
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
    ) {
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
    id: 'example-id',
    name: {
      given: 'Homer',
    },
    gender: 'male',
  };

// end-block MutationUpdateResponse

console.log(updateResponse);

/*
// start-block MutationPatientUpdateGraphQL
mutation {
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
    ) {
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
