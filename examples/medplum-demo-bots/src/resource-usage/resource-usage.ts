// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Bundle, BundleEntry, Project } from '@medplum/fhirtypes';

// Email address to receive the resource usage report
const REPORT_EMAIL = 'admin@example.com';

/**
 * Bot handler to generate and email a resource usage report for the current project.
 * This bot counts all resources by type in the project and sends a CSV report via email.
 *
 * @param medplum - The Medplum client instance
 * @param event - The bot event trigger
 * @returns A success message with the project ID processed
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<{ success: boolean }> {
  // Get the current project from the bot's metadata
  const bot = await medplum.readReference(event.bot);
  const projectId = bot.meta?.project as string;

  // Validate that we can determine the project ID
  if (!projectId) {
    console.warn('Could not determine project id');
  }

  console.log('Generating resource usage report for project:', projectId);

  // Fetch the project resource to get its name
  const project = projectId ? await medplum.readResource('Project', projectId) : undefined;
  if (project) {
    console.log('Project name:', project.name);
  }
  // Get counts for all resource types in this project
  const counts = await getCountsByResourceType(medplum, projectId);

  // Generate CSV content
  const csvContent = generateCsvReport(project, counts);

  // Send the report via email
  await medplum.sendEmail({
    to: REPORT_EMAIL,
    subject: `Resource Usage Report - ${project?.name || projectId || 'Unknown'}`,
    text: `Please find attached the resource usage report for project "${project?.name || projectId || 'Unknown'}".\n\nGenerated: ${new Date().toISOString()}`,
    attachments: [
      {
        filename: `resource-usage-${projectId}-${new Date().toISOString().split('T')[0]}.csv`,
        content: csvContent,
      },
    ],
  });

  console.log(`Resource usage report emailed to ${REPORT_EMAIL}`);

  return { success: true };
}

/**
 * Generates a CSV report from the resource counts.
 *
 * @param project - The project being reported on
 * @param counts - A map of resource type to count
 * @returns CSV string content with BOM for Excel compatibility
 */
function generateCsvReport(project: Project | undefined, counts: Record<string, number>): string {
  // Build CSV rows
  const output: string[][] = [
    ['Project', project?.name || project?.id || 'Unknown'],
    ['Generated', new Date().toISOString()],
    [], // Empty row for spacing
    ['Resource Type', 'Count'],
  ];

  // Create array of [resourceType, count] pairs and sort by count descending
  const resourceTypesWithCounts = RESOURCE_TYPES.map((resourceType) => ({
    resourceType,
    count: counts[resourceType] || 0,
  })).sort((a, b) => b.count - a.count);

  // Add sorted resource types to output
  for (const { resourceType, count } of resourceTypesWithCounts) {
    output.push([resourceType, count.toString()]);
  }

  return output.map((row) => row.join(',')).join('\n');
}

/**
 * Fetches resource counts for all FHIR resource types in a project.
 * Uses a batch request to efficiently query all resource types at once.
 *
 * @param medplum - The Medplum client instance
 * @param projectId - The project ID to get counts for
 * @returns A map of resource type to count
 */
async function getCountsByResourceType(
  medplum: MedplumClient,
  projectId: string | undefined
): Promise<Record<string, number>> {
  // Build a batch bundle with count queries for each resource type
  const request: Bundle = {
    resourceType: 'Bundle',
    type: 'batch',
    entry: RESOURCE_TYPES.map((resourceType: string) => ({
      request: {
        method: 'GET',
        url: `${resourceType}?_summary=count${projectId ? `&_project=${projectId}` : ''}`,
      },
    })),
  };

  console.log(`Fetching counts for ${RESOURCE_TYPES.length} resource types...`);

  // Execute the batch request
  const response = await medplum.executeBatch(request);

  // Extract counts from the response
  const counts = (response.entry as BundleEntry[]).map((entry: BundleEntry) => {
    return ((entry.resource as Bundle)?.total as number) ?? NaN;
  });

  console.log('Successfully retrieved resource counts');

  // Convert to a map of resource type -> count
  return Object.fromEntries(counts.map((c, index) => [RESOURCE_TYPES[index], c]));
}

/**
 * List of all FHIR resource types to count in the report.
 * This includes both standard FHIR resources and Medplum-specific resources.
 */
export const RESOURCE_TYPES = [
  'Account',
  'ActivityDefinition',
  'AdverseEvent',
  'Agent',
  'AllergyIntolerance',
  'Appointment',
  'AppointmentResponse',
  'AsyncJob',
  'AuditEvent',
  'Basic',
  'BiologicallyDerivedProduct',
  'BodyStructure',
  'Bot',
  'BulkDataExport',
  'Bundle',
  'CapabilityStatement',
  'CarePlan',
  'CareTeam',
  'CatalogEntry',
  'ChargeItem',
  'ChargeItemDefinition',
  'Claim',
  'ClaimResponse',
  'ClientApplication',
  'ClinicalImpression',
  'CodeSystem',
  'Communication',
  'CommunicationRequest',
  'CompartmentDefinition',
  'Composition',
  'ConceptMap',
  'Condition',
  'Consent',
  'Contract',
  'Coverage',
  'CoverageEligibilityRequest',
  'CoverageEligibilityResponse',
  'DetectedIssue',
  'Device',
  'DeviceDefinition',
  'DeviceMetric',
  'DeviceRequest',
  'DeviceUseStatement',
  'DiagnosticReport',
  'DocumentManifest',
  'DocumentReference',
  'DomainConfiguration',
  'EffectEvidenceSynthesis',
  'Encounter',
  'Endpoint',
  'EnrollmentRequest',
  'EnrollmentResponse',
  'EpisodeOfCare',
  'EventDefinition',
  'Evidence',
  'EvidenceVariable',
  'ExampleScenario',
  'ExplanationOfBenefit',
  'FamilyMemberHistory',
  'Flag',
  'Goal',
  'GraphDefinition',
  'Group',
  'GuidanceResponse',
  'HealthcareService',
  'ImagingStudy',
  'Immunization',
  'ImmunizationEvaluation',
  'ImmunizationRecommendation',
  'ImplementationGuide',
  'InsurancePlan',
  'Invoice',
  'JsonWebKey',
  'Library',
  'Linkage',
  'List',
  'Location',
  'Login',
  'Measure',
  'MeasureReport',
  'Media',
  'Medication',
  'MedicationAdministration',
  'MedicationDispense',
  'MedicationKnowledge',
  'MedicationRequest',
  'MedicationStatement',
  'MedicinalProduct',
  'MedicinalProductAuthorization',
  'MedicinalProductContraindication',
  'MedicinalProductIndication',
  'MedicinalProductIngredient',
  'MedicinalProductInteraction',
  'MedicinalProductManufactured',
  'MedicinalProductPackaged',
  'MedicinalProductPharmaceutical',
  'MedicinalProductUndesirableEffect',
  'MessageDefinition',
  'MessageHeader',
  'MolecularSequence',
  'NamingSystem',
  'NutritionOrder',
  'Observation',
  'ObservationDefinition',
  'OperationDefinition',
  'OperationOutcome',
  'Organization',
  'OrganizationAffiliation',
  'Parameters',
  'PasswordChangeRequest',
  'Patient',
  'PaymentNotice',
  'PaymentReconciliation',
  'Person',
  'PlanDefinition',
  'Practitioner',
  'PractitionerRole',
  'Procedure',
  'Project',
  'ProjectMembership',
  'Provenance',
  'Questionnaire',
  'QuestionnaireResponse',
  'RelatedPerson',
  'RequestGroup',
  'ResearchDefinition',
  'ResearchElementDefinition',
  'ResearchStudy',
  'ResearchSubject',
  'RiskAssessment',
  'RiskEvidenceSynthesis',
  'Schedule',
  'SearchParameter',
  'ServiceRequest',
  'Slot',
  'SmartAppLaunch',
  'Specimen',
  'SpecimenDefinition',
  'StructureDefinition',
  'StructureMap',
  'Subscription',
  'SubscriptionStatus',
  'Substance',
  'SubstanceNucleicAcid',
  'SubstancePolymer',
  'SubstanceProtein',
  'SubstanceReferenceInformation',
  'SubstanceSourceMaterial',
  'SubstanceSpecification',
  'SupplyDelivery',
  'SupplyRequest',
  'Task',
  'TerminologyCapabilities',
  'TestReport',
  'TestScript',
  'User',
  'UserConfiguration',
  'ValueSet',
  'VerificationResult',
  'VisionPrescription',
];
