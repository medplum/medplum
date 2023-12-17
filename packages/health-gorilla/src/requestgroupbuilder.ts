import { createReference, getIdentifier, MedplumClient, setIdentifier, SNOMED, append } from '@medplum/core';
import {
  Account,
  AccountCoverage,
  Annotation,
  CodeableConcept,
  Coverage,
  Organization,
  Patient,
  Practitioner,
  QuestionnaireResponse,
  QuestionnaireResponseItemAnswer,
  Reference,
  RelatedPerson,
  RequestGroup,
  RequestGroupAction,
  Resource,
  ServiceRequest,
  Specimen,
} from '@medplum/fhirtypes';
import { HEALTH_GORILLA_SYSTEM } from './constants';
import { assertNotEmpty } from './utils';

export class HealthGorillaRequestGroupBuilder {
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

    const phone = patient.telecom?.find((t) => t.system === 'phone');
    assertNotEmpty(phone, 'Patient is missing phone');

    const email = patient.telecom?.find((t) => t.system === 'email');
    assertNotEmpty(email, 'Patient is missing email');

    // Add default country "US" to address if not present
    if (!address.country) {
      address.country = 'US';
    }

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
    assertNotEmpty(healthGorillaId, 'Practitioner is missing Health Gorilla ID');

    this.practitioner = await healthGorilla.readResource('Practitioner', healthGorillaId);
    return this.practitioner as Practitioner;
  }

  async setupAccount(medplum: MedplumClient, medplumAccount: Account): Promise<Account> {
    assertNotEmpty(this.patient, 'Missing patient');

    const resultAccount: Account = {
      ...medplumAccount,
    };

    if (resultAccount.type?.coding?.[0]?.code === 'patient') {
      resultAccount.guarantor = [{ party: createReference(this.patient) }];
    }

    if (medplumAccount.coverage) {
      for (let i = 0; i < medplumAccount.coverage.length; i++) {
        await this.setupCoverage(medplum, medplumAccount.coverage[i], (resultAccount.coverage as AccountCoverage[])[i]);
      }
    }

    this.account = resultAccount;
    return resultAccount;
  }

  async setupCoverage(
    medplum: MedplumClient,
    accountCoverage: AccountCoverage,
    resultAccountCoverage: AccountCoverage
  ): Promise<void> {
    assertNotEmpty(this.patient, 'Missing patient');

    const coverageRef = accountCoverage?.coverage;
    if (!coverageRef) {
      return;
    }

    const medplumCoverage = await medplum.readReference(coverageRef);
    const resultCoverage: Coverage = {
      ...medplumCoverage,
      id: 'coverage' + this.coverages.length,
      beneficiary: createReference(this.patient),
      payor: [],
      subscriber: undefined,
    };

    (resultAccountCoverage.coverage as Reference).reference = '#' + resultCoverage.id;
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

  createServiceRequest(testId: string, answers: Record<string, QuestionnaireResponseItemAnswer>): ServiceRequest {
    assertNotEmpty(this.patient, 'Missing patient');

    const code = testId.substring(testId.indexOf('-') + 1);
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
        coding: [{ code }],
        text: code,
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
    assertNotEmpty(this.account, 'Missing account');
    assertNotEmpty(this.authorizedBy, 'Missing authorizedBy');
    assertNotEmpty(this.patient, 'Missing patient');
    assertNotEmpty(this.performer, 'Missing performer');
    assertNotEmpty(this.practitioner, 'Missing practitioner');
    assertNotEmpty(this.practitionerOrganization, 'Missing practitionerOrganization');
    assertNotEmpty(this.tests, 'Missing tests');

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
