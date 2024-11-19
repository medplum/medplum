import { BotEvent, MedplumClient } from '@medplum/core';
import { PhotonPatient } from '../photon-types';
import { handlePhotonAuth, photonGraphqlFetch } from './utils';

export async function handler(medplum: MedplumClient, event: BotEvent) {
  const photonClientId = event.secrets['PHOTON_CLIENT_ID']?.valueString;
  const photonClientSecret = event.secrets['PHOTON_CLIENT_SECRET']?.valueString;
  const photonAuthToken = await handlePhotonAuth(photonClientId, photonClientSecret);

  const query = `
    query patients(
      $filter: PatientFilter,
      $after: ID,
      $first: Int
    ) {
      patients (
        filter: $filter,
        after: $after,
        first: $first
      ) {
        id
        externalId
        name {
          title
          first
          last
        }
        dateOfBirth
        sex
        gender
        email
        phone
        allergies {
          allergen {
            id
            name
            rxcui
          }
          comment
          onset
        }
        medicationHistory{
          prescription {
            id
            externalId
            dispenseAsWritten
            dispenseQuantity
            dispenseUnit
            refillsAllowed
            refillsRemaining
            fillsAllowed
            fillsRemaining
            daysSupply
            instructions
            notes
            effectiveDate
            expirationDAte
            writtenAt
          }
          medication {
            id
            name
            codes {
              rxcui
              productNDC
              packageNDC
            }
          }
          comment
          active
        }
        address {
          street1
          street2
          postalCode
          country
          state
          city
        }
      }
    }
  `;

  const body = JSON.stringify({ query });

  const result = await photonGraphqlFetch(body, photonAuthToken);
  const photonPatients = result.data.patients as PhotonPatient[];

  for (const photonPatient of photonPatients) {
    // Make sure the patient does not already exist
    if (await checkForExistingPatient(photonPatient, medplum)) {
      continue;
    }

    // Create the patient resource

    // Add the patient resource to a bundle
  }

  // execute the bundle
}

async function checkForExistingPatient(photonPatient: PhotonPatient, medplum: MedplumClient): Promise<boolean> {
  if (!photonPatient.externalId) {
    return false;
  }

  const patient = await medplum.readResource('Patient', photonPatient.externalId);
  return !!patient;
}
