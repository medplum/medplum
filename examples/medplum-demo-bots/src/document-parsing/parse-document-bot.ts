// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, ContentType } from '@medplum/core';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type {
  Binary,
  Device,
  DiagnosticReport,
  DocumentReference,
  Observation,
  Organization,
  Patient,
  Provenance,
  Reference,
} from '@medplum/fhirtypes';
import type { DocumentParsingProvider, ParsedLabReport } from './types';
import { ReductoProvider } from './providers/reducto';
import { BedrockDataAutomationProvider } from './providers/bedrock-data-automation';
import { buildContainedObservation } from './utils';

/**
 * Parse Document Bot
 *
 * Triggered by a Subscription on DocumentReference creation.
 * Sends the PDF to a configured document parsing provider (Reducto or BDA),
 * extracts structured lab data, and creates a preliminary DiagnosticReport
 * with contained Observations.
 *
 * Required Secrets:
 * - PARSING_PROVIDER: 'reducto' or 'bedrock-data-automation'
 * - AUTO_APPROVE: 'true' to skip human review and create final resources directly
 * - Provider-specific secrets (see provider implementations)
 *
 * Subscription Criteria: DocumentReference?type=lab-report
 */
export async function handler(medplum: MedplumClient, event: BotEvent<DocumentReference>): Promise<DiagnosticReport> {
  const docRef = event.input;

  // Validate input
  if (!docRef.content?.[0]?.attachment?.url) {
    throw new Error('DocumentReference has no content attachment URL');
  }

  const contentType = docRef.content[0].attachment.contentType;
  if (contentType && contentType !== 'application/pdf') {
    throw new Error(`Expected PDF content, got: ${contentType}`);
  }

  // Get configuration from secrets
  const config = extractConfig(event.secrets);
  const provider = createProvider(config.providerName);
  const autoApprove = config.autoApprove;

  // Get the document URL for the parsing provider
  const documentUrl = await getDocumentUrl(medplum, docRef);

  // Call the parsing provider
  console.log(`Parsing document with ${provider.name}...`);
  const parsedReport = await provider.parseDocument(documentUrl, config.providerConfig);
  console.log(`Parsed ${parsedReport.results.length} test results`);

  // Store raw parsed JSON as a Binary for audit/review
  const parsedJsonBinary = await medplum.createResource<Binary>({
    resourceType: 'Binary',
    contentType: ContentType.JSON,
    data: Buffer.from(JSON.stringify(parsedReport, null, 2)).toString('base64'),
  });

  // Find or create the performing Organization
  const performingOrg = await findOrCreatePerformingOrg(medplum, parsedReport);

  // Build contained Observations
  const subject = docRef.subject as Reference<Patient>;
  const performerRef = createReference(performingOrg);
  const containedObservations: Observation[] = parsedReport.results.map((result, index) =>
    buildContainedObservation(result, index, subject, performerRef)
  );

  // Create the DiagnosticReport
  const reportStatus = autoApprove ? 'final' : 'preliminary';
  const diagnosticReport = await medplum.createResource<DiagnosticReport>({
    resourceType: 'DiagnosticReport',
    status: reportStatus,
    code: {
      text: 'Laboratory Report',
      coding: [
        {
          system: 'http://loinc.org',
          code: '11502-2',
          display: 'Laboratory report',
        },
      ],
    },
    subject,
    issued: parsedReport.reportDate || new Date().toISOString(),
    performer: [performerRef],
    contained: containedObservations,
    result: containedObservations.map((obs) => ({
      reference: `#${obs.id}`,
      display: obs.code?.text,
    })),
    presentedForm: [
      {
        url: docRef.content[0].attachment.url,
        contentType: 'application/pdf',
        title: 'Original Lab Report PDF',
      },
    ],
    extension: [
      {
        url: 'http://medplum.com/fhir/StructureDefinition/parsed-data-binary',
        valueReference: createReference(parsedJsonBinary),
      },
      {
        url: 'http://medplum.com/fhir/StructureDefinition/parsing-provider',
        valueString: provider.name,
      },
    ],
  });

  // Create Provenance to track AI extraction
  await createProvenance(medplum, diagnosticReport, docRef, event, provider.name, parsedReport);

  console.log(`Created DiagnosticReport/${diagnosticReport.id} with status=${reportStatus}`);
  return diagnosticReport;
}

/**
 * Extract configuration from bot secrets into a structured format.
 */
function extractConfig(secrets: Record<string, { valueString?: string }>): {
  providerName: string;
  autoApprove: boolean;
  providerConfig: Record<string, string>;
} {
  const providerName = secrets['PARSING_PROVIDER']?.valueString;
  if (!providerName) {
    throw new Error('PARSING_PROVIDER secret is required');
  }

  const autoApprove = secrets['AUTO_APPROVE']?.valueString === 'true';

  // Collect all secrets as a flat config map for the provider
  const providerConfig: Record<string, string> = {};
  for (const [key, value] of Object.entries(secrets)) {
    if (value.valueString) {
      providerConfig[key] = value.valueString;
    }
  }

  return { providerName, autoApprove, providerConfig };
}

/**
 * Create the appropriate parsing provider based on configuration.
 */
function createProvider(providerName: string): DocumentParsingProvider {
  switch (providerName) {
    case 'reducto':
      return new ReductoProvider();
    case 'bedrock-data-automation':
      return new BedrockDataAutomationProvider();
    default:
      throw new Error(`Unknown parsing provider: ${providerName}`);
  }
}

/**
 * Get a URL for the document that the parsing provider can access.
 * For Reducto: uses a presigned download URL.
 * For BDA: uses the S3 URI directly.
 */
async function getDocumentUrl(medplum: MedplumClient, docRef: DocumentReference): Promise<string> {
  const attachmentUrl = docRef.content![0].attachment!.url!;

  // If it's already a full URL (e.g., presigned or public), use it directly
  if (attachmentUrl.startsWith('http://') || attachmentUrl.startsWith('https://')) {
    return attachmentUrl;
  }

  // If it's a Binary reference, download and get the URL
  if (attachmentUrl.startsWith('Binary/')) {
    // Use the Medplum fhirUrl to construct a download URL
    return medplum.fhirUrl(attachmentUrl).toString();
  }

  return attachmentUrl;
}

/**
 * Find an existing Organization by CLIA number or NPI, or create a new one.
 */
async function findOrCreatePerformingOrg(
  medplum: MedplumClient,
  parsedReport: ParsedLabReport
): Promise<Organization> {
  const lab = parsedReport.performingLab;

  // Try to find by CLIA number first
  if (lab.cliaNumber) {
    const existing = await medplum.searchOne('Organization', {
      identifier: `urn:oid:2.16.840.1.113883.4.7|${lab.cliaNumber}`,
    });
    if (existing) {
      return existing;
    }
  }

  // Try to find by NPI
  if (lab.npi) {
    const existing = await medplum.searchOne('Organization', {
      identifier: `http://hl7.org/fhir/sid/us-npi|${lab.npi}`,
    });
    if (existing) {
      return existing;
    }
  }

  // Try to find by name
  const existingByName = await medplum.searchOne('Organization', { name: lab.name });
  if (existingByName) {
    return existingByName;
  }

  // Create a new Organization
  const org: Organization = {
    resourceType: 'Organization',
    name: lab.name,
    identifier: [],
  };

  if (lab.cliaNumber) {
    org.identifier!.push({
      system: 'urn:oid:2.16.840.1.113883.4.7',
      value: lab.cliaNumber,
    });
  }

  if (lab.npi) {
    org.identifier!.push({
      system: 'http://hl7.org/fhir/sid/us-npi',
      value: lab.npi,
    });
  }

  if (lab.phone) {
    org.telecom = [{ system: 'phone', value: lab.phone }];
  }

  return medplum.createResource(org);
}

/**
 * Create a Provenance resource to track that this DiagnosticReport was created
 * via AI-powered document extraction.
 */
async function createProvenance(
  medplum: MedplumClient,
  report: DiagnosticReport,
  docRef: DocumentReference,
  event: BotEvent<DocumentReference>,
  providerName: string,
  parsedReport: ParsedLabReport
): Promise<Provenance> {
  const agents: Provenance['agent'] = [
    {
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
            code: 'assembler',
            display: 'Assembler',
          },
        ],
      },
      who: { reference: event.bot.reference, display: 'Parsing Bot' } as Reference<Device>,
    },
  ];

  // Add ordering provider as an agent if available
  if (parsedReport.orderingProvider) {
    agents.push({
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
            code: 'enterer',
            display: 'Enterer',
          },
        ],
      },
      who: {
        display: parsedReport.orderingProvider.name,
        ...(parsedReport.orderingProvider.npi
          ? {
              identifier: {
                system: 'http://hl7.org/fhir/sid/us-npi',
                value: parsedReport.orderingProvider.npi,
              },
            }
          : {}),
      },
    });
  }

  return medplum.createResource<Provenance>({
    resourceType: 'Provenance',
    target: [createReference(report)],
    recorded: new Date().toISOString(),
    activity: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-DataOperation',
          code: 'CREATE',
          display: 'create',
        },
      ],
      text: `AI-extracted lab report via ${providerName}`,
    },
    agent: agents,
    entity: [
      {
        role: 'source',
        what: createReference(docRef),
      },
    ],
  });
}
