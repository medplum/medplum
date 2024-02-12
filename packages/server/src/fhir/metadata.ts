import { ContentType, getAllDataTypes, getSearchParameters, InternalTypeSchema, isResourceType } from '@medplum/core';
import {
  CapabilityStatement,
  CapabilityStatementRest,
  CapabilityStatementRestResource,
  CapabilityStatementRestResourceOperation,
  CapabilityStatementRestResourceSearchParam,
  CapabilityStatementRestSecurity,
  ResourceType,
} from '@medplum/fhirtypes';
import { getConfig, MedplumServerConfig } from '../config';

/**
 * The base CapabilityStatement that seeds the server generated statement.
 */
const baseStmt: CapabilityStatement = {
  resourceType: 'CapabilityStatement',
  id: 'medplum-server',
  url: 'http://hl7.org/fhir/us/core/CapabilityStatement/us-core-server',
  version: '0.9.34',
  name: 'MedplumCapabilityStatement',
  title: 'Medplum Capability Statement',
  status: 'active',
  date: '2022-09-02',
  publisher: 'Medplum',
  contact: [
    {
      telecom: [
        {
          system: 'url',
          value: 'https://www.medplum.com',
        },
      ],
    },
  ],
  description: 'Medplum FHIR Capability Statement',
  jurisdiction: [
    {
      coding: [
        {
          system: 'urn:iso:std:iso:3166',
          code: 'US',
          display: 'United States of America',
        },
      ],
    },
  ],
  kind: 'instance',
  instantiates: [
    'http://hl7.org/fhir/us/core/CapabilityStatement/us-core-server',
    'http://hl7.org/fhir/uv/bulkdata/CapabilityStatement/bulk-data',
  ],
  fhirVersion: '4.0.1',
  format: ['json'],
  patchFormat: [ContentType.JSON_PATCH],
};

/**
 * A list of profiles that represent different use cases supported by the system.
 *
 * For a server, "supported by the system" means the system hosts/produces a set of resources that are conformant to a
 * particular profile, and allows clients that use its services to search using this profile and to find appropriate
 * data. For a client, it means the system will search by this profile and process data according to the guidance
 * implicit in the profile.
 *
 * See: https://www.hl7.org/fhir/capabilitystatement-definitions.html#CapabilityStatement.rest.resource.supportedProfile
 */
const supportedProfiles: Record<string, string[]> = {
  AllergyIntolerance: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-allergyintolerance'],
  CarePlan: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-careplan'],
  CareTeam: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-careteam'],
  Condition: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition'],
  Device: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-implantable-device'],
  DiagnosticReport: [
    'http://hl7.org/fhir/us/core/StructureDefinition/us-core-diagnosticreport-note',
    'http://hl7.org/fhir/us/core/StructureDefinition/us-core-diagnosticreport-lab',
  ],
  DocumentReference: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-documentreference'],
  Encounter: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-encounter'],
  Goal: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-goal'],
  Immunization: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-immunization'],
  Location: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-location'],
  Medication: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-medication'],
  MedicationRequest: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-medicationrequest'],
  Observation: [
    'http://hl7.org/fhir/us/core/StructureDefinition/us-core-smokingstatus',
    'http://hl7.org/fhir/us/core/StructureDefinition/pediatric-weight-for-height',
    'http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab',
    'http://hl7.org/fhir/us/core/StructureDefinition/pediatric-bmi-for-age',
    'http://hl7.org/fhir/us/core/StructureDefinition/us-core-pulse-oximetry',
    'http://hl7.org/fhir/us/core/StructureDefinition/head-occipital-frontal-circumference-percentile',
    'http://hl7.org/fhir/StructureDefinition/heartrate',
    'http://hl7.org/fhir/StructureDefinition/bodyheight',
    'http://hl7.org/fhir/StructureDefinition/bp',
    'http://hl7.org/fhir/StructureDefinition/bodyweight',
    'http://hl7.org/fhir/StructureDefinition/bodytemp',
    'http://hl7.org/fhir/StructureDefinition/resprate',
  ],
  Organization: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-organization'],
  Patient: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'],
  Practitioner: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-practitioner'],
  PractitionerRole: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-practitionerrole'],
  Procedure: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-procedure'],
  Provenance: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-provenance'],
};

const supportedOperations: Record<string, CapabilityStatementRestResourceOperation[]> = {
  Group: [
    {
      name: 'export',
      definition: 'http://hl7.org/fhir/uv/bulkdata/OperationDefinition/group-export',
    },
  ],
};

/**
 * A list of the advanced search parameters that are FHIR Search Result Parameters applicable to the server.
 * See: https://www.hl7.org/fhir/search.html#modifyingresults
 */
const supportedSearchParams: CapabilityStatementRestResourceSearchParam[] = [
  {
    name: '_sort',
    definition: 'https://www.hl7.org/fhir/search.html#_sort',
    type: 'string',
  },
  {
    name: '_total',
    definition: 'https://www.hl7.org/fhir/search.html#_total',
    type: 'string',
  },
  {
    name: '_count',
    definition: 'https://www.hl7.org/fhir/search.html#_count',
    type: 'number',
  },
  {
    name: '_summary',
    definition: 'https://www.hl7.org/fhir/search.html#_summary',
    type: 'token',
  },
  {
    name: '_elements',
    definition: 'https://www.hl7.org/fhir/search.html#_elements',
    type: 'string',
  },
];

let capabilityStatement: CapabilityStatement | undefined = undefined;

export function getCapabilityStatement(): CapabilityStatement {
  if (!capabilityStatement) {
    capabilityStatement = buildCapabilityStatement();
  }
  return capabilityStatement;
}

function buildCapabilityStatement(): CapabilityStatement {
  const name = 'medplum';
  const version = baseStmt.version;
  const config = getConfig();
  const baseUrl = config.baseUrl;
  const fhirBaseUrl = baseUrl + 'fhir/R4/';
  const metadataUrl = fhirBaseUrl + 'metadata';

  return {
    ...baseStmt,
    url: metadataUrl,
    software: {
      name,
      version,
    },
    implementation: {
      description: name,
      url: fhirBaseUrl,
    },
    rest: buildRest(config),
  };
}

function buildRest(config: MedplumServerConfig): CapabilityStatementRest[] {
  return [
    {
      mode: 'server',
      security: buildSecurity(config),
      resource: buildResourceTypes(),
      interaction: [{ code: 'transaction' }, { code: 'batch' }],
      searchParam: supportedSearchParams,
    },
  ];
}

function buildSecurity(config: MedplumServerConfig): CapabilityStatementRestSecurity {
  return {
    extension: [
      {
        url: 'http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris',
        extension: [
          {
            url: 'authorize',
            valueUri: config.authorizeUrl,
          },
          {
            url: 'token',
            valueUri: config.tokenUrl,
          },
        ],
      },
    ],
  };
}

function buildResourceTypes(): CapabilityStatementRestResource[] {
  return Object.entries(getAllDataTypes())
    .filter(
      ([resourceType, typeSchema]) =>
        isResourceType(resourceType) && typeSchema.url?.startsWith('http://hl7.org/fhir/StructureDefinition/')
    )
    .map(([resourceType, typeSchema]) => ({
      type: resourceType as ResourceType,
      profile: typeSchema.url,
      supportedProfile: supportedProfiles[resourceType] || undefined,
      interaction: [
        { code: 'read' }, // Read the current state of the resource.
        { code: 'vread' }, // Read the state of a specific version of the resource.
        { code: 'update' }, // Update an existing resource by its id.
        { code: 'patch' }, // Update an existing resource by posting a set of changes to it.
        { code: 'delete' }, // Delete a resource.
        { code: 'history-instance' }, // Retrieve the change history for a particular resource.
        { code: 'create' }, // Create a new resource with a server assigned id.
        { code: 'search-type' }, // Search all resources of the specified type based on some filter criteria.
      ],
      versioning: 'versioned',
      readHistory: true,
      updateCreate: false,
      conditionalCreate: false,
      conditionalRead: 'not-supported',
      conditionalDelete: 'not-supported',
      referencePolicy: ['literal', 'logical', 'local'],
      searchParam: buildSearchParameters(typeSchema),
      operation: supportedOperations[resourceType] || undefined,
    }));
}

function buildSearchParameters(
  typeSchema: InternalTypeSchema
): CapabilityStatementRestResourceSearchParam[] | undefined {
  const searchParams = getSearchParameters(typeSchema.name);
  if (!searchParams) {
    return undefined;
  }
  const entries = Object.values(searchParams);
  if (entries.length === 0) {
    return undefined;
  }
  return entries.map((param: any) => ({
    name: param.code,
    definition: param.url,
    type: param.type,
  }));
}
