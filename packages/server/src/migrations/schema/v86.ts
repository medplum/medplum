// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/*
 * This is a generated file
 * Do not edit manually.
 */

import { PoolClient } from 'pg';

export async function run(client: PoolClient): Promise<void> {
  await client.query('ALTER TABLE IF EXISTS "Account" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ActivityDefinition" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "AdverseEvent" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "AllergyIntolerance" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Appointment" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "AppointmentResponse" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "AuditEvent" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Basic" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Binary" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "BiologicallyDerivedProduct" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "BodyStructure" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Bundle" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "CapabilityStatement" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "CarePlan" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "CareTeam" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "CatalogEntry" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ChargeItem" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ChargeItemDefinition" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Claim" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ClaimResponse" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ClinicalImpression" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "CodeSystem" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Communication" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "CommunicationRequest" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "CompartmentDefinition" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Composition" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ConceptMap" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Condition" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Consent" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Contract" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Coverage" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "CoverageEligibilityRequest" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query(
    'ALTER TABLE IF EXISTS "CoverageEligibilityResponse" ADD COLUMN IF NOT EXISTS "__version" INTEGER'
  );
  await client.query('ALTER TABLE IF EXISTS "DetectedIssue" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Device" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "DeviceDefinition" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "DeviceMetric" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "DeviceRequest" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "DeviceUseStatement" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "DiagnosticReport" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "DocumentManifest" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "DocumentReference" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "EffectEvidenceSynthesis" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Encounter" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Endpoint" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "EnrollmentRequest" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "EnrollmentResponse" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "EpisodeOfCare" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "EventDefinition" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Evidence" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "EvidenceVariable" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ExampleScenario" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ExplanationOfBenefit" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "FamilyMemberHistory" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Flag" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Goal" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "GraphDefinition" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Group" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "GuidanceResponse" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "HealthcareService" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ImagingStudy" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Immunization" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ImmunizationEvaluation" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ImmunizationRecommendation" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ImplementationGuide" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "InsurancePlan" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Invoice" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Library" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Linkage" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "List" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Location" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Measure" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "MeasureReport" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Media" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Medication" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "MedicationAdministration" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "MedicationDispense" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "MedicationKnowledge" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "MedicationRequest" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "MedicationStatement" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "MedicinalProduct" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query(
    'ALTER TABLE IF EXISTS "MedicinalProductAuthorization" ADD COLUMN IF NOT EXISTS "__version" INTEGER'
  );
  await client.query(
    'ALTER TABLE IF EXISTS "MedicinalProductContraindication" ADD COLUMN IF NOT EXISTS "__version" INTEGER'
  );
  await client.query('ALTER TABLE IF EXISTS "MedicinalProductIndication" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "MedicinalProductIngredient" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query(
    'ALTER TABLE IF EXISTS "MedicinalProductInteraction" ADD COLUMN IF NOT EXISTS "__version" INTEGER'
  );
  await client.query(
    'ALTER TABLE IF EXISTS "MedicinalProductManufactured" ADD COLUMN IF NOT EXISTS "__version" INTEGER'
  );
  await client.query('ALTER TABLE IF EXISTS "MedicinalProductPackaged" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query(
    'ALTER TABLE IF EXISTS "MedicinalProductPharmaceutical" ADD COLUMN IF NOT EXISTS "__version" INTEGER'
  );
  await client.query(
    'ALTER TABLE IF EXISTS "MedicinalProductUndesirableEffect" ADD COLUMN IF NOT EXISTS "__version" INTEGER'
  );
  await client.query('ALTER TABLE IF EXISTS "MessageDefinition" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "MessageHeader" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "MolecularSequence" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "NamingSystem" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "NutritionOrder" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Observation" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ObservationDefinition" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "OperationDefinition" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "OperationOutcome" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Organization" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "OrganizationAffiliation" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Parameters" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Patient" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "PaymentNotice" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "PaymentReconciliation" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Person" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "PlanDefinition" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Practitioner" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "PractitionerRole" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Procedure" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Provenance" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Questionnaire" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "QuestionnaireResponse" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "RelatedPerson" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "RequestGroup" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ResearchDefinition" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ResearchElementDefinition" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ResearchStudy" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ResearchSubject" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "RiskAssessment" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "RiskEvidenceSynthesis" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Schedule" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "SearchParameter" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ServiceRequest" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Slot" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Specimen" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "SpecimenDefinition" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "StructureDefinition" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "StructureMap" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Subscription" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "SubscriptionStatus" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Substance" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "SubstanceNucleicAcid" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "SubstancePolymer" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "SubstanceProtein" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query(
    'ALTER TABLE IF EXISTS "SubstanceReferenceInformation" ADD COLUMN IF NOT EXISTS "__version" INTEGER'
  );
  await client.query('ALTER TABLE IF EXISTS "SubstanceSourceMaterial" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "SubstanceSpecification" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "SupplyDelivery" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "SupplyRequest" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Task" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "TerminologyCapabilities" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "TestReport" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "TestScript" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ValueSet" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "VerificationResult" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "VisionPrescription" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Project" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ClientApplication" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "ProjectMembership" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Bot" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Login" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "PasswordChangeRequest" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "UserSecurityRequest" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "JsonWebKey" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "AccessPolicy" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "UserConfiguration" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "BulkDataExport" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "SmartAppLaunch" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "DomainConfiguration" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "AsyncJob" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
  await client.query('ALTER TABLE IF EXISTS "Agent" ADD COLUMN IF NOT EXISTS "__version" INTEGER');
}
