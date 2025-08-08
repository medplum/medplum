// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { BotEvent, getCodeBySystem, MedplumClient, normalizeErrorString, PatchOperation } from '@medplum/core';
import { List, ListEntry, MedicationKnowledge } from '@medplum/fhirtypes';
import { NEUTRON_HEALTH, NEUTRON_HEALTH_TREATMENTS } from './constants';
import { handlePhotonAuth, photonGraphqlFetch } from './utils';

/**
 * This bot takes your formulary as an input and syncs it with your Catalog in your Photon project. It filters out all medications
 * that are already synced, then goes through the rest and adds them to your catalog in Photon if possible. Any medications that
 * were not able to be synced are added to an array that is returned to the user.
 *
 * @param medplum - Medplum Client to access your Medplum project
 * @param event - The Bot Event, a List of MedicationKnowledge resources
 * @returns An array of MedicationKnowledge resources that were not able to be synced
 */
export async function handler(medplum: MedplumClient, event: BotEvent<List>): Promise<MedicationKnowledge[]> {
  const formulary = event.input;
  // Get the Photon client ID and secret to ensure the user is authorized to read and write to the Photon API
  const photonClientId = event.secrets['PHOTON_CLIENT_ID']?.valueString;
  const photonClientSecret = event.secrets['PHOTON_CLIENT_SECRET']?.valueString;
  const photonAuthToken = await handlePhotonAuth(photonClientId, photonClientSecret);

  // Filter out already synced medications to avoid duplication
  const medications = formulary.entry?.filter((entry) => {
    if (entry.flag) {
      const synced = getCodeBySystem(entry.flag, NEUTRON_HEALTH);
      return !synced;
    }
    return true;
  });

  if (!medications || medications.length === 0) {
    throw new Error('No medications to sync');
  }

  // Get the catalog ID from Photon so your medicaitons can be added
  const catalogId = await getCatalogId(photonAuthToken);
  // This array will be used to store any medications that could not be synced
  const unaddedMedications: MedicationKnowledge[] = [];

  if (!catalogId) {
    throw new Error('No catalog found in Photon Health');
  }

  // Loop over each medication and sync it to your Photon catalog
  for (const medication of medications) {
    // Get the full MedicationKnowledge resource and validate it
    const medReference = medication.item;
    const medicationKnowledge = await medplum.readReference(medReference);
    if (medicationKnowledge.resourceType !== 'MedicationKnowledge') {
      throw new Error('Invalid resource type in formulary');
    }

    if (!medicationKnowledge.code) {
      throw new Error('Invalid MedicationKnowledge resource. No medication code provided');
    }

    // Get the medication's RXCUI code
    let medicationCode = getCodeBySystem(medicationKnowledge.code, 'http://www.nlm.nih.gov/research/umls/rxnorm');

    // If we cannot get the RXCUI, get the NDC code
    if (!medicationCode) {
      medicationCode = getCodeBySystem(medicationKnowledge.code, 'http://hl7.org/fhir/sid/ndc');
    }

    // Get the medication from photon. If it is not in Photon, store it in the unadded medications array
    const photonMedicationId = await getPhotonMedication(photonAuthToken, medicationCode);
    if (!photonMedicationId) {
      unaddedMedications.push(medicationKnowledge);
      continue;
    }

    // Update the MedicationKnowledge to include the Photon treatment ID
    await addPhotonIdToMedicationKnowledge(photonMedicationId, medicationKnowledge, medplum);

    // If the medication is in Photon, sync it by adding it to your Photon catalog.
    await syncFormulary(catalogId, photonMedicationId, photonAuthToken);
  }

  // Update the formulary in Medplum
  await updateFormulary(medplum, formulary, unaddedMedications);
  // Return any medications that were not able to be synced
  return unaddedMedications;
}

/**
 * Adds the Photon treatment ID to the MedicationKnowledge as part of the medication code. It is added to the code as the
 * MedicationKnowledge does not have an identifier field.
 *
 * @param photonMedicationId - The Treatment ID of the medication in Photon
 * @param medicationKnowledge - The MedicationKnowledge resource being updated
 * @param medplum - Medplum Client to persist changes to the server
 */
export async function addPhotonIdToMedicationKnowledge(
  photonMedicationId: string,
  medicationKnowledge: MedicationKnowledge,
  medplum: MedplumClient
): Promise<void> {
  const medicationKnowledgeId = medicationKnowledge.id as string;
  const code = medicationKnowledge.code ?? { coding: [] };
  code?.coding?.push({ system: NEUTRON_HEALTH_TREATMENTS, code: photonMedicationId });

  const ops: PatchOperation[] = [
    { op: 'test', path: '/meta/versionId', value: medicationKnowledge.meta?.versionId },
    { op: 'add', path: '/code', value: code },
  ];

  try {
    await medplum.patchResource('MedicationKnowledge', medicationKnowledgeId, ops);
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

/**
 * This function goes through your formulary and updates the entries to flag them if they were synced. It skips any entries that were not able to be synced.
 *
 * @param medplum - The Medplum Client to update the formulary in your project
 * @param formulary - The List resource representing your formulary
 * @param medsToSkip - An array of MedicationKnowledge resources that should not be updated as they were not synced
 */
async function updateFormulary(
  medplum: MedplumClient,
  formulary: List,
  medsToSkip: MedicationKnowledge[]
): Promise<void> {
  const formularyId = formulary.id as string;
  const medications = formulary.entry;
  const updatedEntries: List['entry'] = [];
  if (!medications) {
    throw new Error('No medications in formulary.');
  }
  for (const medication of medications) {
    if (
      (medication.flag && getCodeBySystem(medication.flag, NEUTRON_HEALTH) === 'synced') ||
      (await checkIfSkipped(medsToSkip, medication, medplum))
    ) {
      updatedEntries.push(medication);
    } else {
      medication.flag = { coding: [{ system: NEUTRON_HEALTH, code: 'synced' }] };
      updatedEntries.push(medication);
    }
  }

  try {
    const ops: PatchOperation[] = [{ path: '/entry', op: 'add', value: updatedEntries }];
    await medplum.patchResource('List', formularyId, ops);
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

/**
 * This function takes a list entry from your formulary and checks it against the medications that could not be synced. It returns a boolean representing whether or not the resource should be omitted from your formulary update.
 *
 * @param medsToSkip - An array of MedicationKnowledge resources that should be skipped.
 * @param medicationEntry - A List entry of a MedicationKnowledge resource that is being checked to see if it should be skipped.
 * @param medplum - The Medplum Client used to get the full resource data so the check can be completed
 * @returns A boolean indicating if the given List entry should be skipped
 */
async function checkIfSkipped(
  medsToSkip: MedicationKnowledge[],
  medicationEntry: ListEntry,
  medplum: MedplumClient
): Promise<boolean> {
  const fullMedication = (await medplum.readReference(medicationEntry.item)) as MedicationKnowledge;
  const medicationCodeableConcept = fullMedication.code;
  if (!medicationCodeableConcept) {
    throw new Error('Medication has no code');
  }
  const medicationCode = getCodeBySystem(medicationCodeableConcept, 'http://www.nlm.nih.gov/research/umls/rxnorm');
  const shouldSkip = medsToSkip.find((med) => {
    if (!med.code) {
      return false;
    }
    return getCodeBySystem(med.code, 'http://www.nlm.nih.gov/research/umls/rxnorm') === medicationCode;
  });

  return !!shouldSkip;
}

/**
 * This functiont takes a catalog and treatment ID to add a given treatment to your catalog in Photon
 *
 * @param catalogId - Your catalog's ID in Photon
 * @param treatmentId - The Photon ID of the treatment being synced
 * @param authToken - The Photon auth token allowing the bot to write to the Photon API
 */
async function syncFormulary(catalogId: string, treatmentId: string, authToken: string): Promise<void> {
  const query = `
    mutation addToCatalog(
      $catalogId: ID!,
      $treatmentId: ID!
    ) {
      addToCatalog(
        catalogId: $catalogId,
        treatmentId: $treatmentId
      ) {
        id
      }
    }
  `;

  const variables = { catalogId, treatmentId };
  const body = JSON.stringify({ query, variables });

  await photonGraphqlFetch(body, authToken);
}

/**
 * This queries for your catalog's ID in Photon
 *
 * @param authToken - Photon auth token to authorize reading from the Photon API
 * @returns The id of your Photon catalog
 */
async function getCatalogId(authToken: string): Promise<string> {
  const query = `
    query catalogs {
      catalogs {
        id
      }
    }
  `;

  const body = JSON.stringify({ query });
  const result = await photonGraphqlFetch(body, authToken);
  return result.data.catalogs?.[0]?.id;
}

/**
 * This function queries Photon for a medication given an RXCUI code.
 *
 * @param authToken - Photon auth token to authorize the bot to read from the Photon API
 * @param code - The RXCUI code of the medication you are searching for
 * @returns The Photon ID of the medication with the given RXCUI code
 */
async function getPhotonMedication(authToken: string, code?: string): Promise<string | undefined> {
  if (!code) {
    return undefined;
  }
  const query = `
    query medications(
      $filter: MedicationFilter,
      $after: ID,
      $first: Int
    ) {
      medications(
        filter: $filter,
        after: $after,
        first: $first
      ) {
        id
      }
    }
  `;

  const variables = { filter: { drug: { code } } };
  const body = JSON.stringify({ query, variables });

  const result = await photonGraphqlFetch(body, authToken);
  return result.data.medications?.[0]?.id;
}
