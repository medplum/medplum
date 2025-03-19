import { Pool, PoolClient } from 'pg';
import { DatabaseMode, getDatabasePool } from '../../database';
import { CustomMigrationAction, CustomPostDeployMigration } from './types';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, jobData) => {
    return runCustomMigration(repo, jobData, async () => {
      const pool = getDatabasePool(DatabaseMode.WRITER);
      await pool.query(`SET statement_timeout TO 0`);

      const actions: CustomMigrationAction[] = [];
      await runQueries(actions, pool);

      return { actions };
    });
  },
};

async function query(
  context: { actions: CustomMigrationAction[]; client: Pool | PoolClient },
  queryStr: string
): Promise<void> {
  const { actions, client } = context;
  const start = Date.now();
  await client.query(queryStr);
  actions.push({ name: queryStr, durationMs: Date.now() - start });
}

// prettier-ignore
async function runQueries(actions: CustomMigrationAction[], client: Pool | PoolClient): Promise<void> {
  const context = { actions, client };
  await query(context,'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Account_tokens_idx" ON "Account" USING gin ("tokens")');
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Account_tokensTrgm_idx" ON "Account" USING gin (token_array_to_text("tokensText") gin_trgm_ops)');
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ActivityDefinition_tokens_idx" ON "ActivityDefinition" USING gin ("tokens")');
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ActivityDefinition_tokensTrgm_idx" ON "ActivityDefinition" USING gin (token_array_to_text("tokensText") gin_trgm_ops)');
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "AdverseEvent_tokens_idx" ON "AdverseEvent" USING gin ("tokens")');
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "AdverseEvent_tokensTrgm_idx" ON "AdverseEvent" USING gin (token_array_to_text("tokensText") gin_trgm_ops)');
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "AllergyIntolerance_tokens_idx" ON "AllergyIntolerance" USING gin ("tokens")');
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "AllergyIntolerance_tokensTrgm_idx" ON "AllergyIntolerance" USING gin (token_array_to_text("tokensText") gin_trgm_ops)');
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Appointment_tokens_idx" ON "Appointment" USING gin ("tokens")');
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Appointment_tokensTrgm_idx" ON "Appointment" USING gin (token_array_to_text("tokensText") gin_trgm_ops)');
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "AppointmentResponse_tokens_idx" ON "AppointmentResponse" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "AppointmentResponse_tokensTrgm_idx" ON "AppointmentResponse" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "AuditEvent_tokens_idx" ON "AuditEvent" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "AuditEvent_tokensTrgm_idx" ON "AuditEvent" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Basic_tokens_idx" ON "Basic" USING gin ("tokens")');
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Basic_tokensTrgm_idx" ON "Basic" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Binary_tokens_idx" ON "Binary" USING gin ("tokens")');
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Binary_tokensTrgm_idx" ON "Binary" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "BiologicallyDerivedProduct_tokens_idx" ON "BiologicallyDerivedProduct" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "BiologicallyDerivedProduct_tokensTrgm_idx" ON "BiologicallyDerivedProduct" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "BodyStructure_tokens_idx" ON "BodyStructure" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "BodyStructure_tokensTrgm_idx" ON "BodyStructure" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Bundle_tokens_idx" ON "Bundle" USING gin ("tokens")');
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Bundle_tokensTrgm_idx" ON "Bundle" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "CapabilityStatement_tokens_idx" ON "CapabilityStatement" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "CapabilityStatement_tokensTrgm_idx" ON "CapabilityStatement" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "CarePlan_tokens_idx" ON "CarePlan" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "CarePlan_tokensTrgm_idx" ON "CarePlan" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "CareTeam_tokens_idx" ON "CareTeam" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "CareTeam_tokensTrgm_idx" ON "CareTeam" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "CatalogEntry_tokens_idx" ON "CatalogEntry" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "CatalogEntry_tokensTrgm_idx" ON "CatalogEntry" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ChargeItem_tokens_idx" ON "ChargeItem" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ChargeItem_tokensTrgm_idx" ON "ChargeItem" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ChargeItemDefinition_tokens_idx" ON "ChargeItemDefinition" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ChargeItemDefinition_tokensTrgm_idx" ON "ChargeItemDefinition" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Claim_tokens_idx" ON "Claim" USING gin ("tokens")');
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Claim_tokensTrgm_idx" ON "Claim" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ClaimResponse_tokens_idx" ON "ClaimResponse" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ClaimResponse_tokensTrgm_idx" ON "ClaimResponse" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ClinicalImpression_tokens_idx" ON "ClinicalImpression" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ClinicalImpression_tokensTrgm_idx" ON "ClinicalImpression" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "CodeSystem_tokens_idx" ON "CodeSystem" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "CodeSystem_tokensTrgm_idx" ON "CodeSystem" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Communication_tokens_idx" ON "Communication" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Communication_tokensTrgm_idx" ON "Communication" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "CommunicationRequest_tokens_idx" ON "CommunicationRequest" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "CommunicationRequest_tokensTrgm_idx" ON "CommunicationRequest" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "CompartmentDefinition_tokens_idx" ON "CompartmentDefinition" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "CompartmentDefinition_tokensTrgm_idx" ON "CompartmentDefinition" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Composition_tokens_idx" ON "Composition" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Composition_tokensTrgm_idx" ON "Composition" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ConceptMap_tokens_idx" ON "ConceptMap" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ConceptMap_tokensTrgm_idx" ON "ConceptMap" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Condition_tokens_idx" ON "Condition" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Condition_tokensTrgm_idx" ON "Condition" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Consent_tokens_idx" ON "Consent" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Consent_tokensTrgm_idx" ON "Consent" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Contract_tokens_idx" ON "Contract" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Contract_tokensTrgm_idx" ON "Contract" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Coverage_tokens_idx" ON "Coverage" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Coverage_tokensTrgm_idx" ON "Coverage" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "CoverageEligibilityRequest_tokens_idx" ON "CoverageEligibilityRequest" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "CoverageEligibilityRequest_tokensTrgm_idx" ON "CoverageEligibilityRequest" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "CoverageEligibilityResponse_tokens_idx" ON "CoverageEligibilityResponse" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "CoverageEligibilityResponse_tokensTrgm_idx" ON "CoverageEligibilityResponse" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "DetectedIssue_tokens_idx" ON "DetectedIssue" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "DetectedIssue_tokensTrgm_idx" ON "DetectedIssue" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Device_tokens_idx" ON "Device" USING gin ("tokens")');
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Device_tokensTrgm_idx" ON "Device" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "DeviceDefinition_tokens_idx" ON "DeviceDefinition" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "DeviceDefinition_tokensTrgm_idx" ON "DeviceDefinition" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "DeviceMetric_tokens_idx" ON "DeviceMetric" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "DeviceMetric_tokensTrgm_idx" ON "DeviceMetric" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "DeviceRequest_tokens_idx" ON "DeviceRequest" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "DeviceRequest_tokensTrgm_idx" ON "DeviceRequest" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "DeviceUseStatement_tokens_idx" ON "DeviceUseStatement" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "DeviceUseStatement_tokensTrgm_idx" ON "DeviceUseStatement" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "DiagnosticReport_tokens_idx" ON "DiagnosticReport" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "DiagnosticReport_tokensTrgm_idx" ON "DiagnosticReport" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "DocumentManifest_tokens_idx" ON "DocumentManifest" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "DocumentManifest_tokensTrgm_idx" ON "DocumentManifest" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "DocumentReference_tokens_idx" ON "DocumentReference" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "DocumentReference_tokensTrgm_idx" ON "DocumentReference" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "EffectEvidenceSynthesis_tokens_idx" ON "EffectEvidenceSynthesis" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "EffectEvidenceSynthesis_tokensTrgm_idx" ON "EffectEvidenceSynthesis" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Encounter_tokens_idx" ON "Encounter" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Encounter_tokensTrgm_idx" ON "Encounter" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Endpoint_tokens_idx" ON "Endpoint" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Endpoint_tokensTrgm_idx" ON "Endpoint" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "EnrollmentRequest_tokens_idx" ON "EnrollmentRequest" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "EnrollmentRequest_tokensTrgm_idx" ON "EnrollmentRequest" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "EnrollmentResponse_tokens_idx" ON "EnrollmentResponse" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "EnrollmentResponse_tokensTrgm_idx" ON "EnrollmentResponse" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "EpisodeOfCare_tokens_idx" ON "EpisodeOfCare" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "EpisodeOfCare_tokensTrgm_idx" ON "EpisodeOfCare" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "EventDefinition_tokens_idx" ON "EventDefinition" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "EventDefinition_tokensTrgm_idx" ON "EventDefinition" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Evidence_tokens_idx" ON "Evidence" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Evidence_tokensTrgm_idx" ON "Evidence" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "EvidenceVariable_tokens_idx" ON "EvidenceVariable" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "EvidenceVariable_tokensTrgm_idx" ON "EvidenceVariable" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ExampleScenario_tokens_idx" ON "ExampleScenario" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ExampleScenario_tokensTrgm_idx" ON "ExampleScenario" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ExplanationOfBenefit_tokens_idx" ON "ExplanationOfBenefit" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ExplanationOfBenefit_tokensTrgm_idx" ON "ExplanationOfBenefit" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "FamilyMemberHistory_tokens_idx" ON "FamilyMemberHistory" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "FamilyMemberHistory_tokensTrgm_idx" ON "FamilyMemberHistory" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Flag_tokens_idx" ON "Flag" USING gin ("tokens")');
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Flag_tokensTrgm_idx" ON "Flag" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Goal_tokens_idx" ON "Goal" USING gin ("tokens")');
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Goal_tokensTrgm_idx" ON "Goal" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "GraphDefinition_tokens_idx" ON "GraphDefinition" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "GraphDefinition_tokensTrgm_idx" ON "GraphDefinition" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Group_tokens_idx" ON "Group" USING gin ("tokens")');
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Group_tokensTrgm_idx" ON "Group" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "GuidanceResponse_tokens_idx" ON "GuidanceResponse" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "GuidanceResponse_tokensTrgm_idx" ON "GuidanceResponse" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "HealthcareService_tokens_idx" ON "HealthcareService" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "HealthcareService_tokensTrgm_idx" ON "HealthcareService" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImagingStudy_tokens_idx" ON "ImagingStudy" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImagingStudy_tokensTrgm_idx" ON "ImagingStudy" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Immunization_tokens_idx" ON "Immunization" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Immunization_tokensTrgm_idx" ON "Immunization" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImmunizationEvaluation_tokens_idx" ON "ImmunizationEvaluation" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImmunizationEvaluation_tokensTrgm_idx" ON "ImmunizationEvaluation" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImmunizationRecommendation_tokens_idx" ON "ImmunizationRecommendation" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImmunizationRecommendation_tokensTrgm_idx" ON "ImmunizationRecommendation" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImplementationGuide_tokens_idx" ON "ImplementationGuide" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImplementationGuide_tokensTrgm_idx" ON "ImplementationGuide" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "InsurancePlan_tokens_idx" ON "InsurancePlan" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "InsurancePlan_tokensTrgm_idx" ON "InsurancePlan" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_tokens_idx" ON "Invoice" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_tokensTrgm_idx" ON "Invoice" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Library_tokens_idx" ON "Library" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Library_tokensTrgm_idx" ON "Library" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Linkage_tokens_idx" ON "Linkage" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Linkage_tokensTrgm_idx" ON "Linkage" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "List_tokens_idx" ON "List" USING gin ("tokens")');
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "List_tokensTrgm_idx" ON "List" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Location_tokens_idx" ON "Location" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Location_tokensTrgm_idx" ON "Location" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Measure_tokens_idx" ON "Measure" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Measure_tokensTrgm_idx" ON "Measure" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MeasureReport_tokens_idx" ON "MeasureReport" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MeasureReport_tokensTrgm_idx" ON "MeasureReport" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Media_tokens_idx" ON "Media" USING gin ("tokens")');
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Media_tokensTrgm_idx" ON "Media" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Medication_tokens_idx" ON "Medication" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Medication_tokensTrgm_idx" ON "Medication" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicationAdministration_tokens_idx" ON "MedicationAdministration" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicationAdministration_tokensTrgm_idx" ON "MedicationAdministration" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicationDispense_tokens_idx" ON "MedicationDispense" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicationDispense_tokensTrgm_idx" ON "MedicationDispense" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicationKnowledge_tokens_idx" ON "MedicationKnowledge" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicationKnowledge_tokensTrgm_idx" ON "MedicationKnowledge" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicationRequest_tokens_idx" ON "MedicationRequest" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicationRequest_tokensTrgm_idx" ON "MedicationRequest" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicationStatement_tokens_idx" ON "MedicationStatement" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicationStatement_tokensTrgm_idx" ON "MedicationStatement" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicinalProduct_tokens_idx" ON "MedicinalProduct" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicinalProduct_tokensTrgm_idx" ON "MedicinalProduct" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MPA_tokens_idx" ON "MedicinalProductAuthorization" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MPA_tokensTrgm_idx" ON "MedicinalProductAuthorization" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MPC_tokens_idx" ON "MedicinalProductContraindication" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MPC_tokensTrgm_idx" ON "MedicinalProductContraindication" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicinalProductIndication_tokens_idx" ON "MedicinalProductIndication" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicinalProductIndication_tokensTrgm_idx" ON "MedicinalProductIndication" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicinalProductIngredient_tokens_idx" ON "MedicinalProductIngredient" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicinalProductIngredient_tokensTrgm_idx" ON "MedicinalProductIngredient" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicinalProductInteraction_tokens_idx" ON "MedicinalProductInteraction" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicinalProductInteraction_tokensTrgm_idx" ON "MedicinalProductInteraction" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicinalProductManufactured_tokens_idx" ON "MedicinalProductManufactured" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicinalProductManufactured_tokensTrgm_idx" ON "MedicinalProductManufactured" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicinalProductPackaged_tokens_idx" ON "MedicinalProductPackaged" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MedicinalProductPackaged_tokensTrgm_idx" ON "MedicinalProductPackaged" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MPP_tokens_idx" ON "MedicinalProductPharmaceutical" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MPP_tokensTrgm_idx" ON "MedicinalProductPharmaceutical" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MPUE_tokens_idx" ON "MedicinalProductUndesirableEffect" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MPUE_tokensTrgm_idx" ON "MedicinalProductUndesirableEffect" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MessageDefinition_tokens_idx" ON "MessageDefinition" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MessageDefinition_tokensTrgm_idx" ON "MessageDefinition" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MessageHeader_tokens_idx" ON "MessageHeader" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MessageHeader_tokensTrgm_idx" ON "MessageHeader" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MolecularSequence_tokens_idx" ON "MolecularSequence" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MolecularSequence_tokensTrgm_idx" ON "MolecularSequence" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "NamingSystem_tokens_idx" ON "NamingSystem" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "NamingSystem_tokensTrgm_idx" ON "NamingSystem" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "NutritionOrder_tokens_idx" ON "NutritionOrder" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "NutritionOrder_tokensTrgm_idx" ON "NutritionOrder" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Observation_tokens_idx" ON "Observation" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Observation_tokensTrgm_idx" ON "Observation" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ObservationDefinition_tokens_idx" ON "ObservationDefinition" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ObservationDefinition_tokensTrgm_idx" ON "ObservationDefinition" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "OperationDefinition_tokens_idx" ON "OperationDefinition" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "OperationDefinition_tokensTrgm_idx" ON "OperationDefinition" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "OperationOutcome_tokens_idx" ON "OperationOutcome" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "OperationOutcome_tokensTrgm_idx" ON "OperationOutcome" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Organization_tokens_idx" ON "Organization" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Organization_tokensTrgm_idx" ON "Organization" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "OrganizationAffiliation_tokens_idx" ON "OrganizationAffiliation" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "OrganizationAffiliation_tokensTrgm_idx" ON "OrganizationAffiliation" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Parameters_tokens_idx" ON "Parameters" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Parameters_tokensTrgm_idx" ON "Parameters" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Patient_tokens_idx" ON "Patient" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Patient_tokensTrgm_idx" ON "Patient" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "PaymentNotice_tokens_idx" ON "PaymentNotice" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "PaymentNotice_tokensTrgm_idx" ON "PaymentNotice" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "PaymentReconciliation_tokens_idx" ON "PaymentReconciliation" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "PaymentReconciliation_tokensTrgm_idx" ON "PaymentReconciliation" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Person_tokens_idx" ON "Person" USING gin ("tokens")');
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Person_tokensTrgm_idx" ON "Person" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "PlanDefinition_tokens_idx" ON "PlanDefinition" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "PlanDefinition_tokensTrgm_idx" ON "PlanDefinition" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Practitioner_tokens_idx" ON "Practitioner" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Practitioner_tokensTrgm_idx" ON "Practitioner" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "PractitionerRole_tokens_idx" ON "PractitionerRole" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "PractitionerRole_tokensTrgm_idx" ON "PractitionerRole" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Procedure_tokens_idx" ON "Procedure" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Procedure_tokensTrgm_idx" ON "Procedure" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Provenance_tokens_idx" ON "Provenance" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Provenance_tokensTrgm_idx" ON "Provenance" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Questionnaire_tokens_idx" ON "Questionnaire" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Questionnaire_tokensTrgm_idx" ON "Questionnaire" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "QuestionnaireResponse_tokens_idx" ON "QuestionnaireResponse" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "QuestionnaireResponse_tokensTrgm_idx" ON "QuestionnaireResponse" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "RelatedPerson_tokens_idx" ON "RelatedPerson" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "RelatedPerson_tokensTrgm_idx" ON "RelatedPerson" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "RequestGroup_tokens_idx" ON "RequestGroup" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "RequestGroup_tokensTrgm_idx" ON "RequestGroup" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ResearchDefinition_tokens_idx" ON "ResearchDefinition" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ResearchDefinition_tokensTrgm_idx" ON "ResearchDefinition" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ResearchElementDefinition_tokens_idx" ON "ResearchElementDefinition" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ResearchElementDefinition_tokensTrgm_idx" ON "ResearchElementDefinition" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ResearchStudy_tokens_idx" ON "ResearchStudy" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ResearchStudy_tokensTrgm_idx" ON "ResearchStudy" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ResearchSubject_tokens_idx" ON "ResearchSubject" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ResearchSubject_tokensTrgm_idx" ON "ResearchSubject" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "RiskAssessment_tokens_idx" ON "RiskAssessment" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "RiskAssessment_tokensTrgm_idx" ON "RiskAssessment" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "RiskEvidenceSynthesis_tokens_idx" ON "RiskEvidenceSynthesis" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "RiskEvidenceSynthesis_tokensTrgm_idx" ON "RiskEvidenceSynthesis" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Schedule_tokens_idx" ON "Schedule" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Schedule_tokensTrgm_idx" ON "Schedule" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SearchParameter_tokens_idx" ON "SearchParameter" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SearchParameter_tokensTrgm_idx" ON "SearchParameter" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ServiceRequest_tokens_idx" ON "ServiceRequest" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ServiceRequest_tokensTrgm_idx" ON "ServiceRequest" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Slot_tokens_idx" ON "Slot" USING gin ("tokens")');
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Slot_tokensTrgm_idx" ON "Slot" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Specimen_tokens_idx" ON "Specimen" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Specimen_tokensTrgm_idx" ON "Specimen" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SpecimenDefinition_tokens_idx" ON "SpecimenDefinition" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SpecimenDefinition_tokensTrgm_idx" ON "SpecimenDefinition" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "StructureDefinition_tokens_idx" ON "StructureDefinition" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "StructureDefinition_tokensTrgm_idx" ON "StructureDefinition" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "StructureMap_tokens_idx" ON "StructureMap" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "StructureMap_tokensTrgm_idx" ON "StructureMap" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Subscription_tokens_idx" ON "Subscription" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Subscription_tokensTrgm_idx" ON "Subscription" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubscriptionStatus_tokens_idx" ON "SubscriptionStatus" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubscriptionStatus_tokensTrgm_idx" ON "SubscriptionStatus" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Substance_tokens_idx" ON "Substance" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Substance_tokensTrgm_idx" ON "Substance" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubstanceNucleicAcid_tokens_idx" ON "SubstanceNucleicAcid" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubstanceNucleicAcid_tokensTrgm_idx" ON "SubstanceNucleicAcid" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubstancePolymer_tokens_idx" ON "SubstancePolymer" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubstancePolymer_tokensTrgm_idx" ON "SubstancePolymer" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubstanceProtein_tokens_idx" ON "SubstanceProtein" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubstanceProtein_tokensTrgm_idx" ON "SubstanceProtein" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubstanceReferenceInformation_tokens_idx" ON "SubstanceReferenceInformation" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubstanceReferenceInformation_tokensTrgm_idx" ON "SubstanceReferenceInformation" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubstanceSourceMaterial_tokens_idx" ON "SubstanceSourceMaterial" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubstanceSourceMaterial_tokensTrgm_idx" ON "SubstanceSourceMaterial" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubstanceSpecification_tokens_idx" ON "SubstanceSpecification" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SubstanceSpecification_tokensTrgm_idx" ON "SubstanceSpecification" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SupplyDelivery_tokens_idx" ON "SupplyDelivery" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SupplyDelivery_tokensTrgm_idx" ON "SupplyDelivery" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SupplyRequest_tokens_idx" ON "SupplyRequest" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SupplyRequest_tokensTrgm_idx" ON "SupplyRequest" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_tokens_idx" ON "Task" USING gin ("tokens")');
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_tokensTrgm_idx" ON "Task" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "TerminologyCapabilities_tokens_idx" ON "TerminologyCapabilities" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "TerminologyCapabilities_tokensTrgm_idx" ON "TerminologyCapabilities" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "TestReport_tokens_idx" ON "TestReport" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "TestReport_tokensTrgm_idx" ON "TestReport" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "TestScript_tokens_idx" ON "TestScript" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "TestScript_tokensTrgm_idx" ON "TestScript" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ValueSet_tokens_idx" ON "ValueSet" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ValueSet_tokensTrgm_idx" ON "ValueSet" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "VerificationResult_tokens_idx" ON "VerificationResult" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "VerificationResult_tokensTrgm_idx" ON "VerificationResult" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "VisionPrescription_tokens_idx" ON "VisionPrescription" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "VisionPrescription_tokensTrgm_idx" ON "VisionPrescription" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Project_tokens_idx" ON "Project" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Project_tokensTrgm_idx" ON "Project" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ClientApplication_tokens_idx" ON "ClientApplication" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ClientApplication_tokensTrgm_idx" ON "ClientApplication" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_tokens_idx" ON "User" USING gin ("tokens")');
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_tokensTrgm_idx" ON "User" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ProjectMembership_tokens_idx" ON "ProjectMembership" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ProjectMembership_tokensTrgm_idx" ON "ProjectMembership" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Bot_tokens_idx" ON "Bot" USING gin ("tokens")');
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Bot_tokensTrgm_idx" ON "Bot" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Login_tokens_idx" ON "Login" USING gin ("tokens")');
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Login_tokensTrgm_idx" ON "Login" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "PasswordChangeRequest_tokens_idx" ON "PasswordChangeRequest" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "PasswordChangeRequest_tokensTrgm_idx" ON "PasswordChangeRequest" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "UserSecurityRequest_tokens_idx" ON "UserSecurityRequest" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "UserSecurityRequest_tokensTrgm_idx" ON "UserSecurityRequest" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "JsonWebKey_tokens_idx" ON "JsonWebKey" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "JsonWebKey_tokensTrgm_idx" ON "JsonWebKey" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "AccessPolicy_tokens_idx" ON "AccessPolicy" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "AccessPolicy_tokensTrgm_idx" ON "AccessPolicy" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "UserConfiguration_tokens_idx" ON "UserConfiguration" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "UserConfiguration_tokensTrgm_idx" ON "UserConfiguration" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "BulkDataExport_tokens_idx" ON "BulkDataExport" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "BulkDataExport_tokensTrgm_idx" ON "BulkDataExport" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SmartAppLaunch_tokens_idx" ON "SmartAppLaunch" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SmartAppLaunch_tokensTrgm_idx" ON "SmartAppLaunch" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "DomainConfiguration_tokens_idx" ON "DomainConfiguration" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "DomainConfiguration_tokensTrgm_idx" ON "DomainConfiguration" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "AsyncJob_tokens_idx" ON "AsyncJob" USING gin ("tokens")'
  );
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "AsyncJob_tokensTrgm_idx" ON "AsyncJob" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
  await query(context, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Agent_tokens_idx" ON "Agent" USING gin ("tokens")');
  await query(
    context,
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Agent_tokensTrgm_idx" ON "Agent" USING gin (token_array_to_text("tokensText") gin_trgm_ops)'
  );
}
