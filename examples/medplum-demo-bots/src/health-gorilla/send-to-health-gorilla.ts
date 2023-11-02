import {
  BotEvent,
  createReference,
  encodeBase64,
  getIdentifier,
  getQuestionnaireAnswers,
  getReferenceString,
  MedplumClient,
  SNOMED,
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
  RequestGroupAction,
  Resource,
  ServiceRequest,
  Subscription,
} from '@medplum/fhirtypes';
import { createHmac } from 'crypto';
import fetch from 'node-fetch';

const HEALTH_GORILLA_SYSTEM = 'https://www.healthgorilla.com';

interface HealthGorillaConfig {
  baseUrl: string;
  audienceUrl: string;
  clientId: string;
  clientSecret: string;
  clientUri: string;
  userLogin: string;
  tenantId: string;
  subtenantId: string;
  subtenantAccountNumber: string;
  scopes: string;
  callbackBotId: string;
  callbackClientId: string;
  callbackClientSecret: string;
}

// Available labs Health Gorilla IDs
// These come from the Health Gorilla Organization resources
const availableLabs: Record<string, string> = {
  Test: 'f-4f0235627ac2d59b49e5575c',
  Labcorp: 'f-388554647b89801ea5e8320b',
  Quest: 'f-7c075564349e1a592e53147a',
};

// Available tests organized by Health Gorilla test code
// These come from the Health Gorilla compendium CodeSystem
// It can be difficult to find the correct codes -- it can even be difficult to find the compendium itself!
// The trick is that the CodeSystem ID is the same as the Organization ID.
// For this example, we're embedding a collection of commonly used tests.
// You may want to embed this information into your own application or your own questionnaire.
// There are many different ways to pass this information.
// Ultimately, you just need to make sure you pass the correct code to Health Gorilla in the ServiceRequest resources.
const availableTests: Record<string, string> = {
  'test-1234-5': 'Test 1',
  'labcorp-001453': 'Hemoglobin A1c',
  'labcorp-010322': 'Prostate-Specific Ag',
  'labcorp-322000': 'Comp. Metabolic Panel (14)',
  'labcorp-008649': 'Aerobic Bacterial Culture',
  'labcorp-005009': 'CBC With Differential/Platelet',
  'labcorp-008847': 'Urine Culture, Routine',
  'labcorp-008144': 'Stool Culture',
  'labcorp-083935': 'HIV Ab/p24 Ag with Reflex',
  'labcorp-322758': 'Basic Metabolic Panel (8)',
  'labcorp-164922': 'HSV 1 and 2-Spec Ab, IgG w/Rfx',
  'quest-866': 'Free T4',
  'quest-899': 'TSH',
  'quest-10306': 'Hepatitis Panel, Acute w/reflex to confirmation',
  'quest-10231': 'Comprehensive Metabolic Panel',
  'quest-496': 'Hemoglobin A1C',
  'quest-2605': 'Allergen Specific IGE Dog dander, Serum',
  'quest-7600': 'Lipid Panel (Diagnosis E04.2, Z00.00)',
  'quest-229': 'Aldosterone, 24hr (U) (Diagnosis E04.2, Z00.00) Total Volume - 1200',
  'quest-4112': 'FTA',
  'quest-6399': 'CBC w/Diff',
  'quest-16814': 'ANA Scr, IFA w/Reflex Titer / Pattern / MPX AB Cascade',
  'quest-7573': 'Iron Total/IBC Diagnosis code D64.9',
};

const billToPatient: CodeableConcept = {
  coding: [
    {
      system: 'https://www.healthgorilla.com/order-billto',
      code: 'patient',
      display: 'Patient',
    },
  ],
  text: 'Patient',
};

export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<void> {
  // Parse the secrets
  // Make sure all required Health Gorilla config values are present
  const config = getHealthGorillaConfig(event);

  // Parse the QuestionnaireResponse
  // Make sure that required fields are present
  const answers = getQuestionnaireAnswers(event.input);

  const patient = answers.patient.valueReference;
  if (!patient) {
    throw new Error('QuestionnaireResponse is missing patient');
  }

  const practitioner = answers.practitioner.valueReference;
  if (!practitioner) {
    throw new Error('QuestionnaireResponse is missing practitioner');
  }

  const performer = answers.performer.valueString;
  if (!performer) {
    throw new Error('QuestionnaireResponse is missing performer');
  }
  if (!availableLabs[performer]) {
    throw new Error('QuestionnaireResponse has invalid performer');
  }

  // Lookup the patient and practitioner resources first
  // If the questionnaire response is invalid, this will throw and the bot will terminate
  const medplumPatient = await medplum.readReference(patient as Reference<Patient>);
  const medplumPractitioner = await medplum.readReference(practitioner as Reference<Practitioner>);

  // Connect to Health Gorilla
  const healthGorilla = await connectToHealthGorilla(config);

  // Ensure active subscriptions
  await ensureSubscriptions(config, healthGorilla);

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
    id: availableLabs[performer],
  };

  // Synchronize the account
  const healthGorillaAccount = await syncAccount(medplum, medplumPatient, healthGorillaPatient, billToPatient);

  // Create the service requests
  const healthGorillaServiceRequests: ServiceRequest[] = [];

  // Parse the test answers and create the service requests.
  // If the test is selected, create a service request with the given priority and note.
  // This is another area where you can customize the experience for your users.
  // In our example questionnaire, we use checkboxes for commonly available tests.
  // You could also use a dropdown or a free text field.
  // The important thing is that you pass the correct code to Health Gorilla.
  for (const testId of Object.keys(availableTests)) {
    if (answers[testId]?.valueBoolean) {
      const code = testId.substring(testId.indexOf('-') + 1);
      const display = availableTests[testId];
      const priority = answers[testId + '-priority']?.valueCoding?.code ?? 'routine';
      const noteText = answers[testId + '-note']?.valueString;
      healthGorillaServiceRequests.push(
        await createServiceRequest(healthGorillaPatient, code, display, priority, noteText)
      );
    }
  }

  // Place the order
  await createRequestGroup(
    healthGorilla,
    healthGorillaTenantOrganization,
    healthGorillaSubtenantOrganization,
    healthGorillaPerformingOrganization,
    healthGorillaAccount,
    healthGorillaPatient,
    healthGorillaPractitioner,
    healthGorillaServiceRequests
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
    audienceUrl: requireStringSecret(secrets, 'HEALTH_GORILLA_AUDIENCE_URL'),
    clientId: requireStringSecret(secrets, 'HEALTH_GORILLA_CLIENT_ID'),
    clientSecret: requireStringSecret(secrets, 'HEALTH_GORILLA_CLIENT_SECRET'),
    clientUri: requireStringSecret(secrets, 'HEALTH_GORILLA_CLIENT_URI'),
    userLogin: requireStringSecret(secrets, 'HEALTH_GORILLA_USER_LOGIN'),
    tenantId: requireStringSecret(secrets, 'HEALTH_GORILLA_TENANT_ID'),
    subtenantId: requireStringSecret(secrets, 'HEALTH_GORILLA_SUBTENANT_ID'),
    subtenantAccountNumber: requireStringSecret(secrets, 'HEALTH_GORILLA_SUBTENANT_ACCOUNT_NUMBER'),
    scopes: requireStringSecret(secrets, 'HEALTH_GORILLA_SCOPES'),
    callbackBotId: requireStringSecret(secrets, 'HEALTH_GORILLA_CALLBACK_BOT_ID'),
    callbackClientId: requireStringSecret(secrets, 'HEALTH_GORILLA_CALLBACK_CLIENT_ID'),
    callbackClientSecret: requireStringSecret(secrets, 'HEALTH_GORILLA_CALLBACK_CLIENT_SECRET'),
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
    aud: config.audienceUrl,
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
 *
 * @param config The Health Gorilla config settings.
 * @param healthGorilla The Health Gorilla FHIR client.
 */
export async function ensureSubscriptions(config: HealthGorillaConfig, healthGorilla: MedplumClient): Promise<void> {
  // Get all subscriptions
  const subscriptions = await healthGorilla.searchResources('Subscription');
  await ensureSubscription(config, healthGorilla, subscriptions, 'RequestGroup');
  await ensureSubscription(config, healthGorilla, subscriptions, 'ServiceRequest');
  await ensureSubscription(config, healthGorilla, subscriptions, 'DiagnosticReport');
}

/**
 * Ensures that there is an active subscription for the given criteria.
 *
 * @param config The Health Gorilla config settings.
 * @param healthGorilla The Health Gorilla FHIR client.
 * @param existingSubscriptions The existing subscriptions.
 * @param criteria The subscription criteria.
 */
export async function ensureSubscription(
  config: HealthGorillaConfig,
  healthGorilla: MedplumClient,
  existingSubscriptions: Subscription[],
  criteria: string
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
    reason: `Send webhooks for ${criteria} resources`,
    criteria,
    channel: {
      type: 'rest-hook',
      endpoint: `https://api.medplum.com/fhir/R4/Bot/${config.callbackBotId}/$execute`,
      payload: 'application/fhir+json',
      header: ['Authorization: Basic ' + encodeBase64(config.callbackClientId + ':' + config.callbackClientSecret)],
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
 * @param medplumPatient The Medplum patient resource.
 * @param healthGorillaPatient The Health Gorilla patient resource.
 * @param billingType The Health Gorilla billing type.
 * @returns The Health Gorilla account resource.
 */
export async function syncAccount(
  medplum: MedplumClient,
  medplumPatient: Patient,
  healthGorillaPatient: Patient,
  billingType: CodeableConcept
): Promise<Account> {
  // const healthGorillaId = getIdentifier(medplumPatient, HEALTH_GORILLA_SYSTEM);
  // In Health Gorilla, Account connects a Patient and a payment method
  // So we use the combination of those references as the Account identifier
  const identifier = getReferenceString(healthGorillaPatient) + '-' + billingType.coding?.[0]?.code;

  // First, make sure there is an Account in Medplum
  let medplumAccount = await medplum.searchOne('Account', { identifier });
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
          value: identifier,
        },
      ],
      type: billingType,
      guarantor: [{ party: createReference(medplumPatient) }],
    });
    console.log(`Created new Medplum account: ${medplumAccount.id}`);
  }

  // Health Gorilla does not support creating `Account` resources,
  // so we always use an in-memory `Account` which is linked to the `Patient` by identifier;
  return {
    ...medplumAccount,
    guarantor: [{ party: createReference(healthGorillaPatient) }],
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
  healthGorillaPatient: Patient,
  code: string,
  display: string,
  priority: string,
  noteText: string | undefined
): Promise<ServiceRequest> {
  return {
    resourceType: 'ServiceRequest',
    subject: createReference(healthGorillaPatient),
    status: 'active',
    intent: 'order',
    category: [
      {
        coding: [
          {
            system: SNOMED,
            code: '103693007',
            display: 'Diagnostic procedure',
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          code,
          display,
        },
      ],
      text: `${code} - ${display}`,
    },
    note: noteText ? [{ text: noteText }] : undefined,
    priority: priority as 'routine' | 'urgent' | 'stat' | 'asap',
  };
}

/**
 * Creates a new request group in Health Gorilla which creates a new lab order.
 *
 * The FHIR RequestGroup is a combination of the following resources:
 *
 * @param healthGorilla The Health Gorilla FHIR client.
 * @param healthGorillaTenantOrganization The authorizing organization resource.
 * @param healthGorillaSubtenantOrganization The authorizing organization resource.
 * @param healthGorillaPerformingOrganization The performing organization resource.
 * @param healthGorillaAccount The account resource.
 * @param healthGorillaPatient The patient resource.
 * @param healthGorillaPractitioner The practitioner resource.
 * @param healthGorillaServiceRequests The service request resources.
 */
export async function createRequestGroup(
  healthGorilla: MedplumClient,
  healthGorillaTenantOrganization: Organization,
  healthGorillaSubtenantOrganization: Organization,
  healthGorillaPerformingOrganization: Organization,
  healthGorillaAccount: Account,
  healthGorillaPatient: Patient,
  healthGorillaPractitioner: Practitioner,
  healthGorillaServiceRequests: ServiceRequest[]
): Promise<void> {
  const inputJson = {
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
    ] as Resource[],
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
    action: [] as RequestGroupAction[],
  } satisfies RequestGroup;

  for (let i = 0; i < healthGorillaServiceRequests.length; i++) {
    inputJson.contained.push({
      ...healthGorillaServiceRequests[i],
      id: 'labtest' + i,
    });
    inputJson.action.push({
      resource: {
        reference: '#labtest' + i,
        display: healthGorillaServiceRequests[i].code?.text,
      },
    });
  }

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
