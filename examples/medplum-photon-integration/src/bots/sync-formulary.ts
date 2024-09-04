import { BotEvent, MedplumClient, normalizeErrorString } from '@medplum/core';
import { List, MedicationKnowledge } from '@medplum/fhirtypes';
import { handlePhotonAuth } from './utils';

export async function handler(medplum: MedplumClient, event: BotEvent<List>) {
  const formulary = event.input;
  const PHOTON_CLIENT_ID = event.secrets['PHOTON_CLIENT_ID']?.valueString;
  const PHOTON_CLIENT_SECRET = event.secrets['PHOTON_CLIENT_SECRET']?.valueString;
  const PHOTON_AUTH_TOKEN = await handlePhotonAuth(PHOTON_CLIENT_ID, PHOTON_CLIENT_SECRET);

  const medications = formulary.entry;

  if (!medications || medications.length === 0) {
    throw new Error('No valid medications to sync');
  }

  const catalogId = await getCatalogId(PHOTON_AUTH_TOKEN);
  const unAddedMedications: MedicationKnowledge[] = [];

  if (!catalogId) {
    throw new Error('No catalog found in Photon Health');
  }

  for (const medication of medications) {
    const medReference = medication.item;
    const medicationKnowledge = await medplum.readReference(medReference);
    if (medicationKnowledge.resourceType !== 'MedicationKnowledge') {
      throw new Error('Invalid resource type in formulary');
    }

    const rxcui = medicationKnowledge.code?.coding?.[0].code;

    const photonMedicationId = await getPhotonMedication(PHOTON_AUTH_TOKEN, rxcui);
    if (!photonMedicationId) {
      unAddedMedications.push(medicationKnowledge);
      continue;
    }

    await syncFormulary(catalogId, photonMedicationId, PHOTON_AUTH_TOKEN);
  }

  return unAddedMedications;
}

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
  return result.data.catalogs?.[0].id;
}

async function getPhotonMedication(authToken: string, code?: string): Promise<string | undefined> {
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
  return result.data.medications?.[0].id;
}

async function photonGraphqlFetch(body: string, authToken: string): Promise<any> {
  try {
    const response = await fetch('https://api.neutron.health/graphql', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + authToken,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return result;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}
