// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Job } from 'bullmq';
import type { PoolClient } from 'pg';
import { getConfig } from '../../config/loader';
import { DatabaseMode, getDatabasePool } from '../../database';
import { isChainedSearchDisabled } from '../../fhir/lookups/reference';
import { globalLogger } from '../../logger';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import { moveToDelayedAndThrow, queueRegistry } from '../../workers/utils';
import * as fns from '../migrate-functions';
import { withLongRunningDatabaseClient } from '../migration-utils';
import type { MigrationActionResult } from '../types';
import type { CustomPostDeployMigration, CustomPostDeployMigrationJobData } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) => runCustomMigration(repo, job, jobData, callback),
};

/**
 * Where the in-flight table stands: `backfill` is partway through its ranges, bounded below by
 * `resumeFromResourceId`; `verify` has finished every range and has only the final count left.
 */
export type BackfillStep = 'backfill' | 'verify';

export interface ProjectIdBackfillJobData extends CustomPostDeployMigrationJobData {
  readonly completedResourceTypes?: string[];
  readonly resumeFromResourceType?: string;
  readonly resumeFromResourceId?: string;
  readonly resumeStep?: BackfillStep;
  readonly resumePhase?: 'backfill' | 'index';
  /** Times this job has been re-queued after losing its database connections. */
  readonly transientFailures?: number;
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
  { resourceType: 'Cron', indexName: 'Cron_Refs_projectId_code_targetId_idx', createIndexSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Cron_Refs_projectId_code_targetId_idx" ON "Cron_References" ("projectId", "code", "targetId") INCLUDE ("resourceId")` },
];

/** Ceiling on concurrent range workers; the limiter starts at one and grows toward it. */
const BACKFILL_CONCURRENCY = 6;
/**
 * Rows one range statement aims to touch, which controls the duration the row locks are held.
 * This should be on the order of a few seconds.
 */
const TARGET_ROWS_PER_RANGE = 25_000;
/**
 * Range duration the limiter grows under: the few seconds `TARGET_ROWS_PER_RANGE` aims for. Longer
 * ranges mean the database is under pressure.
 */
const RANGE_TARGET_MS = 5_000;
/** Multiple of the target duration at which the limiter halves; backs off before `SLOW_RANGE_WARN_MS` warns. */
const RANGE_BACKOFF_FACTOR = 3;
const MAX_RANGES_PER_TABLE = 65_536;
/**
 * Bound on the backfill passes made over one table. Two passes suffice unless
 * resources are being purged continuously; the bound only stops a pathological workload from
 * keeping the migration on one table indefinitely.
 */
const MAX_BACKFILL_PASSES = 3;
const SLOW_RANGE_WARN_MS = 30_000;

/**
 * Hard stop for a single range statement. Worker connections are otherwise timeout-free, so a plan
 * that degrades to a full table scan per range would run unobserved. Cleared before the index
 * phase, which legitimately runs for hours.
 *
 * Generous on purpose. A correctly planned range was measured at 462s on a 20M-row table under the
 * checkpoint pressure of a bulk load, and a migration generating this much WAL creates exactly
 * that pressure. Timing out is not a delay here: the range is abandoned, its rows stay NULL, and
 * the table fails to converge, which fails the job. The seq-scan-per-range case this guards
 * against is orders of magnitude slower still, so the wide margin costs nothing.
 */
const RANGE_STATEMENT_TIMEOUT = '20min';

/** Fraction of the writer pool this migration is willing to occupy. */
const MAX_POOL_SHARE = 0.25;

/**
 * How often range progress is saved to the job while a step is in flight. A process killed outright
 * never reaches the graceful shutdown path, and BullMQ re-runs the stalled job with whatever data
 * was last saved, so this bounds the work redone after a crash.
 */
const PROGRESS_INTERVAL_MS = 60_000;

/**
 * Bound on re-queueing after lost connections, so an error misclassified as transient cannot
 * re-queue the job forever.
 */
const MAX_TRANSIENT_FAILURES = 5;

export interface BackfillOverrides {
  readonly concurrency?: number;
  readonly clients?: PoolClient[];
  readonly rangeTargetRows?: number;
  readonly rangeTargetMs?: number;
  readonly progressIntervalMs?: number;
}

/** A half-open `[lower, upper)` slice of the `resourceId` key space. */
export interface ResourceIdRange {
  readonly lower?: string;
  readonly upper?: string;
}

export async function callback(
  client: PoolClient,
  results: MigrationActionResult[],
  job: Job<CustomPostDeployMigrationJobData> | undefined,
  jobData: CustomPostDeployMigrationJobData,
  overrides: BackfillOverrides = {}
): Promise<void> {
  const data = jobData as ProjectIdBackfillJobData;
  const control = new BackfillControl(job, data, overrides.progressIntervalMs ?? PROGRESS_INTERVAL_MS);

  try {
    const tables = await sortBySize(client, REFERENCE_TABLES);
    // References for these types are not written, so their rows are not backfilled; the index is still built
    const disabled = tables.filter((t) => isChainedSearchDisabled(t.resourceType));
    const backfillable = tables.filter((t) => !disabled.includes(t));
    if (disabled.length > 0) {
      results.push({
        name: 'Skip backfill of reference tables with chained search disabled',
        durationMs: 0,
        skipped: disabled.map((t) => t.resourceType).join(', '),
      });
    }

    await withWorkers(overrides, async (workers) => {
      // Phase A: Build stats for the new column so backfill queries use the best plans
      await analyzeMissingProjectIdStats(client, workers, results, backfillable, control);

      // Phase B: Backfill each table in sequence, with key ranges within a table in parallel.
      const backfill =
        data.resumePhase === 'index'
          ? { touched: new Set<string>(), completed: data.completedResourceTypes ?? [], unfinished: [] as string[] }
          : await backfillTables(client, workers, results, backfillable, control, data, overrides);

      // Phase C: Build indexes for all tables
      const indexCheckpoint: Partial<ProjectIdBackfillJobData> = {
        resumePhase: backfill.unfinished.length > 0 ? 'backfill' : 'index',
        completedResourceTypes: backfill.completed,
      };
      // Saved up front because a build runs for hours and cannot yield to a graceful shutdown
      await control.persist(indexCheckpoint);
      await createReferenceIndexes(workers, results, tables, backfill.touched, control, indexCheckpoint);

      if (backfill.unfinished.length > 0) {
        throw new Error(
          `Backfill of reference table projectId did not converge for: ${backfill.unfinished.join(', ')}`
        );
      }
    });
  } catch (err) {
    // Every worker has settled by the time an error reaches here
    await control.delayIfConnectionLost(err);
    throw err;
  }
}

/**
 * Holds the worker connections for the duration of `fn`.
 *
 * `withLongRunningDatabaseClient` rather than `pool.connect()` because these sessions run with no
 * statement timeout: returning one to the shared pool with a plain `release()` would hand a live
 * request handler a timeout-free session. Nesting also makes release LIFO and strictly after `fn`
 * settles, so no connection closes while a sibling still has a query in flight.
 * @param overrides - Test seams; `clients` bypasses the pool entirely.
 * @param fn - Receives the worker connections.
 * @returns The result of `fn`.
 */
async function withWorkers<T>(overrides: BackfillOverrides, fn: (workers: PoolClient[]) => Promise<T>): Promise<T> {
  if (overrides.clients) {
    return fn(overrides.clients);
  }

  const pool = getDatabasePool(DatabaseMode.WRITER);
  let maxConnections = 50;
  try {
    maxConnections = getConfig().database.maxConnections ?? 50;
  } catch {
    // Config not loaded; the conservative default already applies
  }
  const count = Math.max(
    1,
    Math.min(overrides.concurrency ?? BACKFILL_CONCURRENCY, Math.floor(maxConnections * MAX_POOL_SHARE))
  );

  return withBackfillClients(count, async (workers) => {
    // `connectionTimeoutMillis` is unset, so oversubscribing the writer pool stalls API request
    // handlers silently rather than failing fast.
    globalLogger.info('Acquired reference backfill worker connections', {
      workers: workers.length,
      maxConnections,
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    });
    return fn(workers);
  });
}

async function withBackfillClients<T>(
  count: number,
  fn: (clients: PoolClient[]) => Promise<T>,
  acquired: PoolClient[] = []
): Promise<T> {
  if (acquired.length >= count) {
    return fn(acquired);
  }
  return withLongRunningDatabaseClient(
    async (client) => withBackfillClients(count, fn, [...acquired, client]),
    DatabaseMode.WRITER
  );
}

/**
 * Owns stopping, failing, and saving progress for the whole run.
 *
 * Workers never throw `DelayedError` and never call `job.updateData` themselves: doing so would let
 * the error escape while siblings still hold in-flight queries, and interleave resume points.
 * Workers only latch state and report progress here; saves are issued one at a time from here, and
 * the driver delays or fails the job once every worker has settled.
 */
class BackfillControl {
  private readonly job: Job<CustomPostDeployMigrationJobData> | undefined;
  private readonly progressIntervalMs: number;
  /** The resume state as of the latest checkpoint, which is what gets saved to the job. */
  private state: ProjectIdBackfillJobData;
  private closing = false;
  private error: unknown;
  private saving: Promise<void> | undefined;
  private lastSavedAt = Date.now();

  constructor(
    job: Job<CustomPostDeployMigrationJobData> | undefined,
    jobData: ProjectIdBackfillJobData,
    progressIntervalMs: number
  ) {
    this.job = job;
    this.state = jobData;
    this.progressIntervalMs = progressIntervalMs;
  }

  shouldStop(): boolean {
    if (!this.closing && this.job && queueRegistry.isClosing(this.job.queueName)) {
      this.closing = true;
    }
    return this.closing || this.error !== undefined;
  }

  recordError(err: unknown): void {
    this.error ??= err ?? new Error('Reference projectId backfill failed');
    this.shouldStop();
  }

  /**
   * Records a worker's progress, saving it to the job at most once per interval.
   * @param checkpoint - Resume state that is safe to restart from.
   */
  recordProgress(checkpoint: Partial<ProjectIdBackfillJobData>): void {
    this.state = { ...this.state, ...checkpoint };
    if (this.job && !this.saving && Date.now() - this.lastSavedAt >= this.progressIntervalMs) {
      this.saving = this.save().finally(() => {
        this.saving = undefined;
      });
    }
  }

  /**
   * Driver-only. Records a checkpoint and saves it, after any save still in flight.
   * @param checkpoint - Resume state that is safe to restart from.
   */
  async persist(checkpoint: Partial<ProjectIdBackfillJobData>): Promise<void> {
    this.state = { ...this.state, ...checkpoint };
    await this.saving;
    await this.save();
  }

  /**
   * Driver-only. Call once every worker of a sub-phase has settled, so that "no worker is still
   * touching the database" is a precondition of delaying or rethrowing.
   * @param checkpoint - Resume state as of the end of the sub-phase.
   */
  async settlePhase(checkpoint: Partial<ProjectIdBackfillJobData>): Promise<void> {
    await this.persist(checkpoint);
    if (this.shouldStop() && this.closing && this.job) {
      await moveToDelayedAndThrow(this.job, 'Reference projectId backfill delayed since queue is closing');
    }
    if (this.error !== undefined) {
      throw this.error;
    }
  }

  /**
   * Driver-only. Re-queues the job from its latest checkpoint if `err` means the database
   * connection was lost, as in a failover. Failing the job instead would discard all progress,
   * since a re-run starts from fresh job data.
   * @param err - The error the run failed with.
   */
  async delayIfConnectionLost(err: unknown): Promise<void> {
    const failures = this.state.transientFailures ?? 0;
    if (!this.job || !isConnectionLost(err) || failures >= MAX_TRANSIENT_FAILURES) {
      return;
    }
    globalLogger.warn('Reference projectId backfill lost its database connection', { err, failures });
    await this.persist({ transientFailures: failures + 1 });
    await moveToDelayedAndThrow(this.job, 'Reference projectId backfill delayed after losing its database connection');
  }

  private async save(): Promise<void> {
    if (!this.job) {
      return;
    }
    this.lastSavedAt = Date.now();
    try {
      await this.job.updateData(this.state);
    } catch (err) {
      // Losing a save only means redoing more work after a crash
      globalLogger.warn('Could not save reference projectId backfill progress', { err });
    }
  }
}

interface RangeCounts {
  readonly updated: number;
  readonly orphansDeleted: number;
}

interface RangeRunOutcome extends RangeCounts {
  /** Slowest single range, surfaced so the AsyncJob output carries the seq-scan signal. */
  readonly maxRangeMs: number;
  /** Ranges abandoned after hitting `statement_timeout` twice. */
  readonly abandoned: number;
  /** Whether every range completed. */
  readonly complete: boolean;
  /** Lower bound of the lowest range not proven complete; undefined means from the start. */
  readonly checkpoint?: string;
}

/**
 * AIMD limit on how many workers may claim ranges, driven by range duration: a range that runs
 * past `backoffMs` halves the limit, and a round of ranges at or under `targetMs` adds one worker.
 *
 * Worker `i` is admitted iff `i < limit`, so worker 0 always runs. Ranges that started before the
 * last adjustment are ignored: ranges in flight when the limit drops all ran under the old
 * pressure, and counting each would cascade the limit to one.
 */
export class AdaptiveConcurrency {
  private readonly max: number;
  private readonly targetMs: number;
  private readonly backoffMs: number;
  private current = 1;
  private healthy = 0;
  private lastAdjustedAt = Number.NEGATIVE_INFINITY;
  private waiters: (() => void)[] = [];

  constructor(max: number, targetMs: number, backoffMs: number) {
    this.max = Math.max(1, max);
    this.targetMs = targetMs;
    this.backoffMs = backoffMs;
  }

  get limit(): number {
    return this.current;
  }

  admits(workerIndex: number): boolean {
    return workerIndex < this.current;
  }

  /** @returns A promise resolved the next time the limit grows or `wake` is called. */
  parked(): Promise<void> {
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  wake(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const resolve of waiters) {
      resolve();
    }
  }

  record(startedAt: number, completedAt: number): void {
    if (startedAt < this.lastAdjustedAt) {
      return;
    }
    const durationMs = completedAt - startedAt;
    if (durationMs >= this.backoffMs) {
      this.healthy = 0;
      if (this.current > 1) {
        this.adjust(Math.floor(this.current / 2), completedAt, durationMs);
      }
    } else if (durationMs <= this.targetMs) {
      this.healthy++;
      if (this.healthy >= this.current && this.current < this.max) {
        this.adjust(this.current + 1, completedAt, durationMs);
        this.wake();
      }
    } else {
      this.healthy = 0;
    }
  }

  private adjust(to: number, at: number, durationMs: number): void {
    globalLogger.info('Adjusted reference backfill concurrency', { from: this.current, to, durationMs });
    this.current = to;
    this.healthy = 0;
    this.lastAdjustedAt = at;
  }
}

/**
 * Runs `task` over every range, pulling from a shared queue so a slow range does not idle a worker.
 *
 * `Promise.allSettled`, never `all`: the driver must not proceed while a sibling still has a query
 * in flight on a connection it is about to reuse.
 * @param workers - Connections to fan out across.
 * @param ranges - Ranges to cover, in ascending key order.
 * @param control - Stop/error latch.
 * @param limiter - Decides how many of the workers may claim ranges.
 * @param task - Runs one range; returns its counts, or undefined if the range was abandoned.
 * @param onProgress - Receives the resume checkpoint each time it advances.
 * @returns Aggregated counts and the resume checkpoint.
 */
async function runRanges(
  workers: PoolClient[],
  ranges: ResourceIdRange[],
  control: BackfillControl,
  limiter: AdaptiveConcurrency,
  task: (client: PoolClient, range: ResourceIdRange) => Promise<RangeCounts | undefined>,
  onProgress: (resumeFromResourceId: string | undefined) => void
): Promise<RangeRunOutcome> {
  const completed = new Array<boolean>(ranges.length).fill(false);
  // Every range below the first incomplete one is proven done, so its lower bound is a safe
  // restart point. Ranges above it that did complete are simply redone.
  let firstIncomplete = 0;
  let updated = 0;
  let orphansDeleted = 0;
  let maxRangeMs = 0;
  let abandoned = 0;
  let next = 0;

  const settled = await Promise.allSettled(
    Array.from({ length: Math.min(workers.length, ranges.length) }, async (_unused, workerIndex) => {
      const client = workers[workerIndex];
      try {
        while (!control.shouldStop() && next < ranges.length) {
          if (!limiter.admits(workerIndex)) {
            await limiter.parked();
            continue;
          }
          const index = next++;
          const start = Date.now();
          let counts: RangeCounts | undefined;
          try {
            counts = await task(client, ranges[index]);
          } catch (err) {
            control.recordError(err);
            return;
          }
          const end = Date.now();
          const durationMs = end - start;
          maxRangeMs = Math.max(maxRangeMs, durationMs);
          // Abandoned ranges ran into the statement timeout, so they count as slow too
          limiter.record(start, end);
          if (counts === undefined) {
            abandoned++;
          } else {
            updated += counts.updated;
            orphansDeleted += counts.orphansDeleted;
            completed[index] = true;
            const previous = firstIncomplete;
            while (firstIncomplete < ranges.length && completed[firstIncomplete]) {
              firstIncomplete++;
            }
            if (firstIncomplete > previous && firstIncomplete < ranges.length) {
              onProgress(ranges[firstIncomplete].lower);
            }
          }
          if (durationMs >= SLOW_RANGE_WARN_MS) {
            globalLogger.warn('Slow reference backfill range', { durationMs, index, ranges: ranges.length });
          }
        }
      } finally {
        // Worker 0 is never parked, and every way out of the loop also ends it for parked workers,
        // so waking them here guarantees none waits forever
        limiter.wake();
      }
    })
  );
  for (const result of settled) {
    if (result.status === 'rejected') {
      control.recordError(result.reason);
    }
  }

  const complete = firstIncomplete >= ranges.length;
  return {
    updated,
    orphansDeleted,
    maxRangeMs,
    abandoned,
    complete,
    checkpoint: complete ? undefined : ranges[firstIncomplete].lower,
  };
}

/**
 * Runs `task` once per table across the workers, keeping each table's action results local and
 * splicing them back in table order.
 *
 * Pushing to the shared array from concurrent tasks would make the order of `results` depend on
 * which table finished first.
 * @param workers - Connections to fan out across.
 * @param tables - Tables to process.
 * @param results - Shared action results, appended to in table order once all tables settle.
 * @param control - Stop/error latch.
 * @param task - Runs one table, pushing to its own local results array.
 */
async function runPerTable(
  workers: PoolClient[],
  tables: ReferenceTableDefinition[],
  results: MigrationActionResult[],
  control: BackfillControl,
  task: (client: PoolClient, table: ReferenceTableDefinition, localResults: MigrationActionResult[]) => Promise<void>
): Promise<void> {
  const localResults = tables.map((): MigrationActionResult[] => []);
  let next = 0;

  const settled = await Promise.allSettled(
    Array.from({ length: Math.min(workers.length, tables.length) }, async (_unused, workerIndex) => {
      const client = workers[workerIndex];
      while (!control.shouldStop()) {
        const index = next++;
        if (index >= tables.length) {
          return;
        }
        try {
          await task(client, tables[index], localResults[index]);
        } catch (err) {
          control.recordError(err);
          return;
        }
      }
    })
  );
  for (const result of settled) {
    if (result.status === 'rejected') {
      control.recordError(result.reason);
    }
  }
  for (const local of localResults) {
    results.push(...local);
  }
}

async function analyzeMissingProjectIdStats(
  client: PoolClient,
  workers: PoolClient[],
  results: MigrationActionResult[],
  tables: ReferenceTableDefinition[],
  control: BackfillControl
): Promise<void> {
  const existing = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_stats WHERE tablename = ANY($1::text[]) AND attname = 'projectId'`,
    [tables.map((t) => `${t.resourceType}_References`)]
  );
  const hasStats = new Set(existing.rows.map((row) => row.tablename));
  const pending = tables.filter((table) => !hasStats.has(`${table.resourceType}_References`));

  const start = Date.now();
  await runPerTable(workers, pending, [], control, async (worker, table) => {
    await worker.query(`ANALYZE ${escapeTableName(table.resourceType + '_References')} ("projectId")`);
  });

  results.push({
    name: 'Analyze reference table "projectId" columns',
    durationMs: Date.now() - start,
    analyzed: pending.length,
    skipped: tables.length - pending.length,
  });
  // Nothing to record: a resume still starts wherever the previous attempt left off
  await control.settlePhase({});
}

async function backfillTables(
  client: PoolClient,
  workers: PoolClient[],
  results: MigrationActionResult[],
  tables: ReferenceTableDefinition[],
  control: BackfillControl,
  data: ProjectIdBackfillJobData,
  overrides: BackfillOverrides
): Promise<{ touched: Set<string>; completed: string[]; unfinished: string[] }> {
  // Ranges are bounded to roughly a second each, but a plan that degrades to a full table scan
  // per range would run unobserved on these otherwise timeout-free connections.
  await setOnWorkers(workers, `SET statement_timeout TO '${RANGE_STATEMENT_TIMEOUT}'`);
  try {
    const completed = new Set(data.completedResourceTypes ?? []);
    const touched = new Set<string>();
    const unfinished: string[] = [];
    // Shared across tables, which run smallest first, so the limit is warm when the large ones start
    const targetMs = overrides.rangeTargetMs ?? RANGE_TARGET_MS;
    const limiter = new AdaptiveConcurrency(workers.length, targetMs, targetMs * RANGE_BACKOFF_FACTOR);
    for (const table of tables) {
      if (completed.has(table.resourceType)) {
        continue;
      }
      // Matched by type, not position: table sizes, and so the order, can change between attempts
      const resuming = table.resourceType === data.resumeFromResourceType;

      const outcome = await backfillTable(client, workers, results, table, control, limiter, {
        completedResourceTypes: [...completed],
        resumeFromResourceId: resuming ? data.resumeFromResourceId : undefined,
        resumeStep: resuming ? data.resumeStep : undefined,
        overrides,
      });
      if (outcome.touched) {
        touched.add(table.resourceType);
      }
      if (outcome.unfinished > 0) {
        unfinished.push(`${table.resourceType}_References`);
      } else {
        completed.add(table.resourceType);
      }
      // Without the `projectId` index, re-proving a finished table after a crash costs a full scan
      await control.persist({
        completedResourceTypes: [...completed],
        resumeFromResourceType: undefined,
        resumeFromResourceId: undefined,
        resumeStep: undefined,
      });
    }
    return { touched, completed: [...completed], unfinished };
  } finally {
    // The index phase legitimately runs for hours. A connection already torn down by a shutdown
    // in progress must not replace the DelayedError on its way out.
    try {
      await setOnWorkers(workers, `SET statement_timeout TO 0`);
    } catch (err) {
      globalLogger.warn('Could not clear statement timeout on backfill workers', { err });
    }
  }
}

interface BackfillTableContext {
  readonly completedResourceTypes: string[];
  readonly resumeFromResourceId?: string;
  readonly resumeStep?: BackfillStep;
  readonly overrides: BackfillOverrides;
}

async function backfillTable(
  client: PoolClient,
  workers: PoolClient[],
  results: MigrationActionResult[],
  table: ReferenceTableDefinition,
  control: BackfillControl,
  limiter: AdaptiveConcurrency,
  context: BackfillTableContext
): Promise<{ touched: boolean; unfinished: number }> {
  const { resourceType } = table;
  const tableName = `${resourceType}_References`;

  if (!(await hasNullProjectId(client, tableName))) {
    // Already backfilled, either by a previous run of this migration or by ordinary writes
    return { touched: false, unfinished: 0 };
  }

  const start = Date.now();
  const { overrides } = context;
  const ranges = computeRanges(await estimateRowCount(client, tableName), overrides.rangeTargetRows);

  // Keyed ranges only pay off if both sides of the join plan as index scans. The range bounds
  // make both tables primary key range scans, but the planner reliably prefers to hash join
  // against a sequential scan of the resource table, which turns one scan of it into one per
  // range. Disabling seq scans is a cost penalty rather than a prohibition, so no plan becomes
  // impossible -- only more expensive than the index path it was passed over for. It does not stop
  // a bitmap scan on the resource table's `projectId` index from reading the whole table, which is
  // why the resource side carries its own range bound too.
  // A single unbounded statement matches every row, which is what a seq scan is for, so it is
  // left alone.
  const seqscanDisabled = ranges.length > 1;

  const checkpoint = (resumeStep: BackfillStep, resumeFromResourceId?: string): Partial<ProjectIdBackfillJobData> => ({
    resumePhase: 'backfill',
    resumeFromResourceType: resourceType,
    completedResourceTypes: context.completedResourceTypes,
    resumeStep,
    resumeFromResourceId,
  });

  let orphansDeleted = 0;
  let updated = 0;
  let remaining = 0;
  let rowsWithoutProject = 0;
  let maxRangeMs = 0;
  let abandoned = 0;
  let passes = 0;
  try {
    // Inside the try so that a failure partway through the workers still hits the restore below
    if (seqscanDisabled) {
      await setOnWorkers(workers, `SET enable_seqscan = off`);
    }

    for (let pass = 0; pass < MAX_BACKFILL_PASSES; pass++) {
      passes++;
      // Only the first pass picks up where a previous attempt left off
      const step = pass === 0 ? (context.resumeStep ?? 'backfill') : 'backfill';
      const resumeFrom = pass === 0 ? context.resumeFromResourceId : undefined;

      if (step === 'backfill') {
        const outcome = await runRanges(
          workers,
          rangesFrom(ranges, resumeFrom),
          control,
          limiter,
          (worker, range) => backfillRange(worker, resourceType, tableName, range, seqscanDisabled),
          (from) => control.recordProgress(checkpoint('backfill', from))
        );
        updated += outcome.updated;
        orphansDeleted += outcome.orphansDeleted;
        maxRangeMs = Math.max(maxRangeMs, outcome.maxRangeMs);
        abandoned += outcome.abandoned;
        await control.settlePhase(outcome.complete ? checkpoint('verify') : checkpoint('backfill', outcome.checkpoint));
      }

      ({ remaining, rowsWithoutProject } = await countNullProjectIds(client, resourceType, tableName));
      if (remaining === rowsWithoutProject) {
        // Every row this migration can reach has been backfilled; another pass would find nothing
        break;
      }
    }
  } finally {
    // The setting is per session, so it has to come back on before the next table plans its own
    if (seqscanDisabled) {
      try {
        await setOnWorkers(workers, `SET enable_seqscan = on`);
      } catch (err) {
        globalLogger.warn('Could not re-enable sequential scans on backfill workers', { err });
      }
    }
  }

  const unfinished = remaining - rowsWithoutProject;
  const result: MigrationActionResult = {
    name: `Backfill "${tableName}"."projectId"`,
    durationMs: Date.now() - start,
    updated,
    orphansDeleted,
    remaining,
    rowsWithoutProject,
    ranges: ranges.length,
    passes,
    maxRangeMs,
    concurrency: limiter.limit,
  };
  if (abandoned > 0) {
    result.abandonedRanges = abandoned;
  }
  results.push(result);

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

  return { touched: true, unfinished };
}

/**
 * Drops the ranges wholly below a resume point. The range containing it is kept whole, since only
 * the ranges below it are proven complete.
 * @param ranges - Ranges in ascending key order.
 * @param resumeFrom - The resume point, or undefined to keep every range.
 * @returns The ranges still to be run.
 */
function rangesFrom(ranges: ResourceIdRange[], resumeFrom: string | undefined): ResourceIdRange[] {
  if (resumeFrom === undefined) {
    return ranges;
  }
  return ranges.filter((range) => range.upper === undefined || range.upper > resumeFrom);
}

/**
 * Splits the `resourceId` key space into contiguous ranges of roughly `targetRows` rows each.
 *
 * The ranges must tile the space exactly: an overlap hands two workers the same rows in opposite
 * orders, and a gap silently leaves rows NULL. Hence `ranges[i].upper === ranges[i + 1].lower`,
 * with the outermost bounds left open rather than clamped to a representable uuid.
 * @param rowEstimate - Estimated rows in the table; 0 or negative yields a single range.
 * @param targetRows - Rows each range aims to cover.
 * @returns The ranges, in ascending key order.
 */
export function computeRanges(rowEstimate: number, targetRows = TARGET_ROWS_PER_RANGE): ResourceIdRange[] {
  const rows = Number.isFinite(rowEstimate) ? rowEstimate : 0;
  const rangeCount = Math.min(MAX_RANGES_PER_TABLE, Math.max(1, Math.ceil(rows / targetRows) || 1));
  const ranges: ResourceIdRange[] = [];
  for (let i = 0; i < rangeCount; i++) {
    ranges.push({
      lower: i === 0 ? undefined : uuidPartition(i, rangeCount),
      upper: i === rangeCount - 1 ? undefined : uuidPartition(i + 1, rangeCount),
    });
  }
  return ranges;
}

export function uuidPartition(index: number, total: number): string {
  if (!Number.isInteger(index) || !Number.isInteger(total) || index <= 0 || index >= total) {
    throw new Error(`Cannot compute uuid boundary ${index} of ${total}`);
  }
  const partition = ((1n << 128n) * BigInt(index)) / BigInt(total);
  const hex = partition.toString(16).padStart(32, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface RangeStatement {
  readonly sql: string;
  readonly params: string[];
}

/**
 * Backfills one range, then sweeps its orphans.
 *
 * The sweep runs right behind the backfill, on the same range, while its pages are still cached:
 * with no index on `projectId` yet, a separate sweep pass would be a second full read of the table.
 * Backfilling first leaves NULL only the rows whose resource no longer exists, so the range counts
 * as complete only once both statements have run.
 * @param client - The worker connection.
 * @param resourceType - The resource type owning the table.
 * @param tableName - The reference table name.
 * @param range - The key range to cover.
 * @param seqscanDisabled - Whether the table is running with `enable_seqscan` off.
 * @returns The range's counts, or undefined if either statement was abandoned.
 */
async function backfillRange(
  client: PoolClient,
  resourceType: string,
  tableName: string,
  range: ResourceIdRange,
  seqscanDisabled: boolean
): Promise<RangeCounts | undefined> {
  const updated = await runRangeStatement(client, backfillSql(resourceType, tableName, range), range, seqscanDisabled);
  if (updated === undefined) {
    return undefined;
  }
  const orphansDeleted = await runRangeStatement(
    client,
    orphanSweepSql(resourceType, tableName, range),
    range,
    seqscanDisabled
  );
  if (orphansDeleted === undefined) {
    return undefined;
  }
  return { updated, orphansDeleted };
}

function backfillSql(resourceType: string, tableName: string, range: ResourceIdRange): RangeStatement {
  const bounds = rangePredicate(range, ['r."resourceId"', 'p.id']);
  return {
    sql: `UPDATE ${escapeTableName(tableName)} r
    SET "projectId" = p."projectId"
    FROM ${escapeTableName(resourceType)} p
    WHERE p.id = r."resourceId"
      AND r."projectId" IS NULL
      AND p."projectId" IS NOT NULL
      ${bounds.sql}`,
    params: bounds.params,
  };
}

/**
 * Builds the orphan sweep for one key range.
 *
 * The sweep must be range-scoped: with no index on `projectId` during the backfill, a whole-table
 * `WHERE "projectId" IS NULL` degrades to a sequential scan.
 * @param resourceType - The resource type owning the table.
 * @param tableName - The reference table name.
 * @param range - The key range to cover.
 * @returns The statement and its parameters.
 */
function orphanSweepSql(resourceType: string, tableName: string, range: ResourceIdRange): RangeStatement {
  const bounds = rangePredicate(range, ['r."resourceId"']);
  // Same parameters, so the subquery's bounds repeat the outer ones rather than adding their own
  const resourceBounds = rangePredicate(range, ['p.id']);
  return {
    sql: `DELETE FROM ${escapeTableName(tableName)} r
    WHERE r."projectId" IS NULL
      ${bounds.sql}
      AND NOT EXISTS (
        SELECT 1 FROM ${escapeTableName(resourceType)} p
        WHERE p.id = r."resourceId"
          ${resourceBounds.sql}
      )`,
    params: bounds.params,
  };
}

/**
 * Renders a range as simple `>=` / `<` bounds on each of `columns`, sharing one parameter per bound.
 *
 * Emitting the bounds that exist rather than `($1 IS NULL OR ...)` keeps the predicate a simple
 * bound the planner can turn into a primary key range scan. The planner does not carry a range
 * across a join equality, so each side of the join has to be bounded explicitly.
 * @param range - The range to render.
 * @param columns - Columns to bound, all equal to `r."resourceId"` in the statement.
 * @returns The SQL fragment and its parameters.
 */
function rangePredicate(range: ResourceIdRange, columns: string[]): RangeStatement {
  const clauses: string[] = [];
  const params: string[] = [];
  if (range.lower !== undefined) {
    params.push(range.lower);
    clauses.push(...columns.map((column) => `AND ${column} >= $${params.length}::uuid`));
  }
  if (range.upper !== undefined) {
    params.push(range.upper);
    clauses.push(...columns.map((column) => `AND ${column} < $${params.length}::uuid`));
  }
  return { sql: clauses.join('\n      '), params };
}

/** SQLSTATE raised on `statement_timeout`. */
const queryCanceled = '57014';

/**
 * Runs one range statement, retrying transient conflicts and surviving a pathological plan.
 *
 * An abandoned range is reported rather than thrown: its rows stay NULL, so the table fails the
 * convergence check below and the job still fails, but with a full accounting of what was left
 * behind instead of whichever worker happened to time out first.
 * @param client - The worker connection.
 * @param statement - The statement to run.
 * @param range - The range being covered, for diagnostics.
 * @param seqscanDisabled - Whether the table is already running with `enable_seqscan` off.
 * @returns Rows affected, or undefined if the range was abandoned after timing out.
 */
async function runRangeStatement(
  client: PoolClient,
  statement: RangeStatement,
  range: ResourceIdRange,
  seqscanDisabled: boolean
): Promise<number | undefined> {
  try {
    return await runWithSerializationRetries(client, statement);
  } catch (err) {
    if (getSqlState(err) !== queryCanceled) {
      throw err;
    }
    if (seqscanDisabled) {
      // Already running the plan a retry would fall back to, so it would time out the same way
      globalLogger.error('Abandoning reference backfill range after timeout', { range });
      return undefined;
    }
    globalLogger.warn('Reference backfill range timed out; retrying without sequential scans', { range });
    await client.query(`SET enable_seqscan = off`);
    try {
      return await runWithSerializationRetries(client, statement);
    } catch (retryErr) {
      if (getSqlState(retryErr) !== queryCanceled) {
        throw retryErr;
      }
      globalLogger.error('Abandoning reference backfill range after repeated timeouts', { range });
      return undefined;
    } finally {
      // Back to the setting the rest of this table is running under
      await client.query(`SET enable_seqscan = on`);
    }
  }
}

const retryAttempts = 5;
const retryableCodes = [
  '40001', // serialization error
  '40P01', // deadlock
];
async function runWithSerializationRetries(client: PoolClient, statement: RangeStatement): Promise<number> {
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await client.query(statement.sql, statement.params);
      return result.rowCount ?? 0;
    } catch (err) {
      const sqlState = getSqlState(err);
      if (attempt >= retryAttempts || sqlState === undefined || !retryableCodes.includes(sqlState)) {
        throw err;
      }
      globalLogger.warn('Retrying reference backfill range', { sqlState, attempt });
    }
  }
}

function getSqlState(err: unknown): string | undefined {
  return err instanceof Error && 'code' in err && typeof err.code === 'string' ? err.code : undefined;
}

/** SQLSTATEs and socket errors that mean the connection failed, not the statement. */
const connectionLostCodes = [
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
];

function isConnectionLost(err: unknown): boolean {
  const code = getSqlState(err);
  if (code !== undefined) {
    // Class 08 is connection_exception
    return code.startsWith('08') || connectionLostCodes.includes(code);
  }
  // node-postgres reports a dropped socket, and any later query on that client, with no code
  return err instanceof Error && /Connection terminated|not queryable/.test(err.message);
}

async function setOnWorkers(workers: PoolClient[], sql: string): Promise<void> {
  for (const worker of workers) {
    await worker.query(sql);
  }
}

/**
 * Builds the `projectId` index on every table, and vacuums the ones the backfill rewrote.
 *
 * Deferring index creation to here is most of the speedup: creating it first makes every UPDATE
 * maintain a wide, randomly ordered index that is then rebuilt anyway. Running it across tables
 * concurrently is safe on PG>=14, where `CREATE INDEX CONCURRENTLY` sets `PROC_IN_SAFE_IC` and
 * `VACUUM` sets `PROC_IN_VACUUM`, so neither is waited on by the other's snapshot wait. Both take
 * SHARE UPDATE EXCLUSIVE, so they conflict only on the same table, which the sequence below
 * orders. A multi-second range UPDATE is a locker of its table and would stall that table's
 * build, which is exactly why this is a separate phase rather than part of the per-table work.
 * @param workers - Connections to fan out across.
 * @param results - Shared action results.
 * @param tables - All reference tables.
 * @param touched - Resource types whose rows this run actually rewrote.
 * @param control - Stop/error latch.
 * @param checkpoint - Resume state to record if the queue closes during this phase.
 */
async function createReferenceIndexes(
  workers: PoolClient[],
  results: MigrationActionResult[],
  tables: ReferenceTableDefinition[],
  touched: Set<string>,
  control: BackfillControl,
  checkpoint: Partial<ProjectIdBackfillJobData>
): Promise<void> {
  await runPerTable(workers, tables, results, control, async (client, table, localResults) => {
    if (touched.has(table.resourceType)) {
      // Fix the NULL-dominated page structure and refresh the visibility map before the build
      await fns.query(client, localResults, `VACUUM (ANALYZE) ${escapeTableName(table.resourceType + '_References')}`);
    }
    // `idempotentCreateIndex` drops a leftover invalid index with a plain DROP INDEX, which takes
    // ACCESS EXCLUSIVE on a hot table; do it concurrently instead.
    if (await isInvalidIndex(client, table.indexName)) {
      await fns.dropInvalidIndexConcurrently(client, localResults, 'public', table.indexName);
    }
    await fns.idempotentCreateIndex(client, localResults, table.indexName, table.createIndexSql);
  });
  await control.settlePhase(checkpoint);
}

async function isInvalidIndex(client: PoolClient, indexName: string): Promise<boolean> {
  const result = await client.query<{ is_valid: boolean }>(
    `SELECT i.indisvalid AS is_valid
     FROM pg_index i
     JOIN pg_class c ON c.oid = i.indexrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = $1`,
    [indexName]
  );
  return result.rows.length > 0 && !result.rows[0].is_valid;
}

/**
 * Estimates the row count of a table from the catalog.
 *
 * Read lazily, just before the table is backfilled, so it reflects both the phase A `ANALYZE` and
 * any growth over what may be a multi-hour run.
 * @param client - The database client.
 * @param tableName - The reference table name.
 * @returns The estimated row count, or 0 if nothing is known.
 */
async function estimateRowCount(client: PoolClient, tableName: string): Promise<number> {
  const result = await client.query<{ reltuples: string; relpages: string }>(
    `SELECT reltuples::bigint AS reltuples, relpages::bigint AS relpages
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = $1`,
    [tableName]
  );
  if (result.rows.length === 0) {
    return 0;
  }
  const reltuples = Number.parseInt(result.rows[0].reltuples, 10);
  if (reltuples >= 0) {
    return reltuples;
  }
  // PG>=14 reports -1 for a relation that has never been analyzed or vacuumed
  const relpages = Number.parseInt(result.rows[0].relpages, 10);
  return relpages > 0 ? relpages * 100 : 0;
}

async function hasNullProjectId(client: PoolClient, tableName: string): Promise<boolean> {
  const result = await client.query(`SELECT 1 FROM ${escapeTableName(tableName)} WHERE "projectId" IS NULL LIMIT 1`);
  return Boolean(result.rowCount);
}

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
    `SELECT c.relname, pg_total_relation_size(c.oid) AS bytes
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
    [tables.map((t) => `${t.resourceType}_References`)]
  );
  const sizes = new Map(result.rows.map((row) => [row.relname, Number.parseInt(row.bytes, 10)]));
  return [...tables].sort(
    (a, b) =>
      (sizes.get(`${a.resourceType}_References`) ?? 0) - (sizes.get(`${b.resourceType}_References`) ?? 0) ||
      a.resourceType.localeCompare(b.resourceType)
  );
}

function escapeTableName(tableName: string): string {
  if (!/^[A-Za-z]+(_References)?$/.test(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }
  return `"${tableName}"`;
}
