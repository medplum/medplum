// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * This is a generated file
 * Do not edit manually.
 */

import type { PoolClient } from 'pg';
import * as fns from '../migrate-functions';

// prettier-ignore
export async function run(client: PoolClient): Promise<void> {
  const results: { name: string; durationMs: number }[] = []
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Account" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Account_projectId_idx" ON "Deleted_Account" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Account_lastUpdated_idx" ON "Deleted_Account" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Account_compartments_idx" ON "Deleted_Account" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ActivityDefinition" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ActivityDefinition_projectId_idx" ON "Deleted_ActivityDefinition" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ActivityDefinition_lastUpdated_idx" ON "Deleted_ActivityDefinition" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ActivityDefinition_compartments_idx" ON "Deleted_ActivityDefinition" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_AdverseEvent" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_AdverseEvent_projectId_idx" ON "Deleted_AdverseEvent" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_AdverseEvent_lastUpdated_idx" ON "Deleted_AdverseEvent" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_AdverseEvent_compartments_idx" ON "Deleted_AdverseEvent" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_AllergyIntolerance" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_AllergyIntolerance_projectId_idx" ON "Deleted_AllergyIntolerance" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_AllergyIntolerance_lastUpdated_idx" ON "Deleted_AllergyIntolerance" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_AllergyIntolerance_compartments_idx" ON "Deleted_AllergyIntolerance" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Appointment" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Appointment_projectId_idx" ON "Deleted_Appointment" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Appointment_lastUpdated_idx" ON "Deleted_Appointment" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Appointment_compartments_idx" ON "Deleted_Appointment" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_AppointmentResponse" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_AppointmentResponse_projectId_idx" ON "Deleted_AppointmentResponse" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_AppointmentResponse_lastUpdated_idx" ON "Deleted_AppointmentResponse" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_AppointmentResponse_compartments_idx" ON "Deleted_AppointmentResponse" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_AuditEvent" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_AuditEvent_projectId_idx" ON "Deleted_AuditEvent" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_AuditEvent_lastUpdated_idx" ON "Deleted_AuditEvent" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_AuditEvent_compartments_idx" ON "Deleted_AuditEvent" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Basic" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Basic_projectId_idx" ON "Deleted_Basic" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Basic_lastUpdated_idx" ON "Deleted_Basic" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Basic_compartments_idx" ON "Deleted_Basic" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Binary" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Binary_projectId_idx" ON "Deleted_Binary" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Binary_lastUpdated_idx" ON "Deleted_Binary" ("lastUpdated")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_BiologicallyDerivedProduct" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_BiologicallyDerivedProduct_projectId_idx" ON "Deleted_BiologicallyDerivedProduct" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_BiologicallyDerivedProduct_lastUpdated_idx" ON "Deleted_BiologicallyDerivedProduct" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_BiologicallyDerivedProduct_compartments_idx" ON "Deleted_BiologicallyDerivedProduct" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_BodyStructure" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_BodyStructure_projectId_idx" ON "Deleted_BodyStructure" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_BodyStructure_lastUpdated_idx" ON "Deleted_BodyStructure" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_BodyStructure_compartments_idx" ON "Deleted_BodyStructure" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Bundle" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Bundle_projectId_idx" ON "Deleted_Bundle" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Bundle_lastUpdated_idx" ON "Deleted_Bundle" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Bundle_compartments_idx" ON "Deleted_Bundle" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_CapabilityStatement" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CapabilityStatement_projectId_idx" ON "Deleted_CapabilityStatement" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CapabilityStatement_lastUpdated_idx" ON "Deleted_CapabilityStatement" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CapabilityStatement_compartments_idx" ON "Deleted_CapabilityStatement" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_CarePlan" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CarePlan_projectId_idx" ON "Deleted_CarePlan" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CarePlan_lastUpdated_idx" ON "Deleted_CarePlan" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CarePlan_compartments_idx" ON "Deleted_CarePlan" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_CareTeam" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CareTeam_projectId_idx" ON "Deleted_CareTeam" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CareTeam_lastUpdated_idx" ON "Deleted_CareTeam" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CareTeam_compartments_idx" ON "Deleted_CareTeam" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_CatalogEntry" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CatalogEntry_projectId_idx" ON "Deleted_CatalogEntry" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CatalogEntry_lastUpdated_idx" ON "Deleted_CatalogEntry" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CatalogEntry_compartments_idx" ON "Deleted_CatalogEntry" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ChargeItem" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ChargeItem_projectId_idx" ON "Deleted_ChargeItem" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ChargeItem_lastUpdated_idx" ON "Deleted_ChargeItem" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ChargeItem_compartments_idx" ON "Deleted_ChargeItem" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ChargeItemDefinition" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ChargeItemDefinition_projectId_idx" ON "Deleted_ChargeItemDefinition" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ChargeItemDefinition_lastUpdated_idx" ON "Deleted_ChargeItemDefinition" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ChargeItemDefinition_compartments_idx" ON "Deleted_ChargeItemDefinition" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Claim" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Claim_projectId_idx" ON "Deleted_Claim" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Claim_lastUpdated_idx" ON "Deleted_Claim" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Claim_compartments_idx" ON "Deleted_Claim" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ClaimResponse" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ClaimResponse_projectId_idx" ON "Deleted_ClaimResponse" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ClaimResponse_lastUpdated_idx" ON "Deleted_ClaimResponse" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ClaimResponse_compartments_idx" ON "Deleted_ClaimResponse" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ClinicalImpression" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ClinicalImpression_projectId_idx" ON "Deleted_ClinicalImpression" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ClinicalImpression_lastUpdated_idx" ON "Deleted_ClinicalImpression" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ClinicalImpression_compartments_idx" ON "Deleted_ClinicalImpression" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_CodeSystem" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CodeSystem_projectId_idx" ON "Deleted_CodeSystem" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CodeSystem_lastUpdated_idx" ON "Deleted_CodeSystem" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CodeSystem_compartments_idx" ON "Deleted_CodeSystem" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Communication" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Communication_projectId_idx" ON "Deleted_Communication" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Communication_lastUpdated_idx" ON "Deleted_Communication" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Communication_compartments_idx" ON "Deleted_Communication" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_CommunicationRequest" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CommunicationRequest_projectId_idx" ON "Deleted_CommunicationRequest" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CommunicationRequest_lastUpdated_idx" ON "Deleted_CommunicationRequest" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CommunicationRequest_compartments_idx" ON "Deleted_CommunicationRequest" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_CompartmentDefinition" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CompartmentDefinition_projectId_idx" ON "Deleted_CompartmentDefinition" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CompartmentDefinition_lastUpdated_idx" ON "Deleted_CompartmentDefinition" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CompartmentDefinition_compartments_idx" ON "Deleted_CompartmentDefinition" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Composition" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Composition_projectId_idx" ON "Deleted_Composition" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Composition_lastUpdated_idx" ON "Deleted_Composition" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Composition_compartments_idx" ON "Deleted_Composition" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ConceptMap" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ConceptMap_projectId_idx" ON "Deleted_ConceptMap" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ConceptMap_lastUpdated_idx" ON "Deleted_ConceptMap" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ConceptMap_compartments_idx" ON "Deleted_ConceptMap" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Condition" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Condition_projectId_idx" ON "Deleted_Condition" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Condition_lastUpdated_idx" ON "Deleted_Condition" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Condition_compartments_idx" ON "Deleted_Condition" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Consent" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Consent_projectId_idx" ON "Deleted_Consent" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Consent_lastUpdated_idx" ON "Deleted_Consent" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Consent_compartments_idx" ON "Deleted_Consent" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Contract" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Contract_projectId_idx" ON "Deleted_Contract" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Contract_lastUpdated_idx" ON "Deleted_Contract" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Contract_compartments_idx" ON "Deleted_Contract" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Coverage" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Coverage_projectId_idx" ON "Deleted_Coverage" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Coverage_lastUpdated_idx" ON "Deleted_Coverage" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Coverage_compartments_idx" ON "Deleted_Coverage" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_CoverageEligibilityRequest" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CoverageEligibilityRequest_projectId_idx" ON "Deleted_CoverageEligibilityRequest" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CoverageEligibilityRequest_lastUpdated_idx" ON "Deleted_CoverageEligibilityRequest" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CoverageEligibilityRequest_compartments_idx" ON "Deleted_CoverageEligibilityRequest" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_CoverageEligibilityResponse" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CoverageEligibilityResponse_projectId_idx" ON "Deleted_CoverageEligibilityResponse" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CoverageEligibilityResponse_lastUpdated_idx" ON "Deleted_CoverageEligibilityResponse" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_CoverageEligibilityResponse_compartments_idx" ON "Deleted_CoverageEligibilityResponse" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_DetectedIssue" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DetectedIssue_projectId_idx" ON "Deleted_DetectedIssue" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DetectedIssue_lastUpdated_idx" ON "Deleted_DetectedIssue" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DetectedIssue_compartments_idx" ON "Deleted_DetectedIssue" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Device" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Device_projectId_idx" ON "Deleted_Device" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Device_lastUpdated_idx" ON "Deleted_Device" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Device_compartments_idx" ON "Deleted_Device" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_DeviceDefinition" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DeviceDefinition_projectId_idx" ON "Deleted_DeviceDefinition" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DeviceDefinition_lastUpdated_idx" ON "Deleted_DeviceDefinition" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DeviceDefinition_compartments_idx" ON "Deleted_DeviceDefinition" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_DeviceMetric" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DeviceMetric_projectId_idx" ON "Deleted_DeviceMetric" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DeviceMetric_lastUpdated_idx" ON "Deleted_DeviceMetric" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DeviceMetric_compartments_idx" ON "Deleted_DeviceMetric" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_DeviceRequest" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DeviceRequest_projectId_idx" ON "Deleted_DeviceRequest" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DeviceRequest_lastUpdated_idx" ON "Deleted_DeviceRequest" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DeviceRequest_compartments_idx" ON "Deleted_DeviceRequest" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_DeviceUseStatement" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DeviceUseStatement_projectId_idx" ON "Deleted_DeviceUseStatement" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DeviceUseStatement_lastUpdated_idx" ON "Deleted_DeviceUseStatement" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DeviceUseStatement_compartments_idx" ON "Deleted_DeviceUseStatement" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_DiagnosticReport" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DiagnosticReport_projectId_idx" ON "Deleted_DiagnosticReport" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DiagnosticReport_lastUpdated_idx" ON "Deleted_DiagnosticReport" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DiagnosticReport_compartments_idx" ON "Deleted_DiagnosticReport" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_DocumentManifest" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DocumentManifest_projectId_idx" ON "Deleted_DocumentManifest" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DocumentManifest_lastUpdated_idx" ON "Deleted_DocumentManifest" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DocumentManifest_compartments_idx" ON "Deleted_DocumentManifest" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_DocumentReference" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DocumentReference_projectId_idx" ON "Deleted_DocumentReference" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DocumentReference_lastUpdated_idx" ON "Deleted_DocumentReference" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DocumentReference_compartments_idx" ON "Deleted_DocumentReference" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_EffectEvidenceSynthesis" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_EffectEvidenceSynthesis_projectId_idx" ON "Deleted_EffectEvidenceSynthesis" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_EffectEvidenceSynthesis_lastUpdated_idx" ON "Deleted_EffectEvidenceSynthesis" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_EffectEvidenceSynthesis_compartments_idx" ON "Deleted_EffectEvidenceSynthesis" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Encounter" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Encounter_projectId_idx" ON "Deleted_Encounter" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Encounter_lastUpdated_idx" ON "Deleted_Encounter" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Encounter_compartments_idx" ON "Deleted_Encounter" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Endpoint" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Endpoint_projectId_idx" ON "Deleted_Endpoint" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Endpoint_lastUpdated_idx" ON "Deleted_Endpoint" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Endpoint_compartments_idx" ON "Deleted_Endpoint" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_EnrollmentRequest" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_EnrollmentRequest_projectId_idx" ON "Deleted_EnrollmentRequest" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_EnrollmentRequest_lastUpdated_idx" ON "Deleted_EnrollmentRequest" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_EnrollmentRequest_compartments_idx" ON "Deleted_EnrollmentRequest" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_EnrollmentResponse" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_EnrollmentResponse_projectId_idx" ON "Deleted_EnrollmentResponse" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_EnrollmentResponse_lastUpdated_idx" ON "Deleted_EnrollmentResponse" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_EnrollmentResponse_compartments_idx" ON "Deleted_EnrollmentResponse" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_EpisodeOfCare" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_EpisodeOfCare_projectId_idx" ON "Deleted_EpisodeOfCare" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_EpisodeOfCare_lastUpdated_idx" ON "Deleted_EpisodeOfCare" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_EpisodeOfCare_compartments_idx" ON "Deleted_EpisodeOfCare" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_EventDefinition" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_EventDefinition_projectId_idx" ON "Deleted_EventDefinition" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_EventDefinition_lastUpdated_idx" ON "Deleted_EventDefinition" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_EventDefinition_compartments_idx" ON "Deleted_EventDefinition" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Evidence" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Evidence_projectId_idx" ON "Deleted_Evidence" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Evidence_lastUpdated_idx" ON "Deleted_Evidence" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Evidence_compartments_idx" ON "Deleted_Evidence" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_EvidenceVariable" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_EvidenceVariable_projectId_idx" ON "Deleted_EvidenceVariable" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_EvidenceVariable_lastUpdated_idx" ON "Deleted_EvidenceVariable" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_EvidenceVariable_compartments_idx" ON "Deleted_EvidenceVariable" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ExampleScenario" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ExampleScenario_projectId_idx" ON "Deleted_ExampleScenario" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ExampleScenario_lastUpdated_idx" ON "Deleted_ExampleScenario" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ExampleScenario_compartments_idx" ON "Deleted_ExampleScenario" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ExplanationOfBenefit" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ExplanationOfBenefit_projectId_idx" ON "Deleted_ExplanationOfBenefit" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ExplanationOfBenefit_lastUpdated_idx" ON "Deleted_ExplanationOfBenefit" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ExplanationOfBenefit_compartments_idx" ON "Deleted_ExplanationOfBenefit" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_FamilyMemberHistory" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_FamilyMemberHistory_projectId_idx" ON "Deleted_FamilyMemberHistory" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_FamilyMemberHistory_lastUpdated_idx" ON "Deleted_FamilyMemberHistory" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_FamilyMemberHistory_compartments_idx" ON "Deleted_FamilyMemberHistory" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Flag" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Flag_projectId_idx" ON "Deleted_Flag" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Flag_lastUpdated_idx" ON "Deleted_Flag" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Flag_compartments_idx" ON "Deleted_Flag" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Goal" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Goal_projectId_idx" ON "Deleted_Goal" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Goal_lastUpdated_idx" ON "Deleted_Goal" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Goal_compartments_idx" ON "Deleted_Goal" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_GraphDefinition" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_GraphDefinition_projectId_idx" ON "Deleted_GraphDefinition" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_GraphDefinition_lastUpdated_idx" ON "Deleted_GraphDefinition" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_GraphDefinition_compartments_idx" ON "Deleted_GraphDefinition" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Group" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Group_projectId_idx" ON "Deleted_Group" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Group_lastUpdated_idx" ON "Deleted_Group" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Group_compartments_idx" ON "Deleted_Group" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_GuidanceResponse" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_GuidanceResponse_projectId_idx" ON "Deleted_GuidanceResponse" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_GuidanceResponse_lastUpdated_idx" ON "Deleted_GuidanceResponse" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_GuidanceResponse_compartments_idx" ON "Deleted_GuidanceResponse" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_HealthcareService" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_HealthcareService_projectId_idx" ON "Deleted_HealthcareService" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_HealthcareService_lastUpdated_idx" ON "Deleted_HealthcareService" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_HealthcareService_compartments_idx" ON "Deleted_HealthcareService" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ImagingStudy" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ImagingStudy_projectId_idx" ON "Deleted_ImagingStudy" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ImagingStudy_lastUpdated_idx" ON "Deleted_ImagingStudy" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ImagingStudy_compartments_idx" ON "Deleted_ImagingStudy" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Immunization" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Immunization_projectId_idx" ON "Deleted_Immunization" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Immunization_lastUpdated_idx" ON "Deleted_Immunization" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Immunization_compartments_idx" ON "Deleted_Immunization" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ImmunizationEvaluation" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ImmunizationEvaluation_projectId_idx" ON "Deleted_ImmunizationEvaluation" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ImmunizationEvaluation_lastUpdated_idx" ON "Deleted_ImmunizationEvaluation" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ImmunizationEvaluation_compartments_idx" ON "Deleted_ImmunizationEvaluation" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ImmunizationRecommendation" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ImmunizationRecommendation_projectId_idx" ON "Deleted_ImmunizationRecommendation" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ImmunizationRecommendation_lastUpdated_idx" ON "Deleted_ImmunizationRecommendation" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ImmunizationRecommendation_compartments_idx" ON "Deleted_ImmunizationRecommendation" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ImplementationGuide" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ImplementationGuide_projectId_idx" ON "Deleted_ImplementationGuide" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ImplementationGuide_lastUpdated_idx" ON "Deleted_ImplementationGuide" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ImplementationGuide_compartments_idx" ON "Deleted_ImplementationGuide" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_InsurancePlan" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_InsurancePlan_projectId_idx" ON "Deleted_InsurancePlan" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_InsurancePlan_lastUpdated_idx" ON "Deleted_InsurancePlan" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_InsurancePlan_compartments_idx" ON "Deleted_InsurancePlan" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Invoice" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Invoice_projectId_idx" ON "Deleted_Invoice" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Invoice_lastUpdated_idx" ON "Deleted_Invoice" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Invoice_compartments_idx" ON "Deleted_Invoice" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Library" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Library_projectId_idx" ON "Deleted_Library" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Library_lastUpdated_idx" ON "Deleted_Library" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Library_compartments_idx" ON "Deleted_Library" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Linkage" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Linkage_projectId_idx" ON "Deleted_Linkage" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Linkage_lastUpdated_idx" ON "Deleted_Linkage" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Linkage_compartments_idx" ON "Deleted_Linkage" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_List" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_List_projectId_idx" ON "Deleted_List" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_List_lastUpdated_idx" ON "Deleted_List" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_List_compartments_idx" ON "Deleted_List" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Location" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Location_projectId_idx" ON "Deleted_Location" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Location_lastUpdated_idx" ON "Deleted_Location" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Location_compartments_idx" ON "Deleted_Location" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Measure" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Measure_projectId_idx" ON "Deleted_Measure" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Measure_lastUpdated_idx" ON "Deleted_Measure" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Measure_compartments_idx" ON "Deleted_Measure" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_MeasureReport" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MeasureReport_projectId_idx" ON "Deleted_MeasureReport" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MeasureReport_lastUpdated_idx" ON "Deleted_MeasureReport" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MeasureReport_compartments_idx" ON "Deleted_MeasureReport" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Media" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Media_projectId_idx" ON "Deleted_Media" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Media_lastUpdated_idx" ON "Deleted_Media" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Media_compartments_idx" ON "Deleted_Media" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Medication" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Medication_projectId_idx" ON "Deleted_Medication" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Medication_lastUpdated_idx" ON "Deleted_Medication" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Medication_compartments_idx" ON "Deleted_Medication" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_MedicationAdministration" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicationAdministration_projectId_idx" ON "Deleted_MedicationAdministration" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicationAdministration_lastUpdated_idx" ON "Deleted_MedicationAdministration" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicationAdministration_compartments_idx" ON "Deleted_MedicationAdministration" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_MedicationDispense" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicationDispense_projectId_idx" ON "Deleted_MedicationDispense" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicationDispense_lastUpdated_idx" ON "Deleted_MedicationDispense" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicationDispense_compartments_idx" ON "Deleted_MedicationDispense" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_MedicationKnowledge" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicationKnowledge_projectId_idx" ON "Deleted_MedicationKnowledge" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicationKnowledge_lastUpdated_idx" ON "Deleted_MedicationKnowledge" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicationKnowledge_compartments_idx" ON "Deleted_MedicationKnowledge" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_MedicationRequest" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicationRequest_projectId_idx" ON "Deleted_MedicationRequest" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicationRequest_lastUpdated_idx" ON "Deleted_MedicationRequest" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicationRequest_compartments_idx" ON "Deleted_MedicationRequest" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_MedicationStatement" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicationStatement_projectId_idx" ON "Deleted_MedicationStatement" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicationStatement_lastUpdated_idx" ON "Deleted_MedicationStatement" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicationStatement_compartments_idx" ON "Deleted_MedicationStatement" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_MedicinalProduct" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicinalProduct_projectId_idx" ON "Deleted_MedicinalProduct" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicinalProduct_lastUpdated_idx" ON "Deleted_MedicinalProduct" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicinalProduct_compartments_idx" ON "Deleted_MedicinalProduct" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_MedicinalProductAuthorization" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MPA_projectId_idx" ON "Deleted_MedicinalProductAuthorization" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MPA_lastUpdated_idx" ON "Deleted_MedicinalProductAuthorization" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MPA_compartments_idx" ON "Deleted_MedicinalProductAuthorization" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_MedicinalProductContraindication" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MPC_projectId_idx" ON "Deleted_MedicinalProductContraindication" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MPC_lastUpdated_idx" ON "Deleted_MedicinalProductContraindication" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MPC_compartments_idx" ON "Deleted_MedicinalProductContraindication" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_MedicinalProductIndication" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicinalProductIndication_projectId_idx" ON "Deleted_MedicinalProductIndication" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicinalProductIndication_lastUpdated_idx" ON "Deleted_MedicinalProductIndication" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicinalProductIndication_compartments_idx" ON "Deleted_MedicinalProductIndication" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_MedicinalProductIngredient" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicinalProductIngredient_projectId_idx" ON "Deleted_MedicinalProductIngredient" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicinalProductIngredient_lastUpdated_idx" ON "Deleted_MedicinalProductIngredient" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicinalProductIngredient_compartments_idx" ON "Deleted_MedicinalProductIngredient" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_MedicinalProductInteraction" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicinalProductInteraction_projectId_idx" ON "Deleted_MedicinalProductInteraction" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicinalProductInteraction_lastUpdated_idx" ON "Deleted_MedicinalProductInteraction" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicinalProductInteraction_compartments_idx" ON "Deleted_MedicinalProductInteraction" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_MedicinalProductManufactured" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicinalProductManufactured_projectId_idx" ON "Deleted_MedicinalProductManufactured" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicinalProductManufactured_lastUpdated_idx" ON "Deleted_MedicinalProductManufactured" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicinalProductManufactured_compartments_idx" ON "Deleted_MedicinalProductManufactured" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_MedicinalProductPackaged" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicinalProductPackaged_projectId_idx" ON "Deleted_MedicinalProductPackaged" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicinalProductPackaged_lastUpdated_idx" ON "Deleted_MedicinalProductPackaged" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MedicinalProductPackaged_compartments_idx" ON "Deleted_MedicinalProductPackaged" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_MedicinalProductPharmaceutical" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MPP_projectId_idx" ON "Deleted_MedicinalProductPharmaceutical" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MPP_lastUpdated_idx" ON "Deleted_MedicinalProductPharmaceutical" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MPP_compartments_idx" ON "Deleted_MedicinalProductPharmaceutical" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_MedicinalProductUndesirableEffect" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MPUE_projectId_idx" ON "Deleted_MedicinalProductUndesirableEffect" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MPUE_lastUpdated_idx" ON "Deleted_MedicinalProductUndesirableEffect" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MPUE_compartments_idx" ON "Deleted_MedicinalProductUndesirableEffect" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_MessageDefinition" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MessageDefinition_projectId_idx" ON "Deleted_MessageDefinition" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MessageDefinition_lastUpdated_idx" ON "Deleted_MessageDefinition" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MessageDefinition_compartments_idx" ON "Deleted_MessageDefinition" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_MessageHeader" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MessageHeader_projectId_idx" ON "Deleted_MessageHeader" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MessageHeader_lastUpdated_idx" ON "Deleted_MessageHeader" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MessageHeader_compartments_idx" ON "Deleted_MessageHeader" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_MolecularSequence" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MolecularSequence_projectId_idx" ON "Deleted_MolecularSequence" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MolecularSequence_lastUpdated_idx" ON "Deleted_MolecularSequence" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_MolecularSequence_compartments_idx" ON "Deleted_MolecularSequence" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_NamingSystem" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_NamingSystem_projectId_idx" ON "Deleted_NamingSystem" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_NamingSystem_lastUpdated_idx" ON "Deleted_NamingSystem" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_NamingSystem_compartments_idx" ON "Deleted_NamingSystem" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_NutritionOrder" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_NutritionOrder_projectId_idx" ON "Deleted_NutritionOrder" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_NutritionOrder_lastUpdated_idx" ON "Deleted_NutritionOrder" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_NutritionOrder_compartments_idx" ON "Deleted_NutritionOrder" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Observation" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Observation_projectId_idx" ON "Deleted_Observation" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Observation_lastUpdated_idx" ON "Deleted_Observation" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Observation_compartments_idx" ON "Deleted_Observation" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ObservationDefinition" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ObservationDefinition_projectId_idx" ON "Deleted_ObservationDefinition" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ObservationDefinition_lastUpdated_idx" ON "Deleted_ObservationDefinition" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ObservationDefinition_compartments_idx" ON "Deleted_ObservationDefinition" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_OperationDefinition" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_OperationDefinition_projectId_idx" ON "Deleted_OperationDefinition" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_OperationDefinition_lastUpdated_idx" ON "Deleted_OperationDefinition" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_OperationDefinition_compartments_idx" ON "Deleted_OperationDefinition" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_OperationOutcome" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_OperationOutcome_projectId_idx" ON "Deleted_OperationOutcome" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_OperationOutcome_lastUpdated_idx" ON "Deleted_OperationOutcome" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_OperationOutcome_compartments_idx" ON "Deleted_OperationOutcome" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Organization" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Organization_projectId_idx" ON "Deleted_Organization" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Organization_lastUpdated_idx" ON "Deleted_Organization" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Organization_compartments_idx" ON "Deleted_Organization" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_OrganizationAffiliation" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_OrganizationAffiliation_projectId_idx" ON "Deleted_OrganizationAffiliation" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_OrganizationAffiliation_lastUpdated_idx" ON "Deleted_OrganizationAffiliation" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_OrganizationAffiliation_compartments_idx" ON "Deleted_OrganizationAffiliation" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Parameters" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Parameters_projectId_idx" ON "Deleted_Parameters" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Parameters_lastUpdated_idx" ON "Deleted_Parameters" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Parameters_compartments_idx" ON "Deleted_Parameters" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Patient" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Patient_projectId_idx" ON "Deleted_Patient" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Patient_lastUpdated_idx" ON "Deleted_Patient" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Patient_compartments_idx" ON "Deleted_Patient" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_PaymentNotice" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_PaymentNotice_projectId_idx" ON "Deleted_PaymentNotice" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_PaymentNotice_lastUpdated_idx" ON "Deleted_PaymentNotice" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_PaymentNotice_compartments_idx" ON "Deleted_PaymentNotice" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_PaymentReconciliation" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_PaymentReconciliation_projectId_idx" ON "Deleted_PaymentReconciliation" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_PaymentReconciliation_lastUpdated_idx" ON "Deleted_PaymentReconciliation" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_PaymentReconciliation_compartments_idx" ON "Deleted_PaymentReconciliation" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Person" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Person_projectId_idx" ON "Deleted_Person" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Person_lastUpdated_idx" ON "Deleted_Person" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Person_compartments_idx" ON "Deleted_Person" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_PlanDefinition" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_PlanDefinition_projectId_idx" ON "Deleted_PlanDefinition" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_PlanDefinition_lastUpdated_idx" ON "Deleted_PlanDefinition" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_PlanDefinition_compartments_idx" ON "Deleted_PlanDefinition" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Practitioner" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Practitioner_projectId_idx" ON "Deleted_Practitioner" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Practitioner_lastUpdated_idx" ON "Deleted_Practitioner" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Practitioner_compartments_idx" ON "Deleted_Practitioner" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_PractitionerRole" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_PractitionerRole_projectId_idx" ON "Deleted_PractitionerRole" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_PractitionerRole_lastUpdated_idx" ON "Deleted_PractitionerRole" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_PractitionerRole_compartments_idx" ON "Deleted_PractitionerRole" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Procedure" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Procedure_projectId_idx" ON "Deleted_Procedure" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Procedure_lastUpdated_idx" ON "Deleted_Procedure" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Procedure_compartments_idx" ON "Deleted_Procedure" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Provenance" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Provenance_projectId_idx" ON "Deleted_Provenance" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Provenance_lastUpdated_idx" ON "Deleted_Provenance" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Provenance_compartments_idx" ON "Deleted_Provenance" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Questionnaire" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Questionnaire_projectId_idx" ON "Deleted_Questionnaire" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Questionnaire_lastUpdated_idx" ON "Deleted_Questionnaire" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Questionnaire_compartments_idx" ON "Deleted_Questionnaire" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_QuestionnaireResponse" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_QuestionnaireResponse_projectId_idx" ON "Deleted_QuestionnaireResponse" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_QuestionnaireResponse_lastUpdated_idx" ON "Deleted_QuestionnaireResponse" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_QuestionnaireResponse_compartments_idx" ON "Deleted_QuestionnaireResponse" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_RelatedPerson" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_RelatedPerson_projectId_idx" ON "Deleted_RelatedPerson" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_RelatedPerson_lastUpdated_idx" ON "Deleted_RelatedPerson" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_RelatedPerson_compartments_idx" ON "Deleted_RelatedPerson" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_RequestGroup" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_RequestGroup_projectId_idx" ON "Deleted_RequestGroup" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_RequestGroup_lastUpdated_idx" ON "Deleted_RequestGroup" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_RequestGroup_compartments_idx" ON "Deleted_RequestGroup" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ResearchDefinition" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ResearchDefinition_projectId_idx" ON "Deleted_ResearchDefinition" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ResearchDefinition_lastUpdated_idx" ON "Deleted_ResearchDefinition" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ResearchDefinition_compartments_idx" ON "Deleted_ResearchDefinition" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ResearchElementDefinition" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ResearchElementDefinition_projectId_idx" ON "Deleted_ResearchElementDefinition" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ResearchElementDefinition_lastUpdated_idx" ON "Deleted_ResearchElementDefinition" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ResearchElementDefinition_compartments_idx" ON "Deleted_ResearchElementDefinition" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ResearchStudy" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ResearchStudy_projectId_idx" ON "Deleted_ResearchStudy" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ResearchStudy_lastUpdated_idx" ON "Deleted_ResearchStudy" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ResearchStudy_compartments_idx" ON "Deleted_ResearchStudy" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ResearchSubject" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ResearchSubject_projectId_idx" ON "Deleted_ResearchSubject" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ResearchSubject_lastUpdated_idx" ON "Deleted_ResearchSubject" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ResearchSubject_compartments_idx" ON "Deleted_ResearchSubject" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_RiskAssessment" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_RiskAssessment_projectId_idx" ON "Deleted_RiskAssessment" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_RiskAssessment_lastUpdated_idx" ON "Deleted_RiskAssessment" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_RiskAssessment_compartments_idx" ON "Deleted_RiskAssessment" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_RiskEvidenceSynthesis" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_RiskEvidenceSynthesis_projectId_idx" ON "Deleted_RiskEvidenceSynthesis" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_RiskEvidenceSynthesis_lastUpdated_idx" ON "Deleted_RiskEvidenceSynthesis" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_RiskEvidenceSynthesis_compartments_idx" ON "Deleted_RiskEvidenceSynthesis" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Schedule" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Schedule_projectId_idx" ON "Deleted_Schedule" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Schedule_lastUpdated_idx" ON "Deleted_Schedule" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Schedule_compartments_idx" ON "Deleted_Schedule" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_SearchParameter" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SearchParameter_projectId_idx" ON "Deleted_SearchParameter" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SearchParameter_lastUpdated_idx" ON "Deleted_SearchParameter" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SearchParameter_compartments_idx" ON "Deleted_SearchParameter" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ServiceRequest" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ServiceRequest_projectId_idx" ON "Deleted_ServiceRequest" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ServiceRequest_lastUpdated_idx" ON "Deleted_ServiceRequest" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ServiceRequest_compartments_idx" ON "Deleted_ServiceRequest" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Slot" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Slot_projectId_idx" ON "Deleted_Slot" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Slot_lastUpdated_idx" ON "Deleted_Slot" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Slot_compartments_idx" ON "Deleted_Slot" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Specimen" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Specimen_projectId_idx" ON "Deleted_Specimen" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Specimen_lastUpdated_idx" ON "Deleted_Specimen" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Specimen_compartments_idx" ON "Deleted_Specimen" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_SpecimenDefinition" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SpecimenDefinition_projectId_idx" ON "Deleted_SpecimenDefinition" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SpecimenDefinition_lastUpdated_idx" ON "Deleted_SpecimenDefinition" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SpecimenDefinition_compartments_idx" ON "Deleted_SpecimenDefinition" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_StructureDefinition" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_StructureDefinition_projectId_idx" ON "Deleted_StructureDefinition" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_StructureDefinition_lastUpdated_idx" ON "Deleted_StructureDefinition" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_StructureDefinition_compartments_idx" ON "Deleted_StructureDefinition" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_StructureMap" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_StructureMap_projectId_idx" ON "Deleted_StructureMap" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_StructureMap_lastUpdated_idx" ON "Deleted_StructureMap" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_StructureMap_compartments_idx" ON "Deleted_StructureMap" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Subscription" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Subscription_projectId_idx" ON "Deleted_Subscription" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Subscription_lastUpdated_idx" ON "Deleted_Subscription" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Subscription_compartments_idx" ON "Deleted_Subscription" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_SubscriptionStatus" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubscriptionStatus_projectId_idx" ON "Deleted_SubscriptionStatus" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubscriptionStatus_lastUpdated_idx" ON "Deleted_SubscriptionStatus" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubscriptionStatus_compartments_idx" ON "Deleted_SubscriptionStatus" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Substance" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Substance_projectId_idx" ON "Deleted_Substance" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Substance_lastUpdated_idx" ON "Deleted_Substance" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Substance_compartments_idx" ON "Deleted_Substance" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_SubstanceNucleicAcid" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubstanceNucleicAcid_projectId_idx" ON "Deleted_SubstanceNucleicAcid" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubstanceNucleicAcid_lastUpdated_idx" ON "Deleted_SubstanceNucleicAcid" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubstanceNucleicAcid_compartments_idx" ON "Deleted_SubstanceNucleicAcid" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_SubstancePolymer" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubstancePolymer_projectId_idx" ON "Deleted_SubstancePolymer" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubstancePolymer_lastUpdated_idx" ON "Deleted_SubstancePolymer" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubstancePolymer_compartments_idx" ON "Deleted_SubstancePolymer" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_SubstanceProtein" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubstanceProtein_projectId_idx" ON "Deleted_SubstanceProtein" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubstanceProtein_lastUpdated_idx" ON "Deleted_SubstanceProtein" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubstanceProtein_compartments_idx" ON "Deleted_SubstanceProtein" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_SubstanceReferenceInformation" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubstanceReferenceInformation_projectId_idx" ON "Deleted_SubstanceReferenceInformation" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubstanceReferenceInformation_lastUpdated_idx" ON "Deleted_SubstanceReferenceInformation" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubstanceReferenceInformation_compartments_idx" ON "Deleted_SubstanceReferenceInformation" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_SubstanceSourceMaterial" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubstanceSourceMaterial_projectId_idx" ON "Deleted_SubstanceSourceMaterial" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubstanceSourceMaterial_lastUpdated_idx" ON "Deleted_SubstanceSourceMaterial" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubstanceSourceMaterial_compartments_idx" ON "Deleted_SubstanceSourceMaterial" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_SubstanceSpecification" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubstanceSpecification_projectId_idx" ON "Deleted_SubstanceSpecification" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubstanceSpecification_lastUpdated_idx" ON "Deleted_SubstanceSpecification" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SubstanceSpecification_compartments_idx" ON "Deleted_SubstanceSpecification" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_SupplyDelivery" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SupplyDelivery_projectId_idx" ON "Deleted_SupplyDelivery" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SupplyDelivery_lastUpdated_idx" ON "Deleted_SupplyDelivery" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SupplyDelivery_compartments_idx" ON "Deleted_SupplyDelivery" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_SupplyRequest" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SupplyRequest_projectId_idx" ON "Deleted_SupplyRequest" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SupplyRequest_lastUpdated_idx" ON "Deleted_SupplyRequest" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SupplyRequest_compartments_idx" ON "Deleted_SupplyRequest" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Task" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Task_projectId_idx" ON "Deleted_Task" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Task_lastUpdated_idx" ON "Deleted_Task" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Task_compartments_idx" ON "Deleted_Task" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_TerminologyCapabilities" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_TerminologyCapabilities_projectId_idx" ON "Deleted_TerminologyCapabilities" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_TerminologyCapabilities_lastUpdated_idx" ON "Deleted_TerminologyCapabilities" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_TerminologyCapabilities_compartments_idx" ON "Deleted_TerminologyCapabilities" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_TestReport" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_TestReport_projectId_idx" ON "Deleted_TestReport" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_TestReport_lastUpdated_idx" ON "Deleted_TestReport" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_TestReport_compartments_idx" ON "Deleted_TestReport" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_TestScript" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_TestScript_projectId_idx" ON "Deleted_TestScript" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_TestScript_lastUpdated_idx" ON "Deleted_TestScript" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_TestScript_compartments_idx" ON "Deleted_TestScript" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ValueSet" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ValueSet_projectId_idx" ON "Deleted_ValueSet" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ValueSet_lastUpdated_idx" ON "Deleted_ValueSet" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ValueSet_compartments_idx" ON "Deleted_ValueSet" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_VerificationResult" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_VerificationResult_projectId_idx" ON "Deleted_VerificationResult" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_VerificationResult_lastUpdated_idx" ON "Deleted_VerificationResult" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_VerificationResult_compartments_idx" ON "Deleted_VerificationResult" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_VisionPrescription" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_VisionPrescription_projectId_idx" ON "Deleted_VisionPrescription" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_VisionPrescription_lastUpdated_idx" ON "Deleted_VisionPrescription" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_VisionPrescription_compartments_idx" ON "Deleted_VisionPrescription" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Project" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Project_projectId_idx" ON "Deleted_Project" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Project_lastUpdated_idx" ON "Deleted_Project" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Project_compartments_idx" ON "Deleted_Project" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ClientApplication" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ClientApplication_projectId_idx" ON "Deleted_ClientApplication" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ClientApplication_lastUpdated_idx" ON "Deleted_ClientApplication" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ClientApplication_compartments_idx" ON "Deleted_ClientApplication" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_User" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_User_projectId_idx" ON "Deleted_User" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_User_lastUpdated_idx" ON "Deleted_User" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_User_compartments_idx" ON "Deleted_User" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_ProjectMembership" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ProjectMembership_projectId_idx" ON "Deleted_ProjectMembership" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ProjectMembership_lastUpdated_idx" ON "Deleted_ProjectMembership" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_ProjectMembership_compartments_idx" ON "Deleted_ProjectMembership" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Bot" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Bot_projectId_idx" ON "Deleted_Bot" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Bot_lastUpdated_idx" ON "Deleted_Bot" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Bot_compartments_idx" ON "Deleted_Bot" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Login" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Login_projectId_idx" ON "Deleted_Login" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Login_lastUpdated_idx" ON "Deleted_Login" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Login_compartments_idx" ON "Deleted_Login" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_UserSecurityRequest" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_UserSecurityRequest_projectId_idx" ON "Deleted_UserSecurityRequest" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_UserSecurityRequest_lastUpdated_idx" ON "Deleted_UserSecurityRequest" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_UserSecurityRequest_compartments_idx" ON "Deleted_UserSecurityRequest" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_JsonWebKey" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_JsonWebKey_projectId_idx" ON "Deleted_JsonWebKey" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_JsonWebKey_lastUpdated_idx" ON "Deleted_JsonWebKey" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_JsonWebKey_compartments_idx" ON "Deleted_JsonWebKey" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_AccessPolicy" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_AccessPolicy_projectId_idx" ON "Deleted_AccessPolicy" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_AccessPolicy_lastUpdated_idx" ON "Deleted_AccessPolicy" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_AccessPolicy_compartments_idx" ON "Deleted_AccessPolicy" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_UserConfiguration" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_UserConfiguration_projectId_idx" ON "Deleted_UserConfiguration" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_UserConfiguration_lastUpdated_idx" ON "Deleted_UserConfiguration" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_UserConfiguration_compartments_idx" ON "Deleted_UserConfiguration" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_BulkDataExport" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_BulkDataExport_projectId_idx" ON "Deleted_BulkDataExport" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_BulkDataExport_lastUpdated_idx" ON "Deleted_BulkDataExport" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_BulkDataExport_compartments_idx" ON "Deleted_BulkDataExport" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_SmartAppLaunch" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SmartAppLaunch_projectId_idx" ON "Deleted_SmartAppLaunch" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SmartAppLaunch_lastUpdated_idx" ON "Deleted_SmartAppLaunch" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_SmartAppLaunch_compartments_idx" ON "Deleted_SmartAppLaunch" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_DomainConfiguration" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DomainConfiguration_projectId_idx" ON "Deleted_DomainConfiguration" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DomainConfiguration_lastUpdated_idx" ON "Deleted_DomainConfiguration" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_DomainConfiguration_compartments_idx" ON "Deleted_DomainConfiguration" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_AsyncJob" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_AsyncJob_projectId_idx" ON "Deleted_AsyncJob" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_AsyncJob_lastUpdated_idx" ON "Deleted_AsyncJob" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_AsyncJob_compartments_idx" ON "Deleted_AsyncJob" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Deleted_Agent" (
  "id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "compartments" UUID[] NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Agent_projectId_idx" ON "Deleted_Agent" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Agent_lastUpdated_idx" ON "Deleted_Agent" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Deleted_Agent_compartments_idx" ON "Deleted_Agent" USING gin ("compartments")`);
}
