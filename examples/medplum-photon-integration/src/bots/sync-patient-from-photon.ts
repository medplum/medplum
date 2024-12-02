import {
  BotEvent,
  createReference,
  getDisplayString,
  MedplumClient,
  normalizeErrorString,
  RXNORM,
} from '@medplum/core';
import {
  Address,
  AllergyIntolerance,
  Bundle,
  BundleEntry,
  ContactPoint,
  MedicationRequest,
  Patient,
  Practitioner,
  Reference,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import {
  PhotonAddress,
  PhotonPatient,
  PhotonPatientAllergy,
  PhotonPrescription,
  PhotonProvider,
} from '../photon-types';
import { NEUTRON_HEALTH, NEUTRON_HEALTH_PATIENTS } from './constants';
import { getMedicationElement, handlePhotonAuth, photonGraphqlFetch } from './utils';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
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
        prescriptions {
          id
          externalId
          prescriber {
            id
            externalId
            name {
              title
              first
              last
            }
            email
            phone
            address {
              street1
              street2
              postalCode
              country
              state
              city
            }
            organizations {
              id
              name
            }
          }
          state
          treatment {
            id
            codes {
              rxcui
            }
          }
          dispenseAsWritten
          dispenseQuantity
          refillsAllowed
          refillsRemaining
          fillsAllowed
          fillsRemaining
          daysSupply
          instructions
          notes
          effectiveDate
          expirationDate
          writtenAt
          fills {
            id
            treatment {
              id
              codes {
                rxcui
              }
            }
            state
            requestedAt
            filledAt
          }
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
  const batch: Bundle = {
    resourceType: 'Bundle',
    type: 'batch',
    entry: [],
  };

  for (const photonPatient of photonPatients) {
    // Make sure the patient does not already exist
    let patient: Patient | undefined = await getExistingPatient(photonPatient, medplum);
    if (!patient) {
      // Create the patient resource
      patient = createPatientResource(photonPatient);
    }
    const patientUrl = 'urn:uuid:' + randomUUID();
    const patientReference: Reference<Patient> = { reference: patientUrl, display: getDisplayString(patient) };

    // Create any allergies the patient has
    const allergies = createAllergies(patientReference, photonPatient.allergies);

    // Create any prescriptions
    const prescriptions = await createPrescriptions(patientReference, medplum, photonPatient.prescriptions);

    // Add the patient resource to a bundle
    const patientEntry: BundleEntry = {
      fullUrl: patientUrl,
      request: { method: 'PUT', url: `Patient?identifier=${NEUTRON_HEALTH_PATIENTS}|${photonPatient.id}` },
      resource: patient,
    };
    batch.entry?.push(patientEntry);

    // If there are allergies, create entries and add them to the bundle
    if (allergies) {
      const allergyEntries: BundleEntry[] = allergies.map((allergy) => {
        return {
          fullUrl: 'urn:uuid:' + randomUUID(),
          request: { method: 'POST', url: 'AllergyIntolerance' },
          resource: allergy,
        };
      });
      batch.entry?.push(...allergyEntries);
    }

    // If there are prescriptions, create entries and add them to the bundle
    if (prescriptions) {
      const prescriptionEntries: BundleEntry[] = prescriptions.map((prescription) => {
        return {
          fullUrl: 'urn:uuid:' + randomUUID(),
          request: { method: 'POST', url: 'MedicationRequest' },
          resource: prescription,
        };
      });
      batch.entry?.push(...prescriptionEntries);
    }
  }

  // execute the bundle
  await medplum.executeBatch(batch);
}

export async function getExistingPatient(
  photonPatient: PhotonPatient,
  medplum: MedplumClient
): Promise<Patient | undefined> {
  let patient: Patient | undefined;
  try {
    patient = await medplum.searchOne('Patient', {
      identifier: NEUTRON_HEALTH_PATIENTS + '|' + photonPatient.id,
    });
    if (patient) {
      return patient;
    }
  } catch (err) {
    console.error(`Error for Patient ID ${photonPatient.id}:`, normalizeErrorString(err));
  }

  if (photonPatient.externalId) {
    try {
      patient = await medplum.readResource('Patient', photonPatient.externalId);
      if (patient) {
        return patient;
      }
    } catch (err) {
      console.error(`Error for Patient ID ${photonPatient.id}:`, normalizeErrorString(err));
    }
  }

  return undefined;
}

export function createPatientResource(photonPatient: PhotonPatient): Patient {
  const telecom: ContactPoint[] = [{ system: 'phone', value: photonPatient.phone }];
  if (photonPatient.email) {
    telecom.push({ system: 'email', value: photonPatient.email });
  }

  const patient: Patient = {
    resourceType: 'Patient',
    identifier: [{ system: NEUTRON_HEALTH_PATIENTS, value: photonPatient.id }],
    name: [{ family: photonPatient.name.last, given: [photonPatient.name.first] }],
    gender: photonPatient.sex.toLowerCase() as Patient['gender'],
    birthDate: photonPatient.dateOfBirth,
    telecom,
  };

  const address = photonPatient.address && formatAddress(photonPatient.address);

  if (address) {
    patient.address = address;
  }

  return patient;
}

export function createAllergies(
  patientReference: Reference<Patient>,
  photonAllergies?: PhotonPatientAllergy[]
): AllergyIntolerance[] | undefined {
  if (!photonAllergies || photonAllergies.length === 0) {
    return undefined;
  }
  const allergies: AllergyIntolerance[] = [];
  for (const photonAllergy of photonAllergies) {
    const { allergen, comment, onset } = photonAllergy;
    if (!allergen.rxcui) {
      continue;
    }

    const allergy: AllergyIntolerance = {
      resourceType: 'AllergyIntolerance',
      patient: patientReference,
      code: { coding: [{ system: RXNORM, code: allergen.rxcui, display: allergen.name }] },
      onsetDateTime: onset,
    };

    if (comment) {
      allergy.note = [{ text: comment }];
    }
    allergies.push(allergy);
  }

  return allergies;
}

export async function createPrescriptions(
  patientReference: Reference<Patient>,
  medplum: MedplumClient,
  photonPrescriptions?: PhotonPrescription[]
): Promise<MedicationRequest[] | undefined> {
  if (!photonPrescriptions || photonPrescriptions.length === 0) {
    return undefined;
  }

  const prescriptions: MedicationRequest[] = [];
  for (const photonPrescription of photonPrescriptions) {
    if (await checkForExistingPrescription(medplum, photonPrescription)) {
      continue;
    }

    const { codes, name } = photonPrescription.treatment;
    const status = getStatusFromPhotonState(photonPrescription.state);
    const medicationElement = await getMedicationElement(medplum, codes.rxcui, name);
    const prescriber = await getPrescriber(medplum, photonPrescription.prescriber);
    const requester: Reference<Practitioner> = prescriber
      ? createReference(prescriber)
      : { display: photonPrescription.prescriber.name.full };

    const prescription: MedicationRequest = {
      resourceType: 'MedicationRequest',
      meta: {
        source: NEUTRON_HEALTH + `|${photonPrescription.id}`,
      },
      status,
      intent: 'order',
      subject: patientReference,
      identifier: [{ system: NEUTRON_HEALTH, value: photonPrescription.id }],
      dispenseRequest: {
        quantity: {
          value: photonPrescription.dispenseQuantity,
          unit: photonPrescription.dispenseUnit,
        },
        numberOfRepeatsAllowed: photonPrescription.refillsAllowed,
        expectedSupplyDuration: { value: photonPrescription.daysSupply, unit: 'days' },
        validityPeriod: {
          start: photonPrescription.effectiveDate,
          end: photonPrescription.expirationDate,
        },
      },
      substitution: { allowedBoolean: !photonPrescription.dispenseAsWritten },
      dosageInstruction: [{ patientInstruction: photonPrescription.instructions }],
      authoredOn: photonPrescription.writtenAt,
      medicationCodeableConcept: medicationElement,
      requester,
    };

    if (photonPrescription.notes) {
      prescription.note = [{ text: photonPrescription.notes }];
    }

    prescriptions.push(prescription);
  }
  return prescriptions;
}

async function checkForExistingPrescription(
  medplum: MedplumClient,
  photonPrescription: PhotonPrescription
): Promise<boolean> {
  let prescription: MedicationRequest | undefined;
  if (photonPrescription.externalId) {
    prescription = await medplum.readResource('MedicationRequest', photonPrescription.externalId);
    if (prescription) {
      return true;
    }
  }

  prescription = await medplum.searchOne('MedicationRequest', {
    identifier: NEUTRON_HEALTH + `|${photonPrescription.id}`,
  });

  return !!prescription;
}

export async function getPrescriber(
  medplum: MedplumClient,
  photonProvider: PhotonProvider
): Promise<Practitioner | undefined> {
  const prescriberPhotonId = photonProvider.id;
  const prescriberMedplumId = photonProvider.externalId;

  if (prescriberMedplumId) {
    return medplum.readResource('Practitioner', prescriberMedplumId);
  }

  const trackedPractitioner = await medplum.searchOne('Practitioner', {
    identifier: NEUTRON_HEALTH + `|${prescriberPhotonId}`,
  });

  if (trackedPractitioner) {
    return trackedPractitioner;
  } else {
    return undefined;
  }
}

export function getStatusFromPhotonState(
  photonPrescriptionState: PhotonPrescription['state']
): MedicationRequest['status'] {
  switch (photonPrescriptionState) {
    case 'ACTIVE':
      return 'active';
    case 'CANCELED':
      return 'cancelled';
    case 'DEPLETED':
      return 'completed';
    case 'EXPIRED':
      return 'stopped';
    default:
      throw new Error('Invalid state provided');
  }
}

function formatAddress(photonAddress: PhotonAddress): Address[] {
  const { street1, street2, city, state, postalCode, country } = photonAddress;
  const line: Address['line'] = [street1];
  if (street2) {
    line.push(street2);
  }

  const address: Address = {
    line,
    city,
    state,
    postalCode,
    country,
  };

  return [address];
}
