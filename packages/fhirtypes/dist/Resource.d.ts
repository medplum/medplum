// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * This is a generated file
 * Do not edit manually.
 */

import type { AccessPolicy } from './AccessPolicy.d.ts';
import type { Account } from './Account.d.ts';
import type { ActivityDefinition } from './ActivityDefinition.d.ts';
import type { AdverseEvent } from './AdverseEvent.d.ts';
import type { Agent } from './Agent.d.ts';
import type { AllergyIntolerance } from './AllergyIntolerance.d.ts';
import type { Appointment } from './Appointment.d.ts';
import type { AppointmentResponse } from './AppointmentResponse.d.ts';
import type { AsyncJob } from './AsyncJob.d.ts';
import type { AuditEvent } from './AuditEvent.d.ts';
import type { Basic } from './Basic.d.ts';
import type { Binary } from './Binary.d.ts';
import type { BiologicallyDerivedProduct } from './BiologicallyDerivedProduct.d.ts';
import type { BodyStructure } from './BodyStructure.d.ts';
import type { Bot } from './Bot.d.ts';
import type { BulkDataExport } from './BulkDataExport.d.ts';
import type { Bundle } from './Bundle.d.ts';
import type { CapabilityStatement } from './CapabilityStatement.d.ts';
import type { CarePlan } from './CarePlan.d.ts';
import type { CareTeam } from './CareTeam.d.ts';
import type { CatalogEntry } from './CatalogEntry.d.ts';
import type { ChargeItem } from './ChargeItem.d.ts';
import type { ChargeItemDefinition } from './ChargeItemDefinition.d.ts';
import type { Claim } from './Claim.d.ts';
import type { ClaimResponse } from './ClaimResponse.d.ts';
import type { ClientApplication } from './ClientApplication.d.ts';
import type { ClinicalImpression } from './ClinicalImpression.d.ts';
import type { CodeSystem } from './CodeSystem.d.ts';
import type { Communication } from './Communication.d.ts';
import type { CommunicationRequest } from './CommunicationRequest.d.ts';
import type { CompartmentDefinition } from './CompartmentDefinition.d.ts';
import type { Composition } from './Composition.d.ts';
import type { ConceptMap } from './ConceptMap.d.ts';
import type { Condition } from './Condition.d.ts';
import type { Consent } from './Consent.d.ts';
import type { Contract } from './Contract.d.ts';
import type { Coverage } from './Coverage.d.ts';
import type { CoverageEligibilityRequest } from './CoverageEligibilityRequest.d.ts';
import type { CoverageEligibilityResponse } from './CoverageEligibilityResponse.d.ts';
import type { DetectedIssue } from './DetectedIssue.d.ts';
import type { Device } from './Device.d.ts';
import type { DeviceDefinition } from './DeviceDefinition.d.ts';
import type { DeviceMetric } from './DeviceMetric.d.ts';
import type { DeviceRequest } from './DeviceRequest.d.ts';
import type { DeviceUseStatement } from './DeviceUseStatement.d.ts';
import type { DiagnosticReport } from './DiagnosticReport.d.ts';
import type { DocumentManifest } from './DocumentManifest.d.ts';
import type { DocumentReference } from './DocumentReference.d.ts';
import type { DomainConfiguration } from './DomainConfiguration.d.ts';
import type { EffectEvidenceSynthesis } from './EffectEvidenceSynthesis.d.ts';
import type { Encounter } from './Encounter.d.ts';
import type { Endpoint } from './Endpoint.d.ts';
import type { EnrollmentRequest } from './EnrollmentRequest.d.ts';
import type { EnrollmentResponse } from './EnrollmentResponse.d.ts';
import type { EpisodeOfCare } from './EpisodeOfCare.d.ts';
import type { EventDefinition } from './EventDefinition.d.ts';
import type { Evidence } from './Evidence.d.ts';
import type { EvidenceVariable } from './EvidenceVariable.d.ts';
import type { ExampleScenario } from './ExampleScenario.d.ts';
import type { ExplanationOfBenefit } from './ExplanationOfBenefit.d.ts';
import type { FamilyMemberHistory } from './FamilyMemberHistory.d.ts';
import type { Flag } from './Flag.d.ts';
import type { Goal } from './Goal.d.ts';
import type { GraphDefinition } from './GraphDefinition.d.ts';
import type { Group } from './Group.d.ts';
import type { GuidanceResponse } from './GuidanceResponse.d.ts';
import type { HealthcareService } from './HealthcareService.d.ts';
import type { ImagingStudy } from './ImagingStudy.d.ts';
import type { Immunization } from './Immunization.d.ts';
import type { ImmunizationEvaluation } from './ImmunizationEvaluation.d.ts';
import type { ImmunizationRecommendation } from './ImmunizationRecommendation.d.ts';
import type { ImplementationGuide } from './ImplementationGuide.d.ts';
import type { InsurancePlan } from './InsurancePlan.d.ts';
import type { Invoice } from './Invoice.d.ts';
import type { JsonWebKey } from './JsonWebKey.d.ts';
import type { Library } from './Library.d.ts';
import type { Linkage } from './Linkage.d.ts';
import type { List } from './List.d.ts';
import type { Location } from './Location.d.ts';
import type { Login } from './Login.d.ts';
import type { Measure } from './Measure.d.ts';
import type { MeasureReport } from './MeasureReport.d.ts';
import type { Media } from './Media.d.ts';
import type { Medication } from './Medication.d.ts';
import type { MedicationAdministration } from './MedicationAdministration.d.ts';
import type { MedicationDispense } from './MedicationDispense.d.ts';
import type { MedicationKnowledge } from './MedicationKnowledge.d.ts';
import type { MedicationRequest } from './MedicationRequest.d.ts';
import type { MedicationStatement } from './MedicationStatement.d.ts';
import type { MedicinalProduct } from './MedicinalProduct.d.ts';
import type { MedicinalProductAuthorization } from './MedicinalProductAuthorization.d.ts';
import type { MedicinalProductContraindication } from './MedicinalProductContraindication.d.ts';
import type { MedicinalProductIndication } from './MedicinalProductIndication.d.ts';
import type { MedicinalProductIngredient } from './MedicinalProductIngredient.d.ts';
import type { MedicinalProductInteraction } from './MedicinalProductInteraction.d.ts';
import type { MedicinalProductManufactured } from './MedicinalProductManufactured.d.ts';
import type { MedicinalProductPackaged } from './MedicinalProductPackaged.d.ts';
import type { MedicinalProductPharmaceutical } from './MedicinalProductPharmaceutical.d.ts';
import type { MedicinalProductUndesirableEffect } from './MedicinalProductUndesirableEffect.d.ts';
import type { MessageDefinition } from './MessageDefinition.d.ts';
import type { MessageHeader } from './MessageHeader.d.ts';
import type { MolecularSequence } from './MolecularSequence.d.ts';
import type { NamingSystem } from './NamingSystem.d.ts';
import type { NutritionOrder } from './NutritionOrder.d.ts';
import type { Observation } from './Observation.d.ts';
import type { ObservationDefinition } from './ObservationDefinition.d.ts';
import type { OperationDefinition } from './OperationDefinition.d.ts';
import type { OperationOutcome } from './OperationOutcome.d.ts';
import type { Organization } from './Organization.d.ts';
import type { OrganizationAffiliation } from './OrganizationAffiliation.d.ts';
import type { Parameters } from './Parameters.d.ts';
import type { Patient } from './Patient.d.ts';
import type { PaymentNotice } from './PaymentNotice.d.ts';
import type { PaymentReconciliation } from './PaymentReconciliation.d.ts';
import type { Person } from './Person.d.ts';
import type { PlanDefinition } from './PlanDefinition.d.ts';
import type { Practitioner } from './Practitioner.d.ts';
import type { PractitionerRole } from './PractitionerRole.d.ts';
import type { Procedure } from './Procedure.d.ts';
import type { Project } from './Project.d.ts';
import type { ProjectMembership } from './ProjectMembership.d.ts';
import type { Provenance } from './Provenance.d.ts';
import type { Questionnaire } from './Questionnaire.d.ts';
import type { QuestionnaireResponse } from './QuestionnaireResponse.d.ts';
import type { RelatedPerson } from './RelatedPerson.d.ts';
import type { RequestGroup } from './RequestGroup.d.ts';
import type { ResearchDefinition } from './ResearchDefinition.d.ts';
import type { ResearchElementDefinition } from './ResearchElementDefinition.d.ts';
import type { ResearchStudy } from './ResearchStudy.d.ts';
import type { ResearchSubject } from './ResearchSubject.d.ts';
import type { RiskAssessment } from './RiskAssessment.d.ts';
import type { RiskEvidenceSynthesis } from './RiskEvidenceSynthesis.d.ts';
import type { Schedule } from './Schedule.d.ts';
import type { SearchParameter } from './SearchParameter.d.ts';
import type { ServiceRequest } from './ServiceRequest.d.ts';
import type { Slot } from './Slot.d.ts';
import type { SmartAppLaunch } from './SmartAppLaunch.d.ts';
import type { Specimen } from './Specimen.d.ts';
import type { SpecimenDefinition } from './SpecimenDefinition.d.ts';
import type { StructureDefinition } from './StructureDefinition.d.ts';
import type { StructureMap } from './StructureMap.d.ts';
import type { Subscription } from './Subscription.d.ts';
import type { SubscriptionStatus } from './SubscriptionStatus.d.ts';
import type { Substance } from './Substance.d.ts';
import type { SubstanceNucleicAcid } from './SubstanceNucleicAcid.d.ts';
import type { SubstancePolymer } from './SubstancePolymer.d.ts';
import type { SubstanceProtein } from './SubstanceProtein.d.ts';
import type { SubstanceReferenceInformation } from './SubstanceReferenceInformation.d.ts';
import type { SubstanceSourceMaterial } from './SubstanceSourceMaterial.d.ts';
import type { SubstanceSpecification } from './SubstanceSpecification.d.ts';
import type { SupplyDelivery } from './SupplyDelivery.d.ts';
import type { SupplyRequest } from './SupplyRequest.d.ts';
import type { Task } from './Task.d.ts';
import type { TerminologyCapabilities } from './TerminologyCapabilities.d.ts';
import type { TestReport } from './TestReport.d.ts';
import type { TestScript } from './TestScript.d.ts';
import type { User } from './User.d.ts';
import type { UserConfiguration } from './UserConfiguration.d.ts';
import type { UserSecurityRequest } from './UserSecurityRequest.d.ts';
import type { ValueSet } from './ValueSet.d.ts';
import type { VerificationResult } from './VerificationResult.d.ts';
import type { VisionPrescription } from './VisionPrescription.d.ts';

export type Resource = AccessPolicy
  | Account
  | ActivityDefinition
  | AdverseEvent
  | Agent
  | AllergyIntolerance
  | Appointment
  | AppointmentResponse
  | AsyncJob
  | AuditEvent
  | Basic
  | Binary
  | BiologicallyDerivedProduct
  | BodyStructure
  | Bot
  | BulkDataExport
  | Bundle
  | CapabilityStatement
  | CarePlan
  | CareTeam
  | CatalogEntry
  | ChargeItem
  | ChargeItemDefinition
  | Claim
  | ClaimResponse
  | ClientApplication
  | ClinicalImpression
  | CodeSystem
  | Communication
  | CommunicationRequest
  | CompartmentDefinition
  | Composition
  | ConceptMap
  | Condition
  | Consent
  | Contract
  | Coverage
  | CoverageEligibilityRequest
  | CoverageEligibilityResponse
  | DetectedIssue
  | Device
  | DeviceDefinition
  | DeviceMetric
  | DeviceRequest
  | DeviceUseStatement
  | DiagnosticReport
  | DocumentManifest
  | DocumentReference
  | DomainConfiguration
  | EffectEvidenceSynthesis
  | Encounter
  | Endpoint
  | EnrollmentRequest
  | EnrollmentResponse
  | EpisodeOfCare
  | EventDefinition
  | Evidence
  | EvidenceVariable
  | ExampleScenario
  | ExplanationOfBenefit
  | FamilyMemberHistory
  | Flag
  | Goal
  | GraphDefinition
  | Group
  | GuidanceResponse
  | HealthcareService
  | ImagingStudy
  | Immunization
  | ImmunizationEvaluation
  | ImmunizationRecommendation
  | ImplementationGuide
  | InsurancePlan
  | Invoice
  | JsonWebKey
  | Library
  | Linkage
  | List
  | Location
  | Login
  | Measure
  | MeasureReport
  | Media
  | Medication
  | MedicationAdministration
  | MedicationDispense
  | MedicationKnowledge
  | MedicationRequest
  | MedicationStatement
  | MedicinalProduct
  | MedicinalProductAuthorization
  | MedicinalProductContraindication
  | MedicinalProductIndication
  | MedicinalProductIngredient
  | MedicinalProductInteraction
  | MedicinalProductManufactured
  | MedicinalProductPackaged
  | MedicinalProductPharmaceutical
  | MedicinalProductUndesirableEffect
  | MessageDefinition
  | MessageHeader
  | MolecularSequence
  | NamingSystem
  | NutritionOrder
  | Observation
  | ObservationDefinition
  | OperationDefinition
  | OperationOutcome
  | Organization
  | OrganizationAffiliation
  | Parameters
  | Patient
  | PaymentNotice
  | PaymentReconciliation
  | Person
  | PlanDefinition
  | Practitioner
  | PractitionerRole
  | Procedure
  | Project
  | ProjectMembership
  | Provenance
  | Questionnaire
  | QuestionnaireResponse
  | RelatedPerson
  | RequestGroup
  | ResearchDefinition
  | ResearchElementDefinition
  | ResearchStudy
  | ResearchSubject
  | RiskAssessment
  | RiskEvidenceSynthesis
  | Schedule
  | SearchParameter
  | ServiceRequest
  | Slot
  | SmartAppLaunch
  | Specimen
  | SpecimenDefinition
  | StructureDefinition
  | StructureMap
  | Subscription
  | SubscriptionStatus
  | Substance
  | SubstanceNucleicAcid
  | SubstancePolymer
  | SubstanceProtein
  | SubstanceReferenceInformation
  | SubstanceSourceMaterial
  | SubstanceSpecification
  | SupplyDelivery
  | SupplyRequest
  | Task
  | TerminologyCapabilities
  | TestReport
  | TestScript
  | User
  | UserConfiguration
  | UserSecurityRequest
  | ValueSet
  | VerificationResult
  | VisionPrescription;
