import {
  BotEvent,
  createReference,
  encodeBase64,
  getIdentifier,
  getQuestionnaireAnswers,
  MedplumClient,
} from '@medplum/core';
import {
  Account,
  CodeableConcept,
  Organization,
  Patient,
  Practitioner,
  ProjectSecret,
  QuestionnaireResponse,
  Reference,
  RequestGroup,
  ServiceRequest,
  Subscription,
} from '@medplum/fhirtypes';
import { createHmac, randomUUID } from 'crypto';
import fetch from 'node-fetch';

const HEALTH_GORILLA_SYSTEM = 'https://www.healthgorilla.com';

interface HealthGorillaConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  clientUri: string;
  userLogin: string;
  tenantId: string;
  subtenantId: string;
  subtenantAccountNumber: string;
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
  const medplumPerformer = await medplum.readReference(answers.performer.valueReference as Reference<Organization>);

  // Connect to Health Gorilla
  const healthGorilla = await connectToHealthGorilla(config);

  // Ensure active subscriptions
  await ensureSubscriptions(healthGorilla);

  // Synchronize the patient
  const healthGorillaPatient = await syncPatient(medplum, healthGorilla, medplumPatient);

  // Get the practitioner
  const healthGorillaPractitioner = await getPractitioner(healthGorilla, medplumPractitioner);

  // Get the tenant organization
  // This is a special organization that is not available in the Health Gorilla API
  const healthGorillaTenantOrganization: Organization = {
    resourceType: 'Organization',
    id: config.tenantId,
    identifier: [
      {
        system: HEALTH_GORILLA_SYSTEM,
        value: config.tenantId,
      },
    ],
  };

  // Get the subtenant organization
  // This is a special organization that is not available in the Health Gorilla API
  const healthGorillaSubtenantOrganization: Organization = {
    resourceType: 'Organization',
    id: config.subtenantId,
    identifier: [
      {
        system: HEALTH_GORILLA_SYSTEM,
        value: config.subtenantId,
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
        value: config.subtenantAccountNumber,
      },
    ],
    partOf: createReference(healthGorillaTenantOrganization),
  };

  // Get the performing organization
  // This is a special organization that is not available in the Health Gorilla API
  const healthGorillaPerformingOrganization: Organization = {
    resourceType: 'Organization',
    id: getIdentifier(medplumPerformer, HEALTH_GORILLA_SYSTEM),
  };

  // Synchronize the account
  const healthGorillaAccount = await syncAccount(medplum, healthGorilla, medplumPatient, healthGorillaPatient);

  // Create the service request
  // TODO: This should come from the QuestionnaireResponse
  const healthGorillaServiceRequest = await createServiceRequest(
    medplum,
    medplumPatient,
    {
      coding: [
        {
          code: '2093-3',
          display: 'Cholesterol, Total',
        },
      ],
      text: '2093-3-CHOLESTEROL',
    },
    'Test note',
    'routine'
  );

  // Place the order
  await createRequestGroup(
    config,
    healthGorilla,
    healthGorillaTenantOrganization,
    healthGorillaSubtenantOrganization,
    healthGorillaPerformingOrganization,
    healthGorillaAccount,
    healthGorillaPatient,
    healthGorillaPractitioner,
    healthGorillaServiceRequest
  );
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
    tenantId: requireStringSecret(secrets, 'HEALTH_GORILLA_TENANT_ID'),
    subtenantId: requireStringSecret(secrets, 'HEALTH_GORILLA_SUBTENANT_ID'),
    subtenantAccountNumber: requireStringSecret(secrets, 'HEALTH_GORILLA_SUBTENANT_ACCOUNT_NUMBER'),
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
 * Ensures that there are active subscriptions for the main resource types.
 * Health Gorilla uses subscriptions to notify Medplum when new lab results are available.
 * If there are no subscriptions, this method will create them.
 * If the subscriptions are in "error" status, this method will delete them and create new ones.
 * If the subscriptions are in "active" status, this method will do nothing.
 * @param healthGorilla The Health Gorilla FHIR client.
 */
export async function ensureSubscriptions(healthGorilla: MedplumClient): Promise<void> {
  // Get all subscriptions
  const subscriptions = await healthGorilla.searchResources('Subscription');
  await ensureSubscription(healthGorilla, subscriptions, 'RequestGroup', 'Monitor for Lab RequestGroup');
  await ensureSubscription(healthGorilla, subscriptions, 'ServiceRequest', 'Monitor for Lab ServiceRequest');
  await ensureSubscription(healthGorilla, subscriptions, 'DiagnosticReport', 'Monitor for Lab DiagnosticReport');
}

/**
 * Ensures that there is an active subscription for the given criteria.
 * @param healthGorilla The Health Gorilla FHIR client.
 * @param existingSubscriptions The existing subscriptions.
 * @param criteria The subscription criteria.
 * @param reason The subscription reason.
 */
export async function ensureSubscription(
  healthGorilla: MedplumClient,
  existingSubscriptions: Subscription[],
  criteria: string,
  reason: string
): Promise<void> {
  const existingSubscription = existingSubscriptions.find((s) => s.criteria === criteria && s.status === 'active');
  if (existingSubscription) {
    console.log(`Subscription for "${criteria}" already exists: ${existingSubscription.id}`);
    return;
  }

  // Otherwise, create a new subscription
  const newSubscription = await healthGorilla.createResource<Subscription>({
    resourceType: 'Subscription',
    status: 'active',
    end: '2030-01-01T00:00:00.000+00:00',
    reason,
    criteria,
    channel: {
      type: 'rest-hook',
      // TODO: load this from secrets
      endpoint: 'https://api.medplum.com/fhir/R4/Bot/.../$execute',
      payload: 'application/fhir+json',
      header: [
        // TODO: load this from secrets
        'Authorization: Basic ...',
      ],
    },
  });
  console.log(`Created new subscription for "${criteria}": ${newSubscription.id}`);
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
export async function syncPatient(
  medplum: MedplumClient,
  healthGorilla: MedplumClient,
  patient: Patient
): Promise<Patient> {
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
 * @param medplumPatient The Medplum patient resource.
 * @param healthGorillaPatient The Health Gorilla patient resource.
 * @returns The Health Gorilla account resource.
 */
export async function syncAccount(
  medplum: MedplumClient,
  healthGorilla: MedplumClient,
  medplumPatient: Patient,
  healthGorillaPatient: Patient
): Promise<Account> {
  const healthGorillaId = getIdentifier(medplumPatient, HEALTH_GORILLA_SYSTEM);

  // First, make sure there is an Account in Medplum
  let medplumAccount = await medplum.searchOne('Account', { identifier: healthGorillaId });
  if (medplumAccount) {
    console.log(`Found existing Medplum account: ${medplumAccount.id}`);
  } else {
    // Create a new account
    medplumAccount = await medplum.createResource<Account>({
      resourceType: 'Account',
      status: 'active',
      meta: {
        profile: ['https://healthgorilla.com/fhir/StructureDefinition/hg-order-account'],
      },
      identifier: [
        {
          system: HEALTH_GORILLA_SYSTEM,
          value: healthGorillaPatient.id as string,
        },
      ],
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
          party: createReference(medplumPatient),
        },
      ],
    });
    console.log(`Created new Medplum account: ${medplumAccount.id}`);
  }

  // Health Gorilla does not support creating `Account` resources,
  // so we always use an in-memory `Account` which is linked to the `Patient` by identifier;
  return {
    ...medplumAccount,
    guarantor: [
      {
        party: createReference(healthGorillaPatient),
      },
    ],
  };
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
export async function getPractitioner(healthGorilla: MedplumClient, practitioner: Practitioner): Promise<Practitioner> {
  const healthGorillaId = getIdentifier(practitioner, HEALTH_GORILLA_SYSTEM);
  if (!healthGorillaId) {
    throw new Error('Practitioner is missing Health Gorilla ID');
  }

  return healthGorilla.readResource('Practitioner', healthGorillaId);
}

export async function createServiceRequest(
  medplum: MedplumClient,
  medplumPatient: Patient,
  code: CodeableConcept,
  note: string,
  priority: 'routine' | 'urgent' | 'asap' | 'stat'
): Promise<ServiceRequest> {
  // Create the Medplum ServiceRequest
  const medplumServiceRequest = await medplum.createResource<ServiceRequest>({
    resourceType: 'ServiceRequest',
    identifier: [
      {
        system: 'https://medplum.com/healthgorilla/service-request-id',
        value: randomUUID(),
      },
    ],
    subject: createReference(medplumPatient),
    status: 'active',
    intent: 'order',
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
    code,
    note: [{ text: note }],
    priority,
  });
  console.log(`Created new Medplum ServiceRequest: ${medplumServiceRequest.id}`);

  return {
    ...medplumServiceRequest,
    id: undefined,
    meta: undefined,
    subject: undefined,
  };
}

/**
 * Creates a new request group in Health Gorilla which creates a new lab order.
 *
 * The FHIR RequestGroup is a combination of the following resources:
 *
 * @param config The Health Gorilla config settings.
 * @param healthGorilla The Health Gorilla FHIR client.
 * @param healthGorillaTenantOrganization The authorizing organization resource.
 * @param healthGorillaSubtenantOrganization The authorizing organization resource.
 * @param healthGorillaPerformingOrganization The performing organization resource.
 * @param healthGorillaAccount The account resource.
 * @param healthGorillaPatient The patient resource.
 * @param healthGorillaPractitioner The practitioner resource.
 * @param healthGorillaServiceRequest The service request resource.
 */
export async function createRequestGroup(
  config: HealthGorillaConfig,
  healthGorilla: MedplumClient,
  healthGorillaTenantOrganization: Organization,
  healthGorillaSubtenantOrganization: Organization,
  healthGorillaPerformingOrganization: Organization,
  healthGorillaAccount: Account,
  healthGorillaPatient: Patient,
  healthGorillaPractitioner: Practitioner,
  healthGorillaServiceRequest: ServiceRequest
): Promise<void> {
  const inputJson: RequestGroup = {
    resourceType: 'RequestGroup',
    meta: {
      profile: ['https://healthgorilla.com/fhir/StructureDefinition/hg-order'],
    },
    contained: [
      {
        ...healthGorillaAccount,
        id: '1',
      },
      {
        ...healthGorillaPractitioner,
        id: '2',
      },
      {
        ...healthGorillaSubtenantOrganization,
        id: 'organization',
      },
      {
        ...healthGorillaServiceRequest,
        id: 'labtest0',
      },
    ],
    extension: [
      {
        url: 'https://www.healthgorilla.com/fhir/StructureDefinition/requestgroup-authorizedBy',
        valueReference: createReference(healthGorillaTenantOrganization),
      },
      {
        url: 'https://www.healthgorilla.com/fhir/StructureDefinition/requestgroup-account',
        valueReference: {
          reference: '#1',
        },
      },
      {
        url: 'https://www.healthgorilla.com/fhir/StructureDefinition/requestgroup-performer',
        valueReference: createReference(healthGorillaPerformingOrganization),
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
