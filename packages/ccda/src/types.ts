// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  CdaAD,
  CdaAct,
  CdaAssignedAuthor,
  CdaAssignedCustodian,
  CdaAssignedEntity,
  CdaAuthor,
  CdaAuthoringDevice,
  CdaCD,
  CdaCS,
  CdaClinicalDocument,
  CdaComponent,
  CdaCustodian,
  CdaDevice,
  CdaDocumentationOf,
  CdaED,
  CdaEIVL_TS,
  CdaEncounter,
  CdaEntity,
  CdaEntry,
  CdaEntryRelationship,
  CdaII,
  CdaINT,
  CdaIVL_PQ,
  CdaInformationRecipient,
  CdaIntendedRecipient,
  CdaLabeledDrug,
  CdaLanguageCommunication,
  CdaManufacturedProduct,
  CdaMaterial,
  CdaObservation,
  CdaObservationRange,
  CdaObservationReferenceRange,
  CdaOrganization,
  CdaOrganizer,
  CdaOrganizerComponent,
  CdaPN,
  CdaPQ,
  CdaParticipant2,
  CdaParticipantRole,
  CdaPatient,
  CdaPatientRole,
  CdaPerformer2,
  CdaPerson,
  CdaPlayingEntity,
  CdaProcedure,
  CdaRecordTarget,
  CdaSection,
  CdaServiceEvent,
  CdaStructuredBody,
  CdaStructuredBodyComponent,
  CdaSubstanceAdministration,
  CdaTEL,
  CdaTS,
} from './cda-types';

// Names used throughout this package for types generated from the HL7 CDA logical model (cda-types.ts)
export type Ccda = CdaClinicalDocument;
export type CcdaRealmCode = CdaCS;
export type CcdaRecordTarget = CdaRecordTarget;
export type CcdaPatientRole = CdaPatientRole;
export type CcdaAddr = CdaAD;
export type CcdaPatient = CdaPatient;
export type CcdaTelecom = CdaTEL;
export type CcdaName = CdaPN;
export type CcdaOuterComponent = CdaComponent;
export type CcdaStructuredBody = CdaStructuredBody;
export type CcdaInnerComponent = CdaStructuredBodyComponent;
export type CcdaSection = CdaSection;
export type CcdaTemplateId = CdaII;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type CcdaCode<T extends string = string> = CdaCD;
export type CcdaText = CdaED;
export type CcdaNarrative = Record<string, unknown>;
export type CcdaReference = CdaTEL;
export type CcdaEntry = CdaEntry;
export type CcdaEncounter = CdaEncounter;
export type CcdaProcedure = CdaProcedure;
export type CcdaAct = CdaAct;
export type CcdaAuthor = CdaAuthor;
export type CcdaAssignedAuthor = CdaAssignedAuthor;
export type CcdaAssignedPerson = CdaPerson;
export type CcdaAssignedAuthoringDevice = CdaAuthoringDevice;
export type CcdaObservation = CdaObservation;
export type CcdaReferenceRange = CdaObservationReferenceRange;
export type CcdaObservationRange = CdaObservationRange;
export type CcdaParticipant = CdaParticipant2;
export type CcdaParticipantRole = CdaParticipantRole;
export type CcdaPlayingEntity = CdaPlayingEntity;
export type CcdaPlayingDevice = CdaDevice;
export type CcdaScopingEntity = CdaEntity;
export type CcdaSubstanceAdministration = CdaSubstanceAdministration;
export type CcdaQuantity = CdaIVL_PQ;
export type CcdaInteger = CdaINT;
export type CcdaValue = NonNullable<CdaObservation['value']>[number];
export type CcdaPeriod = CdaPQ;
export type CcdaEvent = NonNullable<CdaEIVL_TS['event']>;
export type CcdaEffectiveTime = NonNullable<CdaSubstanceAdministration['effectiveTime']>[number];
export type CcdaConsumable = NonNullable<CdaSubstanceAdministration['consumable']>;
export type CcdaManufacturedProduct = CdaManufacturedProduct;
export type CcdaManufacturedMaterial = CdaMaterial;
export type CcdaId = CdaII;
export type CcdaTimeStamp = CdaTS;
export type CcdaEntryRelationship = CdaEntryRelationship;
export type CcdaManufacturedLabeledDrug = CdaLabeledDrug;
export type CcdaLanguageCommunication = CdaLanguageCommunication;
export type CcdaPerformer = CdaPerformer2;
export type CcdaAssignedEntity = CdaAssignedEntity;
export type CcdaOrganization = CdaOrganization;
export type CcdaOrganizer = CdaOrganizer;
export type CcdaOrganizerComponent = CdaOrganizerComponent;
export type CcdaCustodian = CdaCustodian;
export type CcdaAssignedCustodian = CdaAssignedCustodian;
export type CcdaInformationRecipient = CdaInformationRecipient;
export type CcdaIntendedRecipient = CdaIntendedRecipient;
export type CcdaInformationRecipientEntry = CdaPerson;
export type CcdaDocumentationOf = CdaDocumentationOf;
export type CcdaServiceEvent = CdaServiceEvent;

// Narrative markup is not modeled by the CDA logical model
export interface CcdaList {
  item: string[];
}
