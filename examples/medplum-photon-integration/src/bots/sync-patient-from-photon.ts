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
  MedicationDispense,
  MedicationRequest,
  Patient,
  Practitioner,
  Reference,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import {
  Fill,
  PhotonAddress,
  PhotonPatient,
  PhotonPatientAllergy,
  PhotonPrescription,
  PhotonProvider,
} from '../photon-types';
import { NEUTRON_HEALTH, NEUTRON_HEALTH_PATIENTS } from './constants';
import { getFillStatus, getMedicationElement, handlePhotonAuth, photonGraphqlFetch } from './utils';

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

    // Create any MedicationRequest and MedicationDispense entries
    const medicationHistoryEntries = await createMedicationHistoryEntries(
      patientReference,
      medplum,
      photonPatient.prescriptions
    );

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
          request: {
            method: 'PUT',
            url: `AllergyIntolerance?_source=${NEUTRON_HEALTH}&code=${allergy.code}&patient=${allergy.patient.reference}`,
          },
          resource: allergy,
        };
      });
      batch.entry?.push(...allergyEntries);
    }

    // If there are prescriptions, create entries and add them to the bundle
    if (medicationHistoryEntries) {
      batch.entry?.push(...medicationHistoryEntries);
    }
  }

  // execute the bundle
  await medplum.executeBatch(batch);
}

/**
 * Takes a Photon Patient and gets the corresponding Patient resource from your project if it exists.
 *
 * @param photonPatient - The Photon Patient being searched for
 * @param medplum - Medplum Client to search your project
 * @returns A FHIR Patient resource if it exists in your project
 */
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

/**
 * Creates a Patient resource from the details of a Photon Patient object.
 *
 * @param photonPatient - Photon Patient object used to create the Patient in your project
 * @returns A Patient resource that can be added to a bundle to be executed in a batch
 */
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

/**
 * Creates an array of AllergyIntolerance resources given a Patient's allergies from Photon.
 *
 * @param patientReference - A reference to the Patient that has the allergies
 * @param photonAllergies - The Photon PatientAllergy object used to create the AllergyIntolerance resource
 * @returns An array of AllergyIntolerance resources
 */
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
      meta: {
        source: NEUTRON_HEALTH,
      },
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

/**
 * Takes an array of Photon Prescription objects for a given patient and uses these to create the patient's medication
 * history. This creates MedicationRequest resources to represent prescriptions and MedicationDispense resources to
 * represent fills of these prescriptions. These are added to an array of Bundle entries that can be executed in a
 * batch.
 *
 * @param patientReference - A reference to the Patient the MedicationRequests and MedicationDispenses are for
 * @param medplum - Medplum Client used to get additional details from your project
 * @param photonPrescriptions - An array of Photon Prescription objects used to create the medication history
 * @returns An array of Bundle Entries containing the medication history of a patient
 */
export async function createMedicationHistoryEntries(
  patientReference: Reference<Patient>,
  medplum: MedplumClient,
  photonPrescriptions?: PhotonPrescription[]
): Promise<BundleEntry<MedicationDispense | MedicationRequest>[] | undefined> {
  if (!photonPrescriptions || photonPrescriptions.length === 0) {
    return undefined;
  }

  const entries: BundleEntry<MedicationDispense | MedicationRequest>[] = [];
  for (const photonPrescription of photonPrescriptions) {
    const prescription = await createPrescriptionResource(photonPrescription, medplum, patientReference);
    const prescriptionUrl = 'urn:uuid:' + randomUUID();
    const prescriptionReference: Reference<MedicationRequest> = {
      reference: prescriptionUrl,
      display: getDisplayString(prescription),
    };

    entries.push({
      fullUrl: prescriptionUrl,
      request: { method: 'POST', url: 'MedicationRequest' },
      resource: prescription,
    });

    if (photonPrescription.fills) {
      for (const fill of photonPrescription.fills) {
        const dispense = await createDispenseResource(fill, medplum, prescriptionReference, patientReference);
        entries.push({
          fullUrl: 'urn:uuid:' + randomUUID(),
          request: { method: 'PUT', url: `MedicationDispense?identifier=${NEUTRON_HEALTH}|${fill.id}` },
          resource: dispense,
        });
      }
    }
  }

  return entries;
}

/**
 * Takes a Photon Prescription object and uses it to create a corresponding MedicationRequest resource in FHIR. The resource is
 * not created on the server, but returned so it can be added to a batch request.
 *
 * @param photonPrescription - The Photon Prescription object with the details used in the MedicationRequest
 * @param medplum - Medplum Client to get additional details from your proeject
 * @param patientReference - A reference to the Patient the prescription is for
 * @returns A MedicationRequest resource to be created by adding to a batch request
 */
export async function createPrescriptionResource(
  photonPrescription: PhotonPrescription,
  medplum: MedplumClient,
  patientReference: Reference<Patient>
): Promise<MedicationRequest> {
  const { codes, name } = photonPrescription.treatment;
  const status = getStatusFromPhotonState(photonPrescription.state);
  const medicationElement = await getMedicationElement(medplum, codes.rxcui, name);
  const prescriber = await getPrescriber(medplum, photonPrescription.prescriber);
  const requester: Reference<Practitioner> = prescriber
    ? createReference(prescriber)
    : { display: photonPrescription.prescriber.name.full };

  const prescription: MedicationRequest = {
    resourceType: 'MedicationRequest',
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

  return prescription;
}

/**
 * Takes a Photon Fill and uses it to create a MedicationDispense resource in FHIR. The resource is not created, but
 * returned so it can be executed as part of a batch.
 *
 * @param fill - The Photon Fill resource that contains the details used to create the MedicationDispense
 * @param medplum - Medplum Client used to get the code of the medication being dispensed
 * @param authorizingPrescription - The MedicationRequest resource authorizing a dispense
 * @param patientReference - The Patient the dispense is for
 * @returns A MedicationDispense resource that is ready to be added to a bundle
 */
export async function createDispenseResource(
  fill: Fill,
  medplum: MedplumClient,
  authorizingPrescription: Reference<MedicationRequest>,
  patientReference: Reference<Patient>
): Promise<MedicationDispense> {
  const { codes, name } = fill.treatment;
  const medicationElement = await getMedicationElement(medplum, codes.rxcui, name);
  const medicationDispense: MedicationDispense = {
    resourceType: 'MedicationDispense',
    meta: {
      source: NEUTRON_HEALTH + `|${fill.id}`,
    },
    identifier: [{ system: NEUTRON_HEALTH, value: fill.id }],
    status: getFillStatus(fill.state),
    authorizingPrescription: [authorizingPrescription],
    subject: patientReference,
    medicationCodeableConcept: medicationElement,
  };
  return medicationDispense;
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
