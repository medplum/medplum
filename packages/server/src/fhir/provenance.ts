import { createReference, ProfileResource } from '@medplum/core';
import { Provenance, Reference, Resource } from '@medplum/fhirtypes';

/**
 * Returns a derived Provenance resource for the given resource.
 *
 * Provenance
 * https://www.hl7.org/fhir/provenance.html
 *
 * Resource Profile: US Core Provenance Profile
 * https://build.fhir.org/ig/HL7/US-Core/StructureDefinition-us-core-provenance.html
 *
 * @param resource The input resource.
 * @returns The derived Provenance resource.
 */
export function resourceToProvenance(resource: Resource): Provenance {
  return {
    resourceType: 'Provenance',
    id: `${resource.resourceType}-${resource.id}`,
    target: [createReference(resource)],
    recorded: resource.meta?.lastUpdated,
    agent: [
      {
        who: resource.meta?.author as Reference<ProfileResource> | undefined,
        onBehalfOf: resource.meta?.account as Reference<ProfileResource> | undefined,
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
              code: 'author',
            },
          ],
        },
      },
    ],
  };
}
