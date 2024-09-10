import { BotEvent, MedplumClient, normalizeErrorString, PatchOperation } from '@medplum/core';
import { List, ListEntry, MedicationKnowledge } from '@medplum/fhirtypes';
import { handlePhotonAuth, photonGraphqlFetch } from './utils';

export async function handler(medplum: MedplumClient, event: BotEvent<List>): Promise<MedicationKnowledge[]> {
  const formulary = event.input;
  const PHOTON_CLIENT_ID = event.secrets['PHOTON_CLIENT_ID']?.valueString;
  const PHOTON_CLIENT_SECRET = event.secrets['PHOTON_CLIENT_SECRET']?.valueString;
  const PHOTON_AUTH_TOKEN = await handlePhotonAuth(PHOTON_CLIENT_ID, PHOTON_CLIENT_SECRET);

  const medications = formulary.entry?.filter((entry) => {
    if (entry.flag) {
      return !entry.flag?.coding?.some((coding) => coding.code === 'synced');
    }
    return true;
  });

  if (!medications) {
    throw new Error('No medications to sync');
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

  await updateFormulary(medplum, formulary, unAddedMedications);
  return unAddedMedications;
}

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
      medication.flag?.coding?.includes({ system: 'https://neutron.health', code: 'synced' }) ||
      (await checkIfSkipped(medsToSkip, medication, medplum))
    ) {
      updatedEntries.push(medication);
    } else {
      medication.flag = { coding: [{ system: 'https://neutron.health', code: 'synced' }] };
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

async function checkIfSkipped(
  medsToSkip: MedicationKnowledge[],
  medicationEntry: ListEntry,
  medplum: MedplumClient
): Promise<boolean> {
  const fullMedication = (await medplum.readReference(medicationEntry.item)) as MedicationKnowledge;
  if (medsToSkip.includes(fullMedication)) {
    return true;
  } else {
    return false;
  }
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
  return result.data.catalogs?.[0]?.id;
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
  return result.data.medications?.[0]?.id;
}
