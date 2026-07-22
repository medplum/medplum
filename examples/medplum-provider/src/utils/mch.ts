// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { createReference, getReferenceString, isResource } from '@medplum/core';
import type { CodeableConcept, Coding, Encounter, EpisodeOfCare, Patient, Reference } from '@medplum/fhirtypes';

export const MCH_CODE_SYSTEM = 'https://www.medplum.com/fhir/CodeSystem/mch-encounter-type';
export const SNOMED_CODE_SYSTEM = 'http://snomed.info/sct';
export const HL7_ACT_CODE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';

export type MchEncounterPresetId = 'anc-initial' | 'anc-follow-up' | 'pnc' | 'well-child' | 'labor-delivery';

export interface MchEncounterPreset {
  readonly id: MchEncounterPresetId;
  readonly label: string;
  readonly encounterClass: Coding;
  readonly encounterType: CodeableConcept;
  readonly pregnancyRelated: boolean;
}

export const MCH_ENCOUNTER_PRESETS: MchEncounterPreset[] = [
  {
    id: 'anc-initial',
    label: 'ANC initial visit',
    encounterClass: { system: HL7_ACT_CODE_SYSTEM, code: 'AMB', display: 'ambulatory' },
    encounterType: {
      coding: [{ system: MCH_CODE_SYSTEM, code: 'anc-initial', display: 'Antenatal care initial visit' }],
      text: 'Antenatal care initial visit',
    },
    pregnancyRelated: true,
  },
  {
    id: 'anc-follow-up',
    label: 'ANC follow-up visit',
    encounterClass: { system: HL7_ACT_CODE_SYSTEM, code: 'AMB', display: 'ambulatory' },
    encounterType: {
      coding: [{ system: MCH_CODE_SYSTEM, code: 'anc-follow-up', display: 'Antenatal care follow-up visit' }],
      text: 'Antenatal care follow-up visit',
    },
    pregnancyRelated: true,
  },
  {
    id: 'pnc',
    label: 'PNC visit',
    encounterClass: { system: HL7_ACT_CODE_SYSTEM, code: 'AMB', display: 'ambulatory' },
    encounterType: {
      coding: [{ system: MCH_CODE_SYSTEM, code: 'pnc', display: 'Postnatal care visit' }],
      text: 'Postnatal care visit',
    },
    pregnancyRelated: true,
  },
  {
    id: 'well-child',
    label: 'Child health / immunization visit',
    encounterClass: { system: HL7_ACT_CODE_SYSTEM, code: 'AMB', display: 'ambulatory' },
    encounterType: {
      coding: [{ system: MCH_CODE_SYSTEM, code: 'well-child', display: 'Child health and immunization visit' }],
      text: 'Child health and immunization visit',
    },
    pregnancyRelated: false,
  },
  {
    id: 'labor-delivery',
    label: 'Labor & delivery encounter',
    encounterClass: { system: HL7_ACT_CODE_SYSTEM, code: 'IMP', display: 'inpatient encounter' },
    encounterType: {
      coding: [{ system: MCH_CODE_SYSTEM, code: 'labor-delivery', display: 'Labor and delivery encounter' }],
      text: 'Labor and delivery encounter',
    },
    pregnancyRelated: true,
  },
];

export const MCH_PREGNANCY_EPISODE_TYPE: CodeableConcept = {
  coding: [{ system: SNOMED_CODE_SYSTEM, code: '77386006', display: 'Pregnancy' }],
  text: 'Pregnancy',
};

export function getMchEncounterPreset(id: string | undefined): MchEncounterPreset | undefined {
  return MCH_ENCOUNTER_PRESETS.find((preset) => preset.id === id);
}

export function isMchEncounter(encounter: Encounter): boolean {
  return Boolean(encounter.type?.some((type) => type.coding?.some((coding) => coding.system === MCH_CODE_SYSTEM)));
}

export async function createOrGetActivePregnancyEpisode(
  medplum: MedplumClient,
  patient: Patient | Reference<Patient>
): Promise<WithId<EpisodeOfCare>> {
  const patientReference = getReferenceString(patient);
  const bundle = await medplum.search('EpisodeOfCare', {
    patient: patientReference,
    status: 'active',
    _sort: '-_lastUpdated',
  });
  const activePregnancyEpisode = bundle.entry
    ?.map((entry) => entry.resource)
    .find(
      (resource): resource is WithId<EpisodeOfCare> =>
        resource?.resourceType === 'EpisodeOfCare' &&
        Boolean(
          resource.type?.some((type) =>
            type.coding?.some(
              (coding) =>
                coding.system === MCH_PREGNANCY_EPISODE_TYPE.coding?.[0]?.system &&
                coding.code === MCH_PREGNANCY_EPISODE_TYPE.coding?.[0]?.code
            )
          )
        )
    );

  if (activePregnancyEpisode) {
    return activePregnancyEpisode;
  }

  return medplum.createResource<EpisodeOfCare>({
    resourceType: 'EpisodeOfCare',
    status: 'active',
    type: [MCH_PREGNANCY_EPISODE_TYPE],
    patient: isResource(patient) ? createReference(patient) : patient,
    period: { start: new Date().toISOString() },
  });
}
