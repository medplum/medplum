// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export interface Ccda {
  id?: CcdaId[];
  realmCode: CcdaRealmCode;
  typeId: CcdaId;
  templateId: CcdaTemplateId[];
  languageCode?: CcdaCode;
  recordTarget?: CcdaRecordTarget[];
  author?: CcdaAuthor[];
  effectiveTime?: CcdaEffectiveTime[];
  custodian?: CcdaCustodian;
  informationRecipient?: CcdaInformationRecipient;
  documentationOf?: CcdaDocumentationOf;
  title?: string;
  code?: CcdaCode;
  confidentialityCode?: CcdaCode;
  component?: CcdaOuterComponent;
}

export interface CcdaRealmCode {
  '@_code': string;
}

export interface CcdaRecordTarget {
  patientRole: CcdaPatientRole;
}

export interface CcdaPatientRole {
  id?: CcdaId[];
  patient: CcdaPatient;
  addr: CcdaAddr[];
  telecom: CcdaTelecom[];
}

export interface CcdaAddr {
  '@_use'?: 'HP' | 'WP';
  '@_nullFlavor'?: 'UNK';
  streetAddressLine?: string[];
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface CcdaPatient {
  name?: CcdaName[];
  administrativeGenderCode?: CcdaCode;
  birthTime?: CcdaTimeStamp;
  raceCode?: CcdaCode[];
  'sdtc:raceCode'?: CcdaCode[];
  ethnicGroupCode?: CcdaCode[];
  languageCommunication?: CcdaLanguageCommunication[];
}

export interface CcdaTelecom {
  '@_use'?: 'HP' | 'WP' | 'MC';
  '@_value'?: string;
  '@_nullFlavor'?: 'UNK';
}

export interface CcdaName {
  '@_use'?: 'ANON' | 'C' | 'L' | 'P' | 'TEMP';
  family?: string;
  given?: string[];
  suffix?: string[];
  prefix?: string[];
}

export interface CcdaOuterComponent {
  structuredBody: CcdaStructuredBody;
}

export interface CcdaStructuredBody {
  component: CcdaInnerComponent[];
}

export interface CcdaInnerComponent {
  section: CcdaSection[];
}

export interface CcdaSection {
  '@_nullFlavor'?: 'NI';
  templateId: CcdaTemplateId[];
  code?: CcdaCode;
  title?: string;
  text?: CcdaNarrative | string;
  author?: CcdaAuthor[];
  entry?: CcdaEntry[];
}

export interface CcdaTemplateId {
  '@_root': string;
  '@_extension'?: string;
}

export interface CcdaCode<T extends string = string> {
  '@_xsi:type'?: 'CD' | 'CE';
  '@_code'?: T;
  '@_codeSystem'?: string;
  '@_codeSystemName'?: string;
  '@_displayName'?: string;
  originalText?: CcdaText;
  translation?: CcdaCode[];
  '@_nullFlavor'?: 'UNK' | 'NA';
}

export interface CcdaText {
  '@_xsi:type'?: 'ST';
  reference?: CcdaReference;
  '#text'?: string;
}

export type CcdaNarrative = Record<string, unknown>;

export interface CcdaReference {
  '@_xsi:type'?: 'ED';
  '@_value'?: string;
  reference?: CcdaReference;
}

export interface CcdaEntry {
  '@_typeCode'?: string;
  act?: CcdaAct[];
  organizer?: CcdaOrganizer[];
  observation?: CcdaObservation[];
  substanceAdministration?: CcdaSubstanceAdministration[];
  encounter?: CcdaEncounter[];
  procedure?: CcdaProcedure[];
}

export interface CcdaEncounter {
  '@_classCode': string;
  '@_moodCode': string;
  templateId: CcdaTemplateId[];
  id?: CcdaId[];
  code?: CcdaCode;
  statusCode?: CcdaCode<'active' | 'completed' | 'aborted' | 'cancelled' | 'unknown'>;
  effectiveTime?: CcdaEffectiveTime[];
  performer?: CcdaPerformer[];
  participant?: CcdaParticipant[];
  entryRelationship?: CcdaEntryRelationship[];
  text?: CcdaText;
}

export interface CcdaProcedure {
  '@_classCode': string;
  '@_moodCode': string;
  templateId: CcdaTemplateId[];
  id?: CcdaId[];
  code: CcdaCode;
  statusCode: CcdaCode<'completed' | 'aborted' | 'cancelled' | 'new' | 'unknown'>;
  effectiveTime?: CcdaEffectiveTime[];
  methodCode?: CcdaCode;
  targetSiteCode?: CcdaCode;
  text?: CcdaText;
  participant?: CcdaParticipant[];
}

export interface CcdaAct {
  '@_classCode': string;
  '@_moodCode': string;
  templateId: CcdaTemplateId[];
  id?: CcdaId[];
  code: CcdaCode;
  statusCode?: CcdaCode;
  effectiveTime?: CcdaEffectiveTime[];
  priorityCode?: CcdaCode;
  entryRelationship?: CcdaEntryRelationship[];
  author?: CcdaAuthor[];
  text?: CcdaText;
  performer?: CcdaPerformer[];
}

export interface CcdaAuthor {
  templateId: CcdaTemplateId[];
  time?: CcdaTimeStamp;
  assignedAuthor?: CcdaAssignedAuthor;
}

export interface CcdaAssignedAuthor {
  id?: CcdaId[];
  code?: CcdaCode;
  assignedPerson?: CcdaAssignedPerson;
  addr: CcdaAddr[];
  telecom: CcdaTelecom[];
  assignedAuthoringDevice?: CcdaAssignedAuthoringDevice;
  representedOrganization?: CcdaOrganization;
}

export interface CcdaAssignedPerson {
  id?: CcdaId[];
  name?: CcdaName[];
}

export interface CcdaAssignedAuthoringDevice {
  id?: CcdaId[];
  manufacturerModelName?: string;
  softwareName?: string;
}

export interface CcdaObservation {
  '@_classCode': string;
  '@_moodCode': string;
  '@_negationInd'?: string;
  templateId: CcdaTemplateId[];
  id?: CcdaId[];
  code?: CcdaCode;
  statusCode: CcdaCode;
  effectiveTime?: CcdaEffectiveTime[];
  value?: CcdaValue;
  participant?: CcdaParticipant[];
  entryRelationship?: CcdaEntryRelationship[];
  author?: CcdaAuthor[];
  text?: CcdaText;
  referenceRange?: CcdaReferenceRange[];
}

export interface CcdaReferenceRange {
  observationRange: CcdaObservationRange;
}

export interface CcdaObservationRange {
  text?: CcdaText;
  value?: CcdaValue;
}

export interface CcdaParticipant {
  '@_classCode'?: string;
  '@_typeCode'?: string;
  participantRole?: CcdaParticipantRole;
}

export interface CcdaParticipantRole {
  '@_classCode'?: string;
  '@_typeCode'?: string;
  templateId?: CcdaTemplateId[];
  id?: CcdaId[];
  code?: CcdaCode;
  addr?: CcdaAddr[];
  telecom?: CcdaTelecom[];
  playingEntity?: CcdaPlayingEntity;
  playingDevice?: CcdaPlayingDevice;
  scopingEntity?: CcdaScopingEntity;
}

export interface CcdaPlayingEntity {
  '@_classCode'?: string;
  '@_typeCode'?: string;
  code?: CcdaCode;
  name?: string[];
}

export interface CcdaPlayingDevice {
  '@_classCode'?: string;
  '@_typeCode'?: string;
  code?: CcdaCode;
  name?: string[];
}

export interface CcdaScopingEntity {
  '@_classCode'?: string;
  '@_typeCode'?: string;
  id?: CcdaId[];
  code?: CcdaCode;
  name?: string[];
}

export interface CcdaSubstanceAdministration {
  '@_classCode': string;
  '@_moodCode': string;
  '@_negationInd'?: string;
  templateId: CcdaTemplateId[];
  id?: CcdaId[];
  text?: string | CcdaText;
  statusCode?: CcdaCode<'active' | 'completed' | 'aborted' | 'cancelled' | 'nullified' | 'obsolete'>;
  effectiveTime?: CcdaEffectiveTime[];
  routeCode?: CcdaCode;
  doseQuantity?: CcdaQuantity;
  consumable?: CcdaConsumable;
  author?: CcdaAuthor[];
  entryRelationship?: CcdaEntryRelationship[];
  code?: CcdaCode;
  performer?: CcdaPerformer[];
}

export interface CcdaQuantity {
  '@_xsi:type'?: 'PQ' | 'CO';
  '@_value'?: string;
  '@_unit'?: string;
}

export type CcdaValue = CcdaCode | CcdaText | CcdaQuantity | CcdaReference;

export interface CcdaPeriod {
  '@_xsi:type'?: 'PIVL_TS';
  '@_value'?: string;
  '@_unit'?: 's' | 'min' | 'h' | 'd' | 'wk' | 'mo' | 'a';
}

export interface CcdaEvent {
  '@_code': string;
}

export interface CcdaEffectiveTime {
  '@_xsi:type'?: 'IVL_TS' | 'TS' | 'PIVL_TS';
  '@_institutionSpecified'?: string;
  '@_operator'?: string;
  '@_value'?: string;
  period?: CcdaPeriod;
  event?: CcdaEvent;
  low?: CcdaTimeStamp;
  high?: CcdaTimeStamp;
}

export interface CcdaConsumable {
  '@_typeCode'?: string;
  manufacturedProduct: CcdaManufacturedProduct[];
}

export interface CcdaManufacturedProduct {
  '@_classCode'?: string;
  templateId?: CcdaTemplateId[];
  manufacturedMaterial?: CcdaManufacturedMaterial[];
  manufacturerOrganization?: CcdaOrganization[];
  manufacturedLabeledDrug?: CcdaManufacturedLabeledDrug[];
}

export interface CcdaManufacturedMaterial {
  code: CcdaCode[];
  lotNumberText?: string[];
}

export interface CcdaId {
  '@_root'?: string;
  '@_extension'?: string;
  '@_assigningAuthorityName'?: string;
}

export interface CcdaTimeStamp {
  '@_value'?: string;
  '@_nullFlavor'?: string;
}

export interface CcdaEntryRelationship {
  '@_typeCode': string;
  '@_inversionInd'?: string;
  observation?: CcdaObservation[];
  act?: CcdaAct[];
  substanceAdministration?: CcdaSubstanceAdministration[];
}

export interface CcdaList {
  item: string[];
}

export interface CcdaManufacturedLabeledDrug {
  '@_nullFlavor': string;
}

export interface CcdaLanguageCommunication {
  languageCode?: CcdaCode;
}

export interface CcdaPerformer {
  '@_typeCode'?: string;
  assignedEntity: CcdaAssignedEntity;
  functionCode?: CcdaCode;
}

export interface CcdaAssignedEntity {
  id: CcdaId[];
  addr: CcdaAddr[];
  telecom: CcdaTelecom[];
  assignedPerson?: CcdaAssignedPerson;
  representedOrganization?: CcdaOrganization;
}

export interface CcdaOrganization {
  '@_classCode'?: string;
  id?: CcdaId[];
  name?: string[];
  telecom?: CcdaTelecom[];
  addr?: CcdaAddr[];
}

export interface CcdaOrganizer {
  '@_classCode': 'CLUSTER';
  '@_moodCode': 'EVN';
  templateId: CcdaTemplateId[];
  id: CcdaId[];
  code?: CcdaCode;
  statusCode?: CcdaCode;
  effectiveTime?: CcdaEffectiveTime[];
  component: CcdaOrganizerComponent[];
}

export interface CcdaOrganizerComponent {
  act?: CcdaAct[];
  observation?: CcdaObservation[];
}

export interface CcdaCustodian {
  assignedCustodian: CcdaAssignedCustodian;
}

export interface CcdaAssignedCustodian {
  representedCustodianOrganization: CcdaOrganization;
}

export interface CcdaInformationRecipient {
  intendedRecipient: CcdaIntendedRecipient;
}

export interface CcdaIntendedRecipient {
  informationRecipient: CcdaInformationRecipientEntry;
}

export interface CcdaInformationRecipientEntry {
  name?: CcdaName[];
}

export interface CcdaDocumentationOf {
  serviceEvent: CcdaServiceEvent;
}

export interface CcdaServiceEvent {
  '@_classCode': string;
  code?: CcdaCode;
  effectiveTime?: CcdaEffectiveTime[];
}
