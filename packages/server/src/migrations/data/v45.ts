// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
import type { Job } from 'bullmq';
import type { PoolClient } from 'pg';
import { globalLogger } from '../../logger';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import { moveToDelayedAndThrow, queueRegistry } from '../../workers/utils';
import * as fns from '../migrate-functions';
import type { MigrationActionResult } from '../types';
import type { CustomPostDeployMigration, CustomPostDeployMigrationJobData } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) => runCustomMigration(repo, job, jobData, callback),
};

/**
 * Job data for this migration. The backfill is self-resuming without it -- the qualifying
 * predicate is indexed, so an interrupted run finds exactly the remaining work -- but recording
 * the table in flight lets a graceful shutdown pick up where it left off instead of re-checking
 * every table.
 */
interface ProjectIdBackfillJobData extends CustomPostDeployMigrationJobData {
  readonly resumeFromResourceType?: string;
}

interface ReferenceTableDefinition {
  readonly resourceType: string;
  readonly indexName: string;
  readonly createIndexSql: string;
}

// prettier-ignore
const REFERENCE_TABLES: ReferenceTableDefinition[] = [
  { resourceType: 'Account', indexName: 'Account_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Account_Refs_projectId_code_targetId_idx" ON "Account_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ActivityDefinition', indexName: 'ActivityDefinition_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ActivityDefinition_Refs_projectId_code_targetId_idx" ON "ActivityDefinition_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'AdverseEvent', indexName: 'AdverseEvent_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "AdverseEvent_Refs_projectId_code_targetId_idx" ON "AdverseEvent_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'AllergyIntolerance', indexName: 'AllergyIntolerance_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "AllergyIntolerance_Refs_projectId_code_targetId_idx" ON "AllergyIntolerance_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Appointment', indexName: 'Appointment_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Appointment_Refs_projectId_code_targetId_idx" ON "Appointment_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'AppointmentResponse', indexName: 'AppointmentResponse_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "AppointmentResponse_Refs_projectId_code_targetId_idx" ON "AppointmentResponse_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'AuditEvent', indexName: 'AuditEvent_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "AuditEvent_Refs_projectId_code_targetId_idx" ON "AuditEvent_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Basic', indexName: 'Basic_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Basic_Refs_projectId_code_targetId_idx" ON "Basic_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Binary', indexName: 'Binary_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Binary_Refs_projectId_code_targetId_idx" ON "Binary_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'BiologicallyDerivedProduct', indexName: 'BiologicallyDerivedProduct_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "BiologicallyDerivedProduct_Refs_projectId_code_targetId_idx" ON "BiologicallyDerivedProduct_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'BodyStructure', indexName: 'BodyStructure_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "BodyStructure_Refs_projectId_code_targetId_idx" ON "BodyStructure_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Bundle', indexName: 'Bundle_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Bundle_Refs_projectId_code_targetId_idx" ON "Bundle_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'CapabilityStatement', indexName: 'CapabilityStatement_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "CapabilityStatement_Refs_projectId_code_targetId_idx" ON "CapabilityStatement_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'CarePlan', indexName: 'CarePlan_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "CarePlan_Refs_projectId_code_targetId_idx" ON "CarePlan_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'CareTeam', indexName: 'CareTeam_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "CareTeam_Refs_projectId_code_targetId_idx" ON "CareTeam_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'CatalogEntry', indexName: 'CatalogEntry_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "CatalogEntry_Refs_projectId_code_targetId_idx" ON "CatalogEntry_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ChargeItem', indexName: 'ChargeItem_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ChargeItem_Refs_projectId_code_targetId_idx" ON "ChargeItem_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ChargeItemDefinition', indexName: 'ChargeItemDefinition_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ChargeItemDefinition_Refs_projectId_code_targetId_idx" ON "ChargeItemDefinition_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Claim', indexName: 'Claim_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Claim_Refs_projectId_code_targetId_idx" ON "Claim_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ClaimResponse', indexName: 'ClaimResponse_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ClaimResponse_Refs_projectId_code_targetId_idx" ON "ClaimResponse_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ClinicalImpression', indexName: 'ClinicalImpression_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ClinicalImpression_Refs_projectId_code_targetId_idx" ON "ClinicalImpression_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'CodeSystem', indexName: 'CodeSystem_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "CodeSystem_Refs_projectId_code_targetId_idx" ON "CodeSystem_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Communication', indexName: 'Communication_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Communication_Refs_projectId_code_targetId_idx" ON "Communication_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'CommunicationRequest', indexName: 'CommunicationRequest_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "CommunicationRequest_Refs_projectId_code_targetId_idx" ON "CommunicationRequest_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'CompartmentDefinition', indexName: 'CompartmentDefinition_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "CompartmentDefinition_Refs_projectId_code_targetId_idx" ON "CompartmentDefinition_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Composition', indexName: 'Composition_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Composition_Refs_projectId_code_targetId_idx" ON "Composition_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ConceptMap', indexName: 'ConceptMap_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ConceptMap_Refs_projectId_code_targetId_idx" ON "ConceptMap_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Condition', indexName: 'Condition_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Condition_Refs_projectId_code_targetId_idx" ON "Condition_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Consent', indexName: 'Consent_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Consent_Refs_projectId_code_targetId_idx" ON "Consent_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Contract', indexName: 'Contract_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Contract_Refs_projectId_code_targetId_idx" ON "Contract_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Coverage', indexName: 'Coverage_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Coverage_Refs_projectId_code_targetId_idx" ON "Coverage_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'CoverageEligibilityRequest', indexName: 'CoverageEligibilityRequest_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "CoverageEligibilityRequest_Refs_projectId_code_targetId_idx" ON "CoverageEligibilityRequest_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'CoverageEligibilityResponse', indexName: 'CoverageEligibilityResponse_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "CoverageEligibilityResponse_Refs_projectId_code_targetId_idx" ON "CoverageEligibilityResponse_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'DetectedIssue', indexName: 'DetectedIssue_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "DetectedIssue_Refs_projectId_code_targetId_idx" ON "DetectedIssue_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Device', indexName: 'Device_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Device_Refs_projectId_code_targetId_idx" ON "Device_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'DeviceDefinition', indexName: 'DeviceDefinition_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "DeviceDefinition_Refs_projectId_code_targetId_idx" ON "DeviceDefinition_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'DeviceMetric', indexName: 'DeviceMetric_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "DeviceMetric_Refs_projectId_code_targetId_idx" ON "DeviceMetric_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'DeviceRequest', indexName: 'DeviceRequest_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "DeviceRequest_Refs_projectId_code_targetId_idx" ON "DeviceRequest_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'DeviceUseStatement', indexName: 'DeviceUseStatement_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "DeviceUseStatement_Refs_projectId_code_targetId_idx" ON "DeviceUseStatement_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'DiagnosticReport', indexName: 'DiagnosticReport_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "DiagnosticReport_Refs_projectId_code_targetId_idx" ON "DiagnosticReport_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'DocumentManifest', indexName: 'DocumentManifest_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "DocumentManifest_Refs_projectId_code_targetId_idx" ON "DocumentManifest_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'DocumentReference', indexName: 'DocumentReference_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "DocumentReference_Refs_projectId_code_targetId_idx" ON "DocumentReference_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'EffectEvidenceSynthesis', indexName: 'EffectEvidenceSynthesis_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "EffectEvidenceSynthesis_Refs_projectId_code_targetId_idx" ON "EffectEvidenceSynthesis_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Encounter', indexName: 'Encounter_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Encounter_Refs_projectId_code_targetId_idx" ON "Encounter_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Endpoint', indexName: 'Endpoint_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Endpoint_Refs_projectId_code_targetId_idx" ON "Endpoint_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'EnrollmentRequest', indexName: 'EnrollmentRequest_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "EnrollmentRequest_Refs_projectId_code_targetId_idx" ON "EnrollmentRequest_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'EnrollmentResponse', indexName: 'EnrollmentResponse_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "EnrollmentResponse_Refs_projectId_code_targetId_idx" ON "EnrollmentResponse_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'EpisodeOfCare', indexName: 'EpisodeOfCare_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "EpisodeOfCare_Refs_projectId_code_targetId_idx" ON "EpisodeOfCare_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'EventDefinition', indexName: 'EventDefinition_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "EventDefinition_Refs_projectId_code_targetId_idx" ON "EventDefinition_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Evidence', indexName: 'Evidence_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Evidence_Refs_projectId_code_targetId_idx" ON "Evidence_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'EvidenceVariable', indexName: 'EvidenceVariable_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "EvidenceVariable_Refs_projectId_code_targetId_idx" ON "EvidenceVariable_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ExampleScenario', indexName: 'ExampleScenario_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ExampleScenario_Refs_projectId_code_targetId_idx" ON "ExampleScenario_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ExplanationOfBenefit', indexName: 'ExplanationOfBenefit_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ExplanationOfBenefit_Refs_projectId_code_targetId_idx" ON "ExplanationOfBenefit_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'FamilyMemberHistory', indexName: 'FamilyMemberHistory_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "FamilyMemberHistory_Refs_projectId_code_targetId_idx" ON "FamilyMemberHistory_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Flag', indexName: 'Flag_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Flag_Refs_projectId_code_targetId_idx" ON "Flag_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Goal', indexName: 'Goal_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Goal_Refs_projectId_code_targetId_idx" ON "Goal_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'GraphDefinition', indexName: 'GraphDefinition_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "GraphDefinition_Refs_projectId_code_targetId_idx" ON "GraphDefinition_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Group', indexName: 'Group_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Group_Refs_projectId_code_targetId_idx" ON "Group_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'GuidanceResponse', indexName: 'GuidanceResponse_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "GuidanceResponse_Refs_projectId_code_targetId_idx" ON "GuidanceResponse_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'HealthcareService', indexName: 'HealthcareService_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HealthcareService_Refs_projectId_code_targetId_idx" ON "HealthcareService_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ImagingStudy', indexName: 'ImagingStudy_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImagingStudy_Refs_projectId_code_targetId_idx" ON "ImagingStudy_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Immunization', indexName: 'Immunization_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Immunization_Refs_projectId_code_targetId_idx" ON "Immunization_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ImmunizationEvaluation', indexName: 'ImmunizationEvaluation_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImmunizationEvaluation_Refs_projectId_code_targetId_idx" ON "ImmunizationEvaluation_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ImmunizationRecommendation', indexName: 'ImmunizationRecommendation_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImmunizationRecommendation_Refs_projectId_code_targetId_idx" ON "ImmunizationRecommendation_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ImplementationGuide', indexName: 'ImplementationGuide_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImplementationGuide_Refs_projectId_code_targetId_idx" ON "ImplementationGuide_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'InsurancePlan', indexName: 'InsurancePlan_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "InsurancePlan_Refs_projectId_code_targetId_idx" ON "InsurancePlan_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Invoice', indexName: 'Invoice_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_Refs_projectId_code_targetId_idx" ON "Invoice_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Library', indexName: 'Library_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Library_Refs_projectId_code_targetId_idx" ON "Library_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Linkage', indexName: 'Linkage_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Linkage_Refs_projectId_code_targetId_idx" ON "Linkage_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'List', indexName: 'List_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "List_Refs_projectId_code_targetId_idx" ON "List_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Location', indexName: 'Location_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Location_Refs_projectId_code_targetId_idx" ON "Location_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Measure', indexName: 'Measure_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Measure_Refs_projectId_code_targetId_idx" ON "Measure_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'MeasureReport', indexName: 'MeasureReport_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "MeasureReport_Refs_projectId_code_targetId_idx" ON "MeasureReport_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Media', indexName: 'Media_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Media_Refs_projectId_code_targetId_idx" ON "Media_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Medication', indexName: 'Medication_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Medication_Refs_projectId_code_targetId_idx" ON "Medication_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'MedicationAdministration', indexName: 'MedicationAdministration_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicationAdministration_Refs_projectId_code_targetId_idx" ON "MedicationAdministration_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'MedicationDispense', indexName: 'MedicationDispense_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicationDispense_Refs_projectId_code_targetId_idx" ON "MedicationDispense_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'MedicationKnowledge', indexName: 'MedicationKnowledge_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicationKnowledge_Refs_projectId_code_targetId_idx" ON "MedicationKnowledge_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'MedicationRequest', indexName: 'MedicationRequest_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicationRequest_Refs_projectId_code_targetId_idx" ON "MedicationRequest_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'MedicationStatement', indexName: 'MedicationStatement_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicationStatement_Refs_projectId_code_targetId_idx" ON "MedicationStatement_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'MedicinalProduct', indexName: 'MedicinalProduct_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicinalProduct_Refs_projectId_code_targetId_idx" ON "MedicinalProduct_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'MedicinalProductAuthorization', indexName: 'MPA_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "MPA_Refs_projectId_code_targetId_idx" ON "MedicinalProductAuthorization_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'MedicinalProductContraindication', indexName: 'MPC_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "MPC_Refs_projectId_code_targetId_idx" ON "MedicinalProductContraindication_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'MedicinalProductIndication', indexName: 'MedicinalProductIndication_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicinalProductIndication_Refs_projectId_code_targetId_idx" ON "MedicinalProductIndication_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'MedicinalProductIngredient', indexName: 'MedicinalProductIngredient_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicinalProductIngredient_Refs_projectId_code_targetId_idx" ON "MedicinalProductIngredient_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'MedicinalProductInteraction', indexName: 'MedicinalProductInteraction_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicinalProductInteraction_Refs_projectId_code_targetId_idx" ON "MedicinalProductInteraction_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'MedicinalProductManufactured', indexName: 'MedicinalProductManufactured_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicinalProductManufactured_Refs_projectId_code_targetId_idx" ON "MedicinalProductManufactured_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'MedicinalProductPackaged', indexName: 'MedicinalProductPackaged_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicinalProductPackaged_Refs_projectId_code_targetId_idx" ON "MedicinalProductPackaged_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'MedicinalProductPharmaceutical', indexName: 'MPP_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "MPP_Refs_projectId_code_targetId_idx" ON "MedicinalProductPharmaceutical_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'MedicinalProductUndesirableEffect', indexName: 'MPUE_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "MPUE_Refs_projectId_code_targetId_idx" ON "MedicinalProductUndesirableEffect_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'MessageDefinition', indexName: 'MessageDefinition_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "MessageDefinition_Refs_projectId_code_targetId_idx" ON "MessageDefinition_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'MessageHeader', indexName: 'MessageHeader_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "MessageHeader_Refs_projectId_code_targetId_idx" ON "MessageHeader_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'MolecularSequence', indexName: 'MolecularSequence_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "MolecularSequence_Refs_projectId_code_targetId_idx" ON "MolecularSequence_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'NamingSystem', indexName: 'NamingSystem_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "NamingSystem_Refs_projectId_code_targetId_idx" ON "NamingSystem_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'NutritionOrder', indexName: 'NutritionOrder_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "NutritionOrder_Refs_projectId_code_targetId_idx" ON "NutritionOrder_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Observation', indexName: 'Observation_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Observation_Refs_projectId_code_targetId_idx" ON "Observation_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ObservationDefinition', indexName: 'ObservationDefinition_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ObservationDefinition_Refs_projectId_code_targetId_idx" ON "ObservationDefinition_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'OperationDefinition', indexName: 'OperationDefinition_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "OperationDefinition_Refs_projectId_code_targetId_idx" ON "OperationDefinition_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'OperationOutcome', indexName: 'OperationOutcome_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "OperationOutcome_Refs_projectId_code_targetId_idx" ON "OperationOutcome_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Organization', indexName: 'Organization_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Organization_Refs_projectId_code_targetId_idx" ON "Organization_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'OrganizationAffiliation', indexName: 'OrganizationAffiliation_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "OrganizationAffiliation_Refs_projectId_code_targetId_idx" ON "OrganizationAffiliation_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Parameters', indexName: 'Parameters_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Parameters_Refs_projectId_code_targetId_idx" ON "Parameters_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Patient', indexName: 'Patient_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Patient_Refs_projectId_code_targetId_idx" ON "Patient_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'PaymentNotice', indexName: 'PaymentNotice_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "PaymentNotice_Refs_projectId_code_targetId_idx" ON "PaymentNotice_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'PaymentReconciliation', indexName: 'PaymentReconciliation_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "PaymentReconciliation_Refs_projectId_code_targetId_idx" ON "PaymentReconciliation_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Person', indexName: 'Person_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Person_Refs_projectId_code_targetId_idx" ON "Person_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'PlanDefinition', indexName: 'PlanDefinition_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "PlanDefinition_Refs_projectId_code_targetId_idx" ON "PlanDefinition_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Practitioner', indexName: 'Practitioner_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Practitioner_Refs_projectId_code_targetId_idx" ON "Practitioner_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'PractitionerRole', indexName: 'PractitionerRole_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "PractitionerRole_Refs_projectId_code_targetId_idx" ON "PractitionerRole_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Procedure', indexName: 'Procedure_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Procedure_Refs_projectId_code_targetId_idx" ON "Procedure_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Provenance', indexName: 'Provenance_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Provenance_Refs_projectId_code_targetId_idx" ON "Provenance_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Questionnaire', indexName: 'Questionnaire_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Questionnaire_Refs_projectId_code_targetId_idx" ON "Questionnaire_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'QuestionnaireResponse', indexName: 'QuestionnaireResponse_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "QuestionnaireResponse_Refs_projectId_code_targetId_idx" ON "QuestionnaireResponse_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'RelatedPerson', indexName: 'RelatedPerson_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "RelatedPerson_Refs_projectId_code_targetId_idx" ON "RelatedPerson_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'RequestGroup', indexName: 'RequestGroup_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "RequestGroup_Refs_projectId_code_targetId_idx" ON "RequestGroup_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ResearchDefinition', indexName: 'ResearchDefinition_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ResearchDefinition_Refs_projectId_code_targetId_idx" ON "ResearchDefinition_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ResearchElementDefinition', indexName: 'ResearchElementDefinition_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ResearchElementDefinition_Refs_projectId_code_targetId_idx" ON "ResearchElementDefinition_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ResearchStudy', indexName: 'ResearchStudy_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ResearchStudy_Refs_projectId_code_targetId_idx" ON "ResearchStudy_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ResearchSubject', indexName: 'ResearchSubject_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ResearchSubject_Refs_projectId_code_targetId_idx" ON "ResearchSubject_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'RiskAssessment', indexName: 'RiskAssessment_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "RiskAssessment_Refs_projectId_code_targetId_idx" ON "RiskAssessment_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'RiskEvidenceSynthesis', indexName: 'RiskEvidenceSynthesis_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "RiskEvidenceSynthesis_Refs_projectId_code_targetId_idx" ON "RiskEvidenceSynthesis_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Schedule', indexName: 'Schedule_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Schedule_Refs_projectId_code_targetId_idx" ON "Schedule_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'SearchParameter', indexName: 'SearchParameter_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "SearchParameter_Refs_projectId_code_targetId_idx" ON "SearchParameter_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ServiceRequest', indexName: 'ServiceRequest_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ServiceRequest_Refs_projectId_code_targetId_idx" ON "ServiceRequest_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Slot', indexName: 'Slot_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Slot_Refs_projectId_code_targetId_idx" ON "Slot_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Specimen', indexName: 'Specimen_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Specimen_Refs_projectId_code_targetId_idx" ON "Specimen_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'SpecimenDefinition', indexName: 'SpecimenDefinition_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "SpecimenDefinition_Refs_projectId_code_targetId_idx" ON "SpecimenDefinition_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'StructureDefinition', indexName: 'StructureDefinition_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "StructureDefinition_Refs_projectId_code_targetId_idx" ON "StructureDefinition_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'StructureMap', indexName: 'StructureMap_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "StructureMap_Refs_projectId_code_targetId_idx" ON "StructureMap_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Subscription', indexName: 'Subscription_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Subscription_Refs_projectId_code_targetId_idx" ON "Subscription_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'SubscriptionStatus', indexName: 'SubscriptionStatus_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubscriptionStatus_Refs_projectId_code_targetId_idx" ON "SubscriptionStatus_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Substance', indexName: 'Substance_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Substance_Refs_projectId_code_targetId_idx" ON "Substance_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'SubstanceNucleicAcid', indexName: 'SubstanceNucleicAcid_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubstanceNucleicAcid_Refs_projectId_code_targetId_idx" ON "SubstanceNucleicAcid_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'SubstancePolymer', indexName: 'SubstancePolymer_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubstancePolymer_Refs_projectId_code_targetId_idx" ON "SubstancePolymer_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'SubstanceProtein', indexName: 'SubstanceProtein_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubstanceProtein_Refs_projectId_code_targetId_idx" ON "SubstanceProtein_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'SubstanceReferenceInformation', indexName: 'SubstanceReferenceInformation_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubstanceReferenceInformation_Refs_projectId_code_targetId_idx" ON "SubstanceReferenceInformation_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'SubstanceSourceMaterial', indexName: 'SubstanceSourceMaterial_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubstanceSourceMaterial_Refs_projectId_code_targetId_idx" ON "SubstanceSourceMaterial_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'SubstanceSpecification', indexName: 'SubstanceSpecification_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubstanceSpecification_Refs_projectId_code_targetId_idx" ON "SubstanceSpecification_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'SupplyDelivery', indexName: 'SupplyDelivery_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "SupplyDelivery_Refs_projectId_code_targetId_idx" ON "SupplyDelivery_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'SupplyRequest', indexName: 'SupplyRequest_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "SupplyRequest_Refs_projectId_code_targetId_idx" ON "SupplyRequest_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Task', indexName: 'Task_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_Refs_projectId_code_targetId_idx" ON "Task_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'TerminologyCapabilities', indexName: 'TerminologyCapabilities_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "TerminologyCapabilities_Refs_projectId_code_targetId_idx" ON "TerminologyCapabilities_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'TestReport', indexName: 'TestReport_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "TestReport_Refs_projectId_code_targetId_idx" ON "TestReport_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'TestScript', indexName: 'TestScript_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "TestScript_Refs_projectId_code_targetId_idx" ON "TestScript_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ValueSet', indexName: 'ValueSet_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ValueSet_Refs_projectId_code_targetId_idx" ON "ValueSet_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'VerificationResult', indexName: 'VerificationResult_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "VerificationResult_Refs_projectId_code_targetId_idx" ON "VerificationResult_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'VisionPrescription', indexName: 'VisionPrescription_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "VisionPrescription_Refs_projectId_code_targetId_idx" ON "VisionPrescription_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Enterprise', indexName: 'Enterprise_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Enterprise_Refs_projectId_code_targetId_idx" ON "Enterprise_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Project', indexName: 'Project_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Project_Refs_projectId_code_targetId_idx" ON "Project_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ClientApplication', indexName: 'ClientApplication_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ClientApplication_Refs_projectId_code_targetId_idx" ON "ClientApplication_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'User', indexName: 'User_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_Refs_projectId_code_targetId_idx" ON "User_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'ProjectMembership', indexName: 'ProjectMembership_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ProjectMembership_Refs_projectId_code_targetId_idx" ON "ProjectMembership_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Bot', indexName: 'Bot_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Bot_Refs_projectId_code_targetId_idx" ON "Bot_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Login', indexName: 'Login_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Login_Refs_projectId_code_targetId_idx" ON "Login_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'UserSecurityRequest', indexName: 'UserSecurityRequest_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "UserSecurityRequest_Refs_projectId_code_targetId_idx" ON "UserSecurityRequest_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'JsonWebKey', indexName: 'JsonWebKey_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "JsonWebKey_Refs_projectId_code_targetId_idx" ON "JsonWebKey_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'AccessPolicy', indexName: 'AccessPolicy_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "AccessPolicy_Refs_projectId_code_targetId_idx" ON "AccessPolicy_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'UserConfiguration', indexName: 'UserConfiguration_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "UserConfiguration_Refs_projectId_code_targetId_idx" ON "UserConfiguration_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'BulkDataExport', indexName: 'BulkDataExport_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "BulkDataExport_Refs_projectId_code_targetId_idx" ON "BulkDataExport_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'SmartAppLaunch', indexName: 'SmartAppLaunch_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "SmartAppLaunch_Refs_projectId_code_targetId_idx" ON "SmartAppLaunch_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'SmartHealthLink', indexName: 'SmartHealthLink_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "SmartHealthLink_Refs_projectId_code_targetId_idx" ON "SmartHealthLink_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'DomainConfiguration', indexName: 'DomainConfiguration_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "DomainConfiguration_Refs_projectId_code_targetId_idx" ON "DomainConfiguration_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'AsyncJob', indexName: 'AsyncJob_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "AsyncJob_Refs_projectId_code_targetId_idx" ON "AsyncJob_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Agent', indexName: 'Agent_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Agent_Refs_projectId_code_targetId_idx" ON "Agent_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'Package', indexName: 'Package_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Package_Refs_projectId_code_targetId_idx" ON "Package_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'PackageRelease', indexName: 'PackageRelease_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "PackageRelease_Refs_projectId_code_targetId_idx" ON "PackageRelease_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'PackageInstallation', indexName: 'PackageInstallation_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "PackageInstallation_Refs_projectId_code_targetId_idx" ON "PackageInstallation_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'DicomStudy', indexName: 'DicomStudy_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "DicomStudy_Refs_projectId_code_targetId_idx" ON "DicomStudy_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'DicomSeries', indexName: 'DicomSeries_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "DicomSeries_Refs_projectId_code_targetId_idx" ON "DicomSeries_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
  { resourceType: 'DicomInstance', indexName: 'DicomInstance_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "DicomInstance_Refs_projectId_code_targetId_idx" ON "DicomInstance_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
];

/** Reference rows updated per statement. Bounds how long any single row lock is held. */
const BACKFILL_BATCH_SIZE = 5000;

/** Pause between batches, to leave IO headroom on the writer for live traffic. */
const BATCH_DELAY_MS = 100;

/**
 * Bound on the delete-then-backfill passes made over one table. Two passes suffice unless
 * resources are being purged continuously; the bound only stops a pathological workload from
 * keeping the migration on one table indefinitely.
 */
const MAX_BACKFILL_PASSES = 3;

export async function callback(
  client: PoolClient,
  results: MigrationActionResult[],
  job: Job<CustomPostDeployMigrationJobData> | undefined,
  jobData: CustomPostDeployMigrationJobData
): Promise<void> {
  const tables = await sortBySize(client, REFERENCE_TABLES);

  // Make sure all the new NULL values don't mess up index stats
  await analyzeMissingProjectIdStats(client, results, tables, job, jobData);

  // Resume where a graceful shutdown left off, wrapping around so that tables ordered before the
  // resume point are still visited, since table sizes can change between runs
  const resumeFrom = (jobData as ProjectIdBackfillJobData).resumeFromResourceType;
  const startIndex = Math.max(
    0,
    tables.findIndex((t) => t.resourceType === resumeFrom)
  );

  const unfinished: string[] = [];
  for (let i = 0; i < tables.length; i++) {
    const table = tables[(startIndex + i) % tables.length];
    await checkForQueueClosing(job, jobData, table.resourceType);
    if ((await backfillTable(client, results, table, job, jobData)) > 0) {
      unfinished.push(`${table.resourceType}_References`);
    }
  }

  if (unfinished.length > 0) {
    throw new Error(`Backfill of reference table projectId did not converge for: ${unfinished.join(', ')}`);
  }
}

async function analyzeMissingProjectIdStats(
  client: PoolClient,
  results: MigrationActionResult[],
  tables: ReferenceTableDefinition[],
  job: Job<CustomPostDeployMigrationJobData> | undefined,
  jobData: CustomPostDeployMigrationJobData
): Promise<void> {
  const existing = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_stats WHERE tablename = ANY($1::text[]) AND attname = 'projectId'`,
    [tables.map((t) => `${t.resourceType}_References`)]
  );
  const hasStats = new Set(existing.rows.map((row) => row.tablename));

  const start = Date.now();
  let analyzed = 0;
  for (const table of tables) {
    const tableName = `${table.resourceType}_References`;
    if (hasStats.has(tableName)) {
      continue;
    }
    await checkForQueueClosing(job, jobData, table.resourceType);
    await client.query(`ANALYZE ${escapeTableName(tableName)} ("projectId")`);
    analyzed++;
  }

  results.push({
    name: 'Analyze reference table "projectId" columns',
    durationMs: Date.now() - start,
    analyzed,
    skipped: tables.length - analyzed,
  });
}

async function backfillTable(
  client: PoolClient,
  results: MigrationActionResult[],
  table: ReferenceTableDefinition,
  job: Job<CustomPostDeployMigrationJobData> | undefined,
  jobData: CustomPostDeployMigrationJobData
): Promise<number> {
  const { resourceType, indexName, createIndexSql } = table;
  const tableName = `${resourceType}_References`;

  await fns.idempotentCreateIndex(client, results, indexName, createIndexSql);

  if (!(await hasNullProjectId(client, tableName))) {
    // Already backfilled, either by a previous run of this migration or by ordinary writes
    return 0;
  }

  const start = Date.now();

  let orphansDeleted = 0;
  let updated = 0;
  let remaining = 0;
  let rowsWithoutProject = 0;
  for (let pass = 0; pass < MAX_BACKFILL_PASSES; pass++) {
    updated += await backfillNullProjectIds(client, resourceType, tableName, job, jobData);

    // Fix stats so the queries below can be planned as narrow index scans rather than table scans
    await analyzeProjectIdColumn(client, results, tableName);

    orphansDeleted += await deleteOrphanedRows(client, resourceType, tableName, job, jobData);
    ({ remaining, rowsWithoutProject } = await countNullProjectIds(client, resourceType, tableName));
    if (remaining === rowsWithoutProject) {
      // Every row this migration can reach has been backfilled; another pass would find nothing
      break;
    }
  }

  const unfinished = remaining - rowsWithoutProject;
  results.push({
    name: `Backfill "${tableName}"."projectId"`,
    durationMs: Date.now() - start,
    updated,
    orphansDeleted,
    remaining,
    rowsWithoutProject,
  });
  const details = { tableName, updated, orphansDeleted, remaining, rowsWithoutProject };
  if (unfinished > 0) {
    globalLogger.warn('Backfill of reference table projectId did not converge', details);
  } else if (rowsWithoutProject > 0) {
    // Nothing more can be done for these here, but they will block the NOT NULL constraint in a
    // later release, so the resources they belong to need a project before then
    globalLogger.warn('Backfilled reference table projectId, leaving rows with no project to copy', details);
  } else {
    globalLogger.info('Backfilled reference table projectId', details);
  }

  // Rebuild index to fix NULL-dominated structure and ensure visibility map is up to date
  await fns.query(client, results, `VACUUM (ANALYZE) ${escapeTableName(tableName)}`);
  await fns.reindexConcurrently(client, results, 'INDEX', indexName);

  return unfinished;
}

async function deleteOrphanedRows(
  client: PoolClient,
  resourceType: string,
  tableName: string,
  job: Job<CustomPostDeployMigrationJobData> | undefined,
  jobData: CustomPostDeployMigrationJobData
): Promise<number> {
  const sql = `
    WITH batch AS (
      SELECT r."resourceId", r."targetId", r.code
      FROM ${escapeTableName(tableName)} r
      WHERE r."projectId" IS NULL
        AND NOT EXISTS (SELECT 1 FROM ${escapeTableName(resourceType)} p WHERE p.id = r."resourceId")
      LIMIT $1
    )
    DELETE FROM ${escapeTableName(tableName)} r
    USING batch b
    WHERE r."resourceId" = b."resourceId" AND r."targetId" = b."targetId" AND r.code = b.code
    RETURNING r."resourceId"`;

  let deleted = 0;
  for (;;) {
    await checkForQueueClosing(job, jobData, resourceType);
    const result = await client.query(sql, [BACKFILL_BATCH_SIZE]);
    if (!result.rowCount) {
      return deleted;
    }
    deleted += result.rowCount;
    await sleep(BATCH_DELAY_MS);
  }
}

async function backfillNullProjectIds(
  client: PoolClient,
  resourceType: string,
  tableName: string,
  job: Job<CustomPostDeployMigrationJobData> | undefined,
  jobData: CustomPostDeployMigrationJobData
): Promise<number> {
  const sql = `
    WITH batch AS (
      SELECT r."resourceId", r."targetId", r.code
      FROM ${escapeTableName(tableName)} r
      WHERE r."projectId" IS NULL
        AND EXISTS (
          SELECT 1 FROM ${escapeTableName(resourceType)} p
          WHERE p.id = r."resourceId" AND p."projectId" IS NOT NULL
        )
      LIMIT $1
    )
    UPDATE ${escapeTableName(tableName)} r
    SET "projectId" = p."projectId"
    FROM batch b
    JOIN ${escapeTableName(resourceType)} p ON p.id = b."resourceId"
    WHERE r."resourceId" = b."resourceId" AND r."targetId" = b."targetId" AND r.code = b.code
    RETURNING r."resourceId"`;

  let updated = 0;
  for (;;) {
    await checkForQueueClosing(job, jobData, resourceType);
    const result = await client.query(sql, [BACKFILL_BATCH_SIZE]);
    if (!result.rowCount) {
      return updated;
    }
    updated += result.rowCount;
    await sleep(BATCH_DELAY_MS);
  }
}

/**
 * Refreshes the `projectId` statistics for a single reference table.
 * @param client - The database client.
 * @param results - The list of action results to push operations performed.
 * @param tableName - The reference table name.
 */
async function analyzeProjectIdColumn(
  client: PoolClient,
  results: MigrationActionResult[],
  tableName: string
): Promise<void> {
  await fns.query(client, results, `ANALYZE ${escapeTableName(tableName)} ("projectId")`);
}

async function hasNullProjectId(client: PoolClient, tableName: string): Promise<boolean> {
  const result = await client.query(`SELECT 1 FROM ${escapeTableName(tableName)} WHERE "projectId" IS NULL LIMIT 1`);
  return Boolean(result.rowCount);
}

/**
 * Counts the rows still awaiting a `projectId`, separating out those that can never get one.
 *
 * A row whose resource has no project of its own is not work this migration failed to do; it is
 * work that cannot be done, so it must not be mistaken for a backfill that did not converge.
 * @param client - The database client.
 * @param resourceType - The resource type owning the table.
 * @param tableName - The reference table name.
 * @returns The number of rows left NULL, and how many of those have no project to be backfilled from.
 */
async function countNullProjectIds(
  client: PoolClient,
  resourceType: string,
  tableName: string
): Promise<{ remaining: number; rowsWithoutProject: number }> {
  const result = await client.query<{ remaining: string; rows_without_project: string }>(
    `SELECT count(*) AS remaining,
       count(*) FILTER (
         WHERE EXISTS (
           SELECT 1 FROM ${escapeTableName(resourceType)} p
           WHERE p.id = r."resourceId" AND p."projectId" IS NULL
         )
       ) AS rows_without_project
     FROM ${escapeTableName(tableName)} r
     WHERE r."projectId" IS NULL`
  );
  return {
    remaining: Number.parseInt(result.rows[0].remaining, 10),
    rowsWithoutProject: Number.parseInt(result.rows[0].rows_without_project, 10),
  };
}

async function sortBySize(client: PoolClient, tables: ReferenceTableDefinition[]): Promise<ReferenceTableDefinition[]> {
  const result = await client.query<{ relname: string; bytes: string }>(
    `SELECT relname, pg_total_relation_size(oid) AS bytes FROM pg_class WHERE relname = ANY($1::text[])`,
    [tables.map((t) => `${t.resourceType}_References`)]
  );
  const sizes = new Map(result.rows.map((row) => [row.relname, Number.parseInt(row.bytes, 10)]));
  return [...tables].sort(
    (a, b) =>
      (sizes.get(`${a.resourceType}_References`) ?? 0) - (sizes.get(`${b.resourceType}_References`) ?? 0) ||
      a.resourceType.localeCompare(b.resourceType)
  );
}

async function checkForQueueClosing(
  job: Job<CustomPostDeployMigrationJobData> | undefined,
  jobData: CustomPostDeployMigrationJobData,
  resourceType: string
): Promise<void> {
  if (!job || !queueRegistry.isClosing(job.queueName)) {
    return;
  }
  const nextJobData: ProjectIdBackfillJobData = { ...jobData, resumeFromResourceType: resourceType };
  await job.updateData(nextJobData);
  await moveToDelayedAndThrow(job, 'Reference projectId backfill delayed since queue is closing');
}

function escapeTableName(tableName: string): string {
  if (!/^[A-Za-z]+(_References)?$/.test(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }
  return `"${tableName}"`;
}
