import {
  BotEvent,
  createReference,
  encodeBase64,
  getIdentifier,
  getQuestionnaireAnswers,
  isResource,
  MedplumClient,
  setIdentifier,
  SNOMED,
} from '@medplum/core';
import {
  Account,
  Annotation,
  CodeableConcept,
  Coverage,
  Organization,
  Parameters,
  Patient,
  Practitioner,
  ProjectSecret,
  QuestionnaireResponse,
  QuestionnaireResponseItemAnswer,
  Reference,
  RelatedPerson,
  RequestGroup,
  RequestGroupAction,
  Resource,
  ServiceRequest,
  Specimen,
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
  Testing: 'f-4f0235627ac2d59b49e5575c',
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
  'test-11119': 'ABN TEST REFUSAL',
  'test-38827': 'INCORRECT ABN SUBMITTED',
  'labcorp-001453': 'Hemoglobin A1c',
  'labcorp-010322': 'Prostate-Specific Ag',
  'labcorp-322000': 'Comp. Metabolic Panel (14)',
  'labcorp-322755': 'Hepatic Function Panel (7)',
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

// Available diagnoses organized by ICD10 code
// You may want to allow open search for all diagnoses.
// In this demo, we're only allowing a few common diagnoses.
const availableDiagnoses: Record<string, string> = {
  'diagnosis-D63.1': 'Anemia in chronic kidney disease',
  'diagnosis-D64.9': 'Anemia, unspecified',
  'diagnosis-E04.2': 'Nontoxic multinodular goiter',
  'diagnosis-E05.90': 'Hyperthyroidism, unspecified',
  'diagnosis-E11.9': 'Diabetes mellitus, unspecified',
  'diagnosis-E11.42': 'Type 2 diabetes mellitus with diabetic polyneuropathy',
  'diagnosis-E55.9': 'Vitamin D deficiency, unspecified',
  'diagnosis-E78.2': 'Mixed hyperlipidemia',
  'diagnosis-E88.89': 'Other specified metabolic disorders',
  'diagnosis-F06.8': 'Other specified mental disorders due to known physiological condition',
  'diagnosis-I10': 'Essential (primary) hypertension',
  'diagnosis-K70.30': 'Alcoholic cirrhosis of liver without ascites',
  'diagnosis-K76.0': 'Fatty (change of) liver, not elsewhere classified',
  'diagnosis-M10.9': 'Gout, unspecified',
  'diagnosis-N13.5': 'Crossing vessel and stricture of ureter',
  'diagnosis-N18.3': 'Chronic kidney disease, stage 3 (moderate)',
  'diagnosis-R53.83': 'Other fatigue',
  'diagnosis-Z00.00': 'Encounter for general adult medical examination without abnormal findings',
  'diagnosis-Z34.90': 'Encounter for supervision of normal pregnancy, unspecified trimester',
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

  const account = answers.account.valueReference;
  if (!account) {
    throw new Error('QuestionnaireResponse is missing account');
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

  // Lookup the patient, account, and practitioner resources first
  // If the questionnaire response is invalid, this will throw and the bot will terminate
  const medplumPatient = await medplum.readReference(patient as Reference<Patient>);
  const medplumPractitioner = await medplum.readReference(practitioner as Reference<Practitioner>);
  const medplumAccount = await medplum.readReference(account as Reference<Account>);

  // Connect to Health Gorilla
  const healthGorilla = await connectToHealthGorilla(config);

  // Ensure active subscriptions
  await ensureSubscriptions(config, healthGorilla);

  const builder = new HealthGorillaRequestGroupBuilder();

  // Synchronize the patient
  await builder.syncPatient(medplum, healthGorilla, medplumPatient);

  // Get the practitioner
  await builder.getPractitioner(healthGorilla, medplumPractitioner);

  // Setup the Account, Coverage, and Subscriber
  await builder.setupAccount(medplum, medplumPatient, medplumAccount);

  // Get the tenant organization
  // This is a special organization that is not available in the Health Gorilla API
  builder.authorizedBy = {
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
  builder.practitionerOrganization = {
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
    partOf: createReference(builder.authorizedBy),
  };

  // Get the performing organization
  // This is a special organization that is not available in the Health Gorilla API
  builder.performer = {
    resourceType: 'Organization',
    id: availableLabs[performer],
  };

  // Create the service requests
  // Parse the test answers and create the service requests.
  // If the test is selected, create a service request with the given priority and note.
  // This is another area where you can customize the experience for your users.
  // In our example questionnaire, we use checkboxes for commonly available tests.
  // You could also use a dropdown or a free text field.
  // The important thing is that you pass the correct code to Health Gorilla.
  for (const testId of Object.keys(availableTests)) {
    if (answers[testId]?.valueBoolean) {
      builder.createServiceRequest(testId, answers);
    }
  }

  // Create the diagnoses
  // Parse the diagnosis answers and create the diagnoses.
  for (const diagnosisId of Object.keys(availableDiagnoses)) {
    if (answers[diagnosisId]?.valueBoolean) {
      const code = diagnosisId.substring(diagnosisId.indexOf('-') + 1);
      const display = availableDiagnoses[diagnosisId];
      builder.addDiagnosis(code, display);
    }
  }

  // Specimen collected date/time
  // This is an optional field.  If present, it will create a Specimen resource.
  builder.specimenCollectedDateTime = answers.specimenCollectedDateTime?.valueDateTime;

  // Place the order
  const requestGroup = builder.buildRequestGroup();
  await medplum.uploadMedia(JSON.stringify(requestGroup, null, 2), 'application/json', 'requestgroup.json');

  const response = await healthGorilla.startAsyncRequest(healthGorilla.fhirUrl('RequestGroup').toString(), {
    method: 'POST',
    body: JSON.stringify(requestGroup),
  });

  // If the Health Gorilla API returns a RequestGroup immediately,
  // it means that the order may have an ABN (Advanced Beneficiary Notice).
  // Go through the process of getting the ABN PDF and uploading it to Medplum.
  if (isResource(response) && response.resourceType === 'RequestGroup' && response.id) {
    await checkAbn(medplum, healthGorilla, response as RequestGroup & { id: string });
  }
}

/**
 * Returns the Health Gorilla config settings from the Medplum project secrets.
 * If any required config values are missing, this method will throw and the bot will terminate.
 * @param event - The bot input event.
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
 * @param config - The Health Gorilla config settings.
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
 * @param config - The Health Gorilla config settings.
 * @param healthGorilla - The Health Gorilla FHIR client.
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
 * @param config - The Health Gorilla config settings.
 * @param healthGorilla - The Health Gorilla FHIR client.
 * @param existingSubscriptions - The existing subscriptions.
 * @param criteria - The subscription criteria.
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

/**
 * Checks the RequestGroup for an ABN (Advanced Beneficiary Notice).
 *
 * See: https://developer.healthgorilla.com/docs/diagnostic-network#abn
 *
 * @param medplum - The Medplum FHIR client.
 * @param healthGorilla - The Health Gorilla FHIR client.
 * @param requestGroup - The newly created RequestGroup.
 */
async function checkAbn(
  medplum: MedplumClient,
  healthGorilla: MedplumClient,
  requestGroup: RequestGroup & { id: string }
): Promise<void> {
  // Use the HealthGorilla "$abn" operation to get the PDF URL
  const abnResult = await healthGorilla.get(healthGorilla.fhirUrl(requestGroup.resourceType, requestGroup.id, '$abn'));

  // Get the ABN PDF URL from the Parameters resource
  const abnUrl = (abnResult as Parameters).parameter?.find((p) => p.name === 'url')?.valueString;
  if (abnUrl) {
    const abnBlob = await healthGorilla.download(abnUrl, { headers: { Accept: 'application/pdf' } });

    // node-fetch does not allow streaming from a Response object
    // So read the PDF into memory first
    const abnArrayBuffer = await abnBlob.arrayBuffer();
    const abnUint8Array = new Uint8Array(abnArrayBuffer);

    // Create a Medplum media resource
    const media = await medplum.uploadMedia(abnUint8Array, 'application/pdf', 'RequestGroup-ABN.pdf');
    console.log('Uploaded ABN PDF as media: ' + media.id);
  }
}

function append<T>(array: T[] | undefined, value: T): T[] {
  if (!array) {
    return [value];
  }
  return [...array, value];
}

class HealthGorillaRequestGroupBuilder {
  practitioner?: Practitioner;
  practitionerOrganization?: Organization;
  patient?: Patient;
  account?: Account;
  coverages: Coverage[] = [];
  subscribers: RelatedPerson[] = [];
  authorizedBy?: Organization;
  performer?: Organization;
  aoes?: QuestionnaireResponse[];
  tests?: ServiceRequest[];
  diagnoses?: CodeableConcept[];
  specimenCollectedDateTime?: string;
  note?: string;

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
   * @param medplum - The Medplum FHIR client.
   * @param healthGorilla - The Health Gorilla FHIR client.
   * @param patient - The Medplum patient resource.
   * @returns The Health Gorilla patient resource.
   */
  async syncPatient(medplum: MedplumClient, healthGorilla: MedplumClient, patient: Patient): Promise<Patient> {
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
        birthDate: patient.birthDate,
        gender: patient.gender,
        address: patient.address,
        telecom: patient.telecom,
      });
      this.patient = existingPatient;
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
      this.patient = createdPatient;
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
   * @param healthGorilla - The Health Gorilla FHIR client.
   * @param practitioner - The Medplum practitioner resource.
   * @returns The Health Gorilla practitioner resource.
   */
  async getPractitioner(healthGorilla: MedplumClient, practitioner: Practitioner): Promise<Practitioner> {
    const healthGorillaId = getIdentifier(practitioner, HEALTH_GORILLA_SYSTEM);
    if (!healthGorillaId) {
      throw new Error('Practitioner is missing Health Gorilla ID');
    }

    this.practitioner = await healthGorilla.readResource('Practitioner', healthGorillaId);
    return this.practitioner;
  }

  async setupAccount(medplum: MedplumClient, medplumPatient: Patient, medplumAccount: Account): Promise<Account> {
    if (!this.patient) {
      throw new Error('Missing patient');
    }

    const resultAccount: Account = {
      ...medplumAccount,
      coverage: undefined,
    };

    if (resultAccount.type?.coding?.[0]?.code === 'patient') {
      resultAccount.guarantor = [{ party: createReference(this.patient) }];
    }

    if (medplumAccount.coverage) {
      for (const accountCoverage of medplumAccount.coverage) {
        const coverageRef = accountCoverage?.coverage;
        if (coverageRef) {
          const medplumCoverage = await medplum.readReference(coverageRef);
          const resultCoverage: Coverage = {
            ...medplumCoverage,
            id: 'coverage' + this.coverages.length,
            beneficiary: createReference(this.patient),
            payor: undefined,
            subscriber: undefined,
          };

          resultAccount.coverage = append(resultAccount.coverage, {
            coverage: { reference: '#' + resultCoverage.id },
            priority: 1,
          });

          this.coverages = append(this.coverages, resultCoverage);

          if (medplumCoverage.payor) {
            for (const payorRef of medplumCoverage.payor) {
              // Payors must be Organizations with Health Gorilla identifiers
              const medplumPayor = await medplum.readReference(payorRef as Reference<Organization>);
              resultCoverage.payor = append(resultCoverage.payor, {
                reference: 'Organization/' + getIdentifier(medplumPayor, HEALTH_GORILLA_SYSTEM),
              });
            }
          }

          const subscriberRef = medplumCoverage.subscriber;
          if (subscriberRef) {
            const medplumSubscriber = await medplum.readReference(subscriberRef as Reference<RelatedPerson>);
            const resultSubscriber = {
              ...medplumSubscriber,
              id: 'subscriber' + this.subscribers.length,
              patient: createReference(this.patient),
            };
            resultCoverage.subscriber = { reference: '#' + resultSubscriber.id };
            this.subscribers = append(this.subscribers, resultSubscriber);
          }
        }
      }
    }

    this.account = resultAccount;
    return resultAccount;
  }

  createServiceRequest(testId: string, answers: Record<string, QuestionnaireResponseItemAnswer>): ServiceRequest {
    if (!this.patient) {
      throw new Error('Missing patient');
    }

    const code = testId.substring(testId.indexOf('-') + 1);
    const display = availableTests[testId];
    const priority = answers[testId + '-priority']?.valueCoding?.code ?? 'routine';
    const noteText = answers[testId + '-note']?.valueString;

    // Check for AOE answers
    const aoePrefix = testId + '-aoe-';
    const aoeAnswerKeys = Object.keys(answers).filter((k) => k.startsWith(aoePrefix));
    let aoeResponse: QuestionnaireResponse | undefined = undefined;
    if (aoeAnswerKeys.length > 0) {
      aoeResponse = {
        resourceType: 'QuestionnaireResponse',
        id: 'aoe-' + code,
        status: 'completed',
        item: aoeAnswerKeys.map((k) => ({
          linkId: k.substring(aoePrefix.length),
          answer: [answers[k]],
        })),
      };
      this.aoes = append(this.aoes, aoeResponse);
    }

    const result: ServiceRequest = {
      resourceType: 'ServiceRequest',
      subject: createReference(this.patient),
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
      supportingInfo: aoeResponse ? [{ reference: '#' + aoeResponse.id }] : undefined,
    };

    this.tests = append(this.tests, result);
    return result;
  }

  addDiagnosis(code: string, display: string): CodeableConcept {
    const result: CodeableConcept = {
      coding: [
        {
          system: 'http://hl7.org/fhir/sid/icd-10',
          code,
          display,
        },
      ],
      text: `${code} - ${display}`,
    };
    this.diagnoses = append(this.diagnoses, result);
    return result;
  }

  buildRequestGroup(): RequestGroup {
    if (!this.account) {
      throw new Error('Missing account');
    }
    if (!this.authorizedBy) {
      throw new Error('Missing authorizedBy');
    }
    if (!this.patient) {
      throw new Error('Missing patient');
    }
    if (!this.performer) {
      throw new Error('Missing performer');
    }
    if (!this.practitioner) {
      throw new Error('Missing practitioner');
    }
    if (!this.practitionerOrganization) {
      throw new Error('Missing practitionerOrganization');
    }
    if (!this.tests) {
      throw new Error('Missing tests');
    }

    const contained: Resource[] = [
      { ...this.account, id: 'account' },
      { ...this.practitioner, id: 'practitioner' },
      { ...this.practitionerOrganization, id: 'organization' },
    ];

    if (this.coverages) {
      contained.push(...this.coverages);
    }

    if (this.subscribers) {
      contained.push(...this.subscribers);
    }

    if (this.aoes) {
      contained.push(...this.aoes);
    }

    const result = {
      resourceType: 'RequestGroup',
      meta: {
        profile: ['https://healthgorilla.com/fhir/StructureDefinition/hg-order'],
      },
      contained,
      extension: [
        {
          url: 'https://www.healthgorilla.com/fhir/StructureDefinition/requestgroup-authorizedBy',
          valueReference: createReference(this.authorizedBy),
        },
        {
          url: 'https://www.healthgorilla.com/fhir/StructureDefinition/requestgroup-account',
          valueReference: { reference: '#account' },
        },
        {
          url: 'https://www.healthgorilla.com/fhir/StructureDefinition/requestgroup-performer',
          valueReference: createReference(this.performer),
        },
        {
          url: 'https://www.healthgorilla.com/fhir/StructureDefinition/requestgroup-requester',
          extension: [
            {
              url: 'agent',
              valueReference: { reference: '#practitioner' },
            },
            {
              url: 'onBehalfOf',
              valueReference: { reference: '#3' },
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
      subject: createReference(this.patient),
      author: createReference(this.practitioner),
      reasonCode: this.diagnoses,
      action: [] as RequestGroupAction[],
      note: [] as Annotation[],
    } satisfies RequestGroup;

    for (let i = 0; i < this.tests.length; i++) {
      result.contained.push({ ...this.tests[i], id: 'labtest' + i });
      result.action.push({ resource: { reference: '#labtest' + i, display: this.tests[i].code?.text } });
    }

    if (this.specimenCollectedDateTime) {
      const specimen: Specimen = {
        resourceType: 'Specimen',
        id: 'specimen',
        subject: createReference(this.patient),
        collection: {
          collectedDateTime: this.specimenCollectedDateTime,
        },
      };

      result.contained.push(specimen);

      result.extension.push({
        url: 'https://www.healthgorilla.com/fhir/StructureDefinition/requestgroup-specimen',
        valueReference: {
          reference: `#${specimen.id}`,
        },
      });
    }

    if (this.note) {
      result.note.push({ text: this.note });
    }

    return result;
  }
}
