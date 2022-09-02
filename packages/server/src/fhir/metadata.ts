import { readJson } from '@medplum/definitions';
import { CapabilityStatement } from '@medplum/fhirtypes';
import { getConfig } from '../config';

let capabilityStatement: CapabilityStatement | undefined = undefined;

export function getCapabilityStatement(): CapabilityStatement {
  if (!capabilityStatement) {
    capabilityStatement = buildCapabilityStatement();
  }
  return capabilityStatement;
}

function buildCapabilityStatement(): CapabilityStatement {
  const baseStmt = readJson('fhir/r4/capability-statement.json') as CapabilityStatement;
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
    rest: [
      {
        ...baseStmt.rest?.[0],
        security: {
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
        },
      },
    ],
  };
}
