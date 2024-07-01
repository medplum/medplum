import { Bundle } from '@medplum/fhirtypes';
import { getFullUrl } from './response';

// Service Base URL
// Spec: https://www.federalregister.gov/documents/2023/04/18/2023-07229/health-data-technology-and-interoperability-certification-program-updates-algorithm-transparency-and#p-2342
// HTI-1 Rule: https://www.healthit.gov/topic/laws-regulation-and-policy/health-data-technology-and-interoperability-certification-program
// Test Kit: https://inferno.healthit.gov/test-kits/service-base-url/

export function getServiceBaseUrlBundle(): Bundle {
  // Handle unauthenticated special case of GET /fhir/R4 with no _type parameter
  //  * Service based URLs must be publicly published in Endpoint resource format according
  //    to the standard adopted in § 170.215(a) - FHIR 4.0.1 release
  //  * Organization details for each service base URL must be publicly published in
  //    Organization resource format according to the standard adopted in §170.215(a) -
  //    FHIR 4.0.1 release
  //  * Each Organization resource must contain:
  //      * A reference in the Organization.endpoint element, to the Endpoint resources containing service base URLs managed by this organization
  //      * The organization’s name, location, and provider identifier
  //      * Endpoint and Organization resources must be:
  //          * Collected into a Bundle resource formatted according to the standard adopted in FHIR v4.0.1: § 170.215(a) for publication
  //          * Reviewed quarterly and, as necessary, updated
  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: [
      {
        fullUrl: getFullUrl('Endpoint', 'medplum'),
        resource: {
          resourceType: 'Endpoint',
          id: 'medplum',
          status: 'active',
          connectionType: {
            system: 'http://terminology.hl7.org/CodeSystem/endpoint-connection-type',
            code: 'hl7-fhir-rest',
            display: 'HL7 FHIR',
          },
          name: 'Medplum Endpoint',
          managingOrganization: {
            reference: 'Organization/medplum',
            display: 'Medplum',
          },
          payloadType: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/endpoint-payload-type',
                  code: 'any',
                  display: 'Any',
                },
              ],
            },
          ],
          payloadMimeType: ['application/fhir+json'],
          address: 'https://api.medplum.com/fhir/R4',
        },
      },
      {
        fullUrl: getFullUrl('Organization', 'medplum'),
        resource: {
          resourceType: 'Organization',
          id: 'medplum',
          name: 'Medplum',
          telecom: [
            {
              system: 'phone',
              use: 'work',
              value: '+1-415-900-9122',
            },
          ],
          address: [
            {
              use: 'work',
              type: 'both',
              line: ['2477 Sutter St'],
              city: 'San Francisco',
              state: 'California',
              postalCode: '94115',
            },
          ],
          contact: [
            {
              purpose: {
                coding: [
                  {
                    system: 'http://terminology.hl7.org/CodeSystem/contactentity-type',
                    code: 'ADMIN',
                    display: 'Administrative',
                  },
                ],
              },
              name: {
                use: 'official',
                given: ['Cody'],
                family: 'Ebberson',
              },
              address: {
                city: 'San Francisco',
                state: 'California',
                postalCode: '94115',
                line: ['2477 Sutter St'],
              },
            },
          ],
          endpoint: [
            {
              reference: 'Endpoint/medplum',
              display: 'Medplum Endpoint',
            },
          ],
        },
      },
    ],
  };

  return bundle;
}
