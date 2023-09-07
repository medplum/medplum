import {
  BotEvent,
  createReference,
  encodeBase64,
  getIdentifier,
  getQuestionnaireAnswers,
  MedplumClient,
} from '@medplum/core';
import {
  Patient,
  Practitioner,
  ProjectSecret,
  QuestionnaireResponse,
  Reference,
  RequestGroup,
} from '@medplum/fhirtypes';
import { createHmac } from 'crypto';
import fetch from 'node-fetch';

const HEALTH_GORILLA_SYSTEM = 'https://www.healthgorilla.com';

interface HealthGorillaConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  clientUri: string;
  userLogin: string;
  providerLabAccount: string;
  tenantId: string;
  scopes: string;
}

export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<void> {
  // Parse the secrets
  // Make sure all required Health Gorilla config values are present
  const config = getHealthGorillaConfig(event);

  // Parse the QuestionnaireResponse
  // Make sure that required fields are present
  const answers = getQuestionnaireAnswers(event.input);

  // Lookup the patient and practitioner resources first
  // If the questionnaire response is invalid, this will throw and the bot will terminate
  const medplumPatient = await medplum.readReference(answers.patient.valueReference as Reference<Patient>);
  const medplumPractitioner = await medplum.readReference(
    answers.practitioner.valueReference as Reference<Practitioner>
  );

  // Connect to Health Gorilla
  const healthGorilla = await connectToHealthGorilla(config);

  // Synchronize the patient
  const healthGorillaPatient = await syncPatient(medplum, healthGorilla, medplumPatient);

  // Synchronize the practitioner
  const healthGorillaPractitioner = await getPractitioner(healthGorilla, medplumPractitioner);

  // Place the order
  await createRequestGroup(config, healthGorilla, healthGorillaPatient, healthGorillaPractitioner);
}

/**
 * Returns the Health Gorilla config settings from the Medplum project secrets.
 * If any required config values are missing, this method will throw and the bot will terminate.
 * @param event The bot input event.
 * @returns The Health Gorilla config settings.
 */
function getHealthGorillaConfig(event: BotEvent): HealthGorillaConfig {
  const secrets = event.secrets;
  return {
    baseUrl: requireStringSecret(secrets, 'HEALTH_GORILLA_BASE_URL'),
    clientId: requireStringSecret(secrets, 'HEALTH_GORILLA_CLIENT_ID'),
    clientSecret: requireStringSecret(secrets, 'HEALTH_GORILLA_CLIENT_SECRET'),
    clientUri: requireStringSecret(secrets, 'HEALTH_GORILLA_CLIENT_URI'),
    userLogin: requireStringSecret(secrets, 'HEALTH_GORILLA_USER_LOGIN'),
    providerLabAccount: requireStringSecret(secrets, 'HEALTH_GORILLA_PROVIDER_LAB_ACCOUNT'),
    tenantId: requireStringSecret(secrets, 'HEALTH_GORILLA_TENANT_ID'),
    scopes: requireStringSecret(secrets, 'HEALTH_GORILLA_SCOPES'),
  };
}

/**
 * Connects to the Health Gorilla API and returns a FHIR client.
 * @param config The Health Gorilla config settings.
 * @returns The FHIR client.
 */
async function connectToHealthGorilla(config: HealthGorillaConfig): Promise<MedplumClient> {
  const healthGorilla = new MedplumClient({
    fetch,
    baseUrl: config.baseUrl,
    tokenUrl: config.baseUrl + '/oauth/token',
    onUnauthenticated: () => console.error('Unauthenticated'),
  });

  const header = {
    typ: 'JWT',
    alg: 'HS256',
  };

  const currentTimestamp = Math.floor(Date.now() / 1000);

  const data = {
    aud: config.baseUrl + '/oauth/token',
    iss: config.clientUri,
    sub: config.userLogin,
    iat: currentTimestamp,
    exp: currentTimestamp + 604800, // expiry time is 7 days from time of creation
  };

  const encodedHeader = encodeBase64(JSON.stringify(header));
  const encodedData = encodeBase64(JSON.stringify(data));
  const token = `${encodedHeader}.${encodedData}`;
  const signature = createHmac('sha256', config.clientSecret).update(token).digest('base64url');
  const signedToken = `${token}.${signature}`;
  await healthGorilla.startJwtBearerLogin(config.clientId, signedToken, config.scopes);

  return healthGorilla;
}

/**
 * Verifies and synchronizes a patient resource with Health Gorilla.
 *
 * First, verifies that the patient resource has all of the required fields and values.
 * If the patient is invalid, this method will throw and the bot will terminate.
 *
 * Next, searches for an existing patient with the same MRN.
 * If an existing patient is found, the patient resource will be merged into the existing patient.
 * Otherwise, a new patient will be created.
 *
 * Returns the Health Gorilla patient resource.
 *
 * @param medplum The Medplum FHIR client.
 * @param healthGorilla The Health Gorilla FHIR client.
 * @param patient The Medplum patient resource.
 * @returns The Health Gorilla patient resource.
 */
async function syncPatient(medplum: MedplumClient, healthGorilla: MedplumClient, patient: Patient): Promise<Patient> {
  // First verify that the patient has all of the required fields
  assertNotEmpty(patient.gender, 'Patient is missing gender');
  assertNotEmpty(patient.birthDate, 'Patient is missing birthDate');

  const mrn = patient.identifier?.find(
    (i) => i.type?.coding?.[0]?.system === 'http://terminology.hl7.org/CodeSystem/v2-0203'
  );
  assertNotEmpty(mrn, 'Patient is missing MRN');

  const name = patient.name?.[0];
  assertNotEmpty(name, 'Patient is missing name');
  assertNotEmpty(name.family, 'Patient is missing family name');
  assertNotEmpty(name.given?.[0], 'Patient is missing given name');

  const address = patient.address?.[0];
  assertNotEmpty(address, 'Patient is missing address');
  assertNotEmpty(address.line?.[0], 'Patient is missing address line');
  assertNotEmpty(address.city, 'Patient is missing address city');
  assertNotEmpty(address.state, 'Patient is missing address state');
  assertNotEmpty(address.postalCode, 'Patient is missing address postalCode');
  assertNotEmpty(address.country, 'Patient is missing address country');

  const phone = patient.telecom?.find((t) => t.system === 'phone');
  assertNotEmpty(phone, 'Patient is missing phone');

  const email = patient.telecom?.find((t) => t.system === 'email');
  assertNotEmpty(email, 'Patient is missing email');

  const healthGorillaId = getIdentifier(patient, HEALTH_GORILLA_SYSTEM);
  if (healthGorillaId) {
    // Merge our patient into the existing patient
    const existingPatient = await healthGorilla.readResource('Patient', healthGorillaId);
    await healthGorilla.updateResource<Patient>({
      ...existingPatient,
      identifier: patient.identifier,
      name: patient.name,
      address: patient.address,
      telecom: patient.telecom,
    });
    return existingPatient;
  } else {
    // Create a new patient
    const createdPatient = await healthGorilla.createResource<Patient>(
      {
        ...patient,
        id: undefined,
        meta: undefined,
      },
      { redirect: 'follow' }
    );
    setIdentifier(patient, HEALTH_GORILLA_SYSTEM, createdPatient.id as string);
    await medplum.updateResource(patient);
    return createdPatient;
  }
}

/**
 * Verifies and synchronizes a practitioner resource with Health Gorilla.
 *
 * Returns the Health Gorilla practitioner by Health Gorilla ID.
 *
 * If the Medplum Practitioner resource does not have a Health Gorilla ID in `identifier`,
 * this method will throw and the bot will terminate.
 *
 * @param healthGorilla The Health Gorilla FHIR client.
 * @param practitioner The Medplum practitioner resource.
 * @returns The Health Gorilla practitioner resource.
 */
async function getPractitioner(healthGorilla: MedplumClient, practitioner: Practitioner): Promise<Practitioner> {
  const healthGorillaId = getIdentifier(practitioner, HEALTH_GORILLA_SYSTEM);
  if (!healthGorillaId) {
    throw new Error('Practitioner is missing Health Gorilla ID');
  }

  return healthGorilla.readResource('Practitioner', healthGorillaId);
}

/**
 * Creates a new request group in Health Gorilla which creates a new lab order.
 *
 * The FHIR RequestGroup is a combination of the following resources:
 *
 * @param config The Health Gorilla config settings.
 * @param healthGorilla The Health Gorilla FHIR client.
 * @param healthGorillaPatient The patient resource.
 * @param healthGorillaPractitioner The practitioner resource.
 */
async function createRequestGroup(
  config: HealthGorillaConfig,
  healthGorilla: MedplumClient,
  healthGorillaPatient: Patient,
  healthGorillaPractitioner: Practitioner
): Promise<void> {
  const inputJson: RequestGroup = {
    resourceType: 'RequestGroup',
    meta: {
      profile: ['https://healthgorilla.com/fhir/StructureDefinition/hg-order'],
    },
    contained: [
      {
        resourceType: 'Account',
        id: '1',
        meta: {
          profile: ['https://healthgorilla.com/fhir/StructureDefinition/hg-order-account'],
        },
        type: {
          coding: [
            {
              system: 'https://www.healthgorilla.com/order-billto',
              code: 'patient',
              display: 'Patient',
            },
          ],
          text: 'Patient',
        },
        guarantor: [
          {
            party: createReference(healthGorillaPatient),
          },
        ],
      },
      {
        ...healthGorillaPractitioner,
        id: '2',
      },
      {
        resourceType: 'Organization',
        id: 'organization',
        identifier: [
          {
            system: 'https://www.healthgorilla.com',
            value: 't-c7ed4760dc104c90bdad9e26',
          },
          {
            type: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                  code: 'AN',
                  display: 'Account number',
                },
              ],
              text: 'Account_number',
            },
            value: '12457895',
          },
        ],
        active: true,
        partOf: {
          reference: `Organization/${config.tenantId}`,
        },
      },
      {
        resourceType: 'ServiceRequest',
        id: 'labtest0',
        status: 'active',
        intent: 'order',
        // note: 'test org',
        // priority: '',
        category: [
          {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '103693007',
                display: 'Diagnostic procedure',
              },
            ],
          },
        ],
        code: {
          coding: [
            {
              code: '2093-3',
              display: 'Cholesterol, Total',
            },
          ],
          text: '2093-3-CHOLESTEROL',
        },
      },
    ],
    extension: [
      {
        url: 'https://www.healthgorilla.com/fhir/StructureDefinition/requestgroup-authorizedBy',
        valueReference: {
          reference: `Organization/${config.tenantId}`,
        },
      },
      {
        url: 'https://www.healthgorilla.com/fhir/StructureDefinition/requestgroup-account',
        valueReference: {
          reference: '#1',
        },
      },
      {
        url: 'https://www.healthgorilla.com/fhir/StructureDefinition/requestgroup-performer',
        valueReference: {
          reference: 'Organization/f-4f0235627ac2d59b49e5575c',
          display: 'TestingLabFacility',
        },
      },
      {
        url: 'https://www.healthgorilla.com/fhir/StructureDefinition/requestgroup-requester',
        extension: [
          {
            url: 'agent',
            valueReference: {
              reference: '#2',
            },
          },
          {
            url: 'onBehalfOf',
            valueReference: {
              reference: '#3',
            },
          },
        ],
      },
      {
        url: 'https://www.healthgorilla.com/fhir/StructureDefinition/requestgroup-deliveryOptions',
        extension: [
          {
            url: 'electronic',
            valueBoolean: true,
          },
        ],
      },
    ],
    status: 'active',
    intent: 'order',
    subject: createReference(healthGorillaPatient),
    author: createReference(healthGorillaPractitioner),
    action: [
      {
        resource: {
          reference: '#labtest0',
          display: '2093-3-CHOLESTEROL',
        },
      },
    ],
  };

  await healthGorilla.startAsyncRequest(healthGorilla.fhirUrl('RequestGroup').toString(), {
    method: 'POST',
    body: JSON.stringify(inputJson),
  });
}

function setIdentifier(resource: Patient | Practitioner, system: string, value: string): void {
  if (!resource.identifier) {
    resource.identifier = [];
  }
  const existing = resource.identifier.find((i) => i.system === system);
  if (existing) {
    existing.value = value;
  } else {
    resource.identifier.push({ system, value });
  }
}

function requireStringSecret(secrets: Record<string, ProjectSecret>, name: string): string {
  const secret = secrets[name];
  if (!secret?.valueString) {
    throw new Error(`Missing secret: ${name}`);
  }
  return secret.valueString;
}

function assertNotEmpty<T>(value: T | undefined, message: string): asserts value is T {
  if (!value) {
    throw new Error(message);
  }
}
