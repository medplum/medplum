import {
  getIdentifier,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  resolveId,
} from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { MockClient } from '@medplum/mock';
import { Patient, Bundle, SearchParameter, Resource, AllergyIntolerance, MedicationRequest } from '@medplum/fhirtypes';
import { generateKeyPairSync } from 'crypto';
import { Mock } from 'vitest';
import fetch from 'node-fetch';
import { handler } from './epic-query-patient';
import {
  medplumPatientWithoutEpicIdentifier,
  epicAllergyIntolerance,
  epicMedication,
  epicMedicationRequest,
  epicOrganization,
  epicPatient,
  epicPractitioner,
} from './epic-query-patient-test-data';

vi.mock('node-fetch');

describe('Epic Query Patient Bot', () => {
  let medplum: MockClient;
  let input: Patient;

  const bot = { reference: 'Bot/123' };
  const contentType = 'application/fhir+json';
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const secrets = {
    EPIC_PRIVATE_KEY: { name: 'EPIC_PRIVATE_KEY', valueString: privateKey },
    EPIC_CLIENT_ID: { name: 'EPIC_CLIENT_ID', valueString: 'test-client-id' },
  };

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async () => {
    vi.resetAllMocks();
    (fetch as unknown as Mock).mockClear();
    medplum = new MockClient();
    input = await medplum.createResource({
      ...medplumPatientWithoutEpicIdentifier,
    });
  });

  function createSearchSetBundle<T extends Resource>(...resources: T[]): Bundle<T> {
    return {
      resourceType: 'Bundle',
      type: 'searchset',
      total: resources.length,
      entry: resources.map((resource) => ({ resource })),
    };
  }

  test('throws error when missing EPIC_CLIENT_ID', async () => {
    await expect(
      handler(medplum, {
        bot,
        input,
        secrets: { EPIC_PRIVATE_KEY: secrets.EPIC_PRIVATE_KEY },
        contentType,
      })
    ).rejects.toThrow('Missing EPIC_CLIENT_ID');
  });

  test('throws error when missing EPIC_PRIVATE_KEY', async () => {
    await expect(
      handler(medplum, {
        bot,
        input,
        secrets: { EPIC_CLIENT_ID: secrets.EPIC_CLIENT_ID },
        contentType,
      })
    ).rejects.toThrow('Missing EPIC_PRIVATE_KEY');
  });

  test('successfully syncs an existing Epic patient and related resources to Medplum', async () => {
    input = await medplum.createResource({
      ...medplumPatientWithoutEpicIdentifier,
      identifier: [
        {
          system: 'http://open.epic.com/FHIR/StructureDefinition/patient-fhir-id',
          value: 'epic-patient-123',
        },
      ],
    });

    (fetch as unknown as Mock).mockImplementation(async (url: string, options?: any): Promise<any> => {
      const { Response } = await vi.importActual<{ Response: any }>('node-fetch');
      const urlString = url.toString();
      console.log(`Mock Fetch: API request to ${urlString} with options: ${JSON.stringify(options)}`);

      if (urlString.includes('/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 'mock-epic-access-token', expires_in: 300 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (!options?.headers?.Authorization?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
      }

      if (urlString.endsWith('/api/FHIR/R4/Patient/epic-patient-123')) {
        return new Response(JSON.stringify(epicPatient), {
          status: 200,
          headers: { 'Content-Type': 'application/fhir+json' },
        });
      }
      if (urlString.includes('/api/FHIR/R4/Organization/') && urlString.endsWith(epicOrganization.id ?? '')) {
        return new Response(JSON.stringify(epicOrganization), {
          status: 200,
          headers: { 'Content-Type': 'application/fhir+json' },
        });
      }
      if (urlString.includes('/api/FHIR/R4/Practitioner/') && urlString.endsWith(epicPractitioner.id ?? '')) {
        return new Response(JSON.stringify(epicPractitioner), {
          status: 200,
          headers: { 'Content-Type': 'application/fhir+json' },
        });
      }
      if (urlString.includes('/api/FHIR/R4/AllergyIntolerance?patient=epic-patient-123')) {
        const bundle = createSearchSetBundle<AllergyIntolerance>(epicAllergyIntolerance);
        return new Response(JSON.stringify(bundle), {
          status: 200,
          headers: { 'Content-Type': 'application/fhir+json' },
        });
      }
      if (urlString.includes('/api/FHIR/R4/MedicationRequest?patient=epic-patient-123')) {
        const bundle = createSearchSetBundle<MedicationRequest>(epicMedicationRequest);
        return new Response(JSON.stringify(bundle), {
          status: 200,
          headers: { 'Content-Type': 'application/fhir+json' },
        });
      }
      if (urlString.includes('/api/FHIR/R4/Medication/') && urlString.endsWith(epicMedication.id ?? '')) {
        return new Response(JSON.stringify(epicMedication), {
          status: 200,
          headers: { 'Content-Type': 'application/fhir+json' },
        });
      }

      console.error(`Mock Fetch: Unhandled URL: ${urlString}`);
      return new Response(JSON.stringify({ message: 'Not Found in Mock' }), { status: 404 });
    });

    const patient = await handler(medplum, {
      bot,
      input,
      secrets,
      contentType,
    });

    expect(patient).toBeDefined();
    expect(patient?.resourceType).toStrictEqual('Patient');
    expect(
      getIdentifier(patient as Patient, 'http://open.epic.com/FHIR/StructureDefinition/patient-fhir-id')
    ).toStrictEqual('epic-patient-123');

    // managingOrganization
    expect(patient?.managingOrganization).toBeDefined();
    const managingOrganization = await medplum.readResource(
      'Organization',
      resolveId(patient?.managingOrganization) as string
    );
    expect(managingOrganization).toBeDefined();
    expect(getIdentifier(managingOrganization, 'http://hl7.org/fhir/sid/us-npi')).toStrictEqual(
      getIdentifier(epicOrganization, 'http://hl7.org/fhir/sid/us-npi')
    );

    // generalPractitioner
    expect(patient?.generalPractitioner).toHaveLength(1);
    const generalPractitioner = await medplum.readResource(
      'Practitioner',
      resolveId(patient?.generalPractitioner?.[0]) as string
    );
    expect(generalPractitioner).toBeDefined();
    expect(getIdentifier(generalPractitioner, 'http://hl7.org/fhir/sid/us-npi')).toStrictEqual(
      getIdentifier(epicPractitioner, 'http://hl7.org/fhir/sid/us-npi')
    );

    // allergies
    const allergies = await medplum.searchResources('AllergyIntolerance', {
      patient: getReferenceString(patient),
    });
    expect(allergies).toHaveLength(1);
    expect(allergies[0].code?.coding?.[0].code).toStrictEqual(epicAllergyIntolerance.code?.coding?.[0].code);

    // medicationRequests
    const medRequests = await medplum.searchResources('MedicationRequest', {
      patient: getReferenceString(patient),
    });
    expect(medRequests).toHaveLength(1);
    expect(medRequests[0].medicationReference).toBeDefined();

    const medication = await medplum.readResource(
      'Medication',
      resolveId(medRequests[0].medicationReference) as string
    );
    expect(medication.code?.coding?.[0].code).toStrictEqual(epicMedication.code?.coding?.[0].code);
  });

  test('successfully creates a new Epic patient when one does not exist', async () => {
    const ssn = getIdentifier(medplumPatientWithoutEpicIdentifier, 'http://hl7.org/fhir/sid/us-ssn');
    const newEpicPatientId = 'new-epic-patient-456';

    (fetch as unknown as Mock).mockImplementation(async (url: string, options?: any): Promise<any> => {
      const { Response } = await vi.importActual<{ Response: any }>('node-fetch');
      const urlString = url.toString();
      const parsedUrl = new URL(urlString);
      console.log(`Mock Fetch: API request to ${urlString} with options: ${JSON.stringify(options)}`);

      if (urlString.includes('/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 'mock-epic-access-token', expires_in: 300 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (!options?.headers?.Authorization?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
      }

      // Mock POST to create patient
      if (parsedUrl.pathname.endsWith('/api/FHIR/R4/Patient') && options?.method === 'POST') {
        // Check if the SSN identifier system was correctly changed to OID
        const body = JSON.parse(options.body);
        const ssnIdentifier = body.identifier?.find((id: any) => id.value === ssn);
        expect(ssnIdentifier?.system).toBe('urn:oid:2.16.840.1.113883.4.1');

        return new Response(null, {
          status: 201, // Created
          headers: { Location: `/api/FHIR/R4/Patient/${newEpicPatientId}` },
        });
      }

      // Mock GET search for patient by SSN value only (as generated by searchOne)
      if (
        parsedUrl.pathname.endsWith('/api/FHIR/R4/Patient') &&
        options?.method === 'GET' &&
        parsedUrl.searchParams.get('identifier') === ssn &&
        parsedUrl.searchParams.get('_count') === '1'
      ) {
        // Return the patient, assigning the new Epic ID
        const bundle = createSearchSetBundle<Patient>({
          ...epicPatient, // Use the base epic patient data
          id: newEpicPatientId, // Assign the ID expected after creation
          identifier: [
            // Ensure identifiers match what Epic might return (including OID SSN)
            ...(epicPatient.identifier?.filter((id) => id.system !== 'http://hl7.org/fhir/sid/us-ssn') ?? []),
            { system: 'urn:oid:2.16.840.1.113883.4.1', value: ssn },
            { system: 'http://open.epic.com/FHIR/StructureDefinition/patient-fhir-id', value: newEpicPatientId },
          ],
        });
        return new Response(JSON.stringify(bundle), {
          status: 200,
          headers: { 'Content-Type': 'application/fhir+json' },
        });
      }

      console.error(`Mock Fetch: Unhandled URL: ${urlString}`);
      return new Response(JSON.stringify({ message: 'Not Found in Mock' }), { status: 404 });
    });

    // Input patient does not have an Epic identifier, but has SSN
    expect(getIdentifier(medplumPatientWithoutEpicIdentifier, 'http://hl7.org/fhir/sid/us-ssn')).toBeDefined();
    expect(getIdentifier(input, 'http://open.epic.com/FHIR/StructureDefinition/patient-fhir-id')).toBeUndefined();

    const patient = await handler(medplum, {
      bot,
      input,
      secrets,
      contentType,
    });

    expect(patient).toBeDefined();
    expect(patient?.resourceType).toStrictEqual('Patient');

    // Verify the new Epic identifier was added to the Medplum patient
    expect(patient.identifier).toHaveLength(2);
    expect(getIdentifier(patient, 'http://hl7.org/fhir/sid/us-ssn')).toStrictEqual(ssn);
    expect(getIdentifier(patient, 'http://open.epic.com/FHIR/StructureDefinition/patient-fhir-id')).toStrictEqual(
      newEpicPatientId
    );
  });
});
