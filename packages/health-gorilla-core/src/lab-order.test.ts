import { Bundle, Patient, Practitioner, Questionnaire, Resource, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import {
  assertLabOrderInputs,
  createLabOrderBundle,
  isValidLabOrderInputs,
  LabOrderValidationError,
  PartialLabOrderInputs,
  validateLabOrderInputs,
} from './lab-order';
import {
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  MedplumClient,
} from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import path from 'path';
import { readFileSync } from 'fs';
import {
  HEALTH_GORILLA_SYSTEM,
  MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_BILL_TO,
  MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_PERFORMING_LAB_AN,
  MEDPLUM_HEALTH_GORILLA_LAB_ORDER_PROFILE,
} from './constants';
import { LabOrderTestMetadata, LabOrganization, TestCoding } from './types';
import { expectToBeDefined } from './test-utils';

interface TestContext {
  medplum: MedplumClient;
  patient: Patient;
  requester: Practitioner;
  performingLab: LabOrganization;
}

const PATIENT_IDENTIFIER = 'd05b5e65f4f4ade2e5033b17';
const REQUESTER_IDENTIFIER = '07a83165d5b41cb967291e44';
const PERFORMING_LAB_IDENTIFIER = 'f-a855594f43fe879c6570b92e';
const TEST_CODES: [string] = ['083935'];
const TEST_CODE_WITH_REQUIRED_AOE = { code: 'AOE' } as TestCoding;
const TEST_CODES_TO_AOES = {
  AOE: {
    resourceType: 'Questionnaire',
    id: 'ed364266b937bb3bd73082b1',
    name: 'AOE Testing AOE questions',
    status: 'active',
    subjectType: ['Patient'],
    code: [
      {
        system: 'urn:uuid:f:388554647b89801ea5e8320b',
        code: 'aoe_testing',
      },
    ],
    item: [
      {
        linkId: 'fasting',
        code: [{ code: 'fasting' }],
        text: 'Is the patient fasting?',
        type: 'choice',
        required: true,
        answerOption: [
          {
            valueCoding: {
              code: 'Y',
              display: 'Yes',
            },
          },
          {
            valueCoding: {
              code: 'N',
              display: 'No',
            },
          },
        ],
      },
    ],
  } as Questionnaire,
};

describe('createLabOrderBundle', () => {
  const testDataDir = path.resolve(__dirname, '__test__');

  function readTestJson<T extends Resource>(testDataFilename: string): T {
    return JSON.parse(readFileSync(path.resolve(testDataDir, testDataFilename), 'utf8')) as T;
  }

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach<TestContext>(async (ctx) => {
    const medplum = new MockClient();
    ctx.medplum = medplum;

    const commonInputBundle = readTestJson('test-common-inputs.json') as Bundle;
    const result = await medplum.executeBatch(commonInputBundle);

    if (result.entry?.some((e) => !e.response?.status.startsWith('2'))) {
      console.error(JSON.stringify(result, null, 2));
      throw new Error('Non-2XX status when executing common input bundle');
    }

    const patient = await medplum.searchOne('Patient', {
      identifier: HEALTH_GORILLA_SYSTEM + '|' + PATIENT_IDENTIFIER,
    });
    if (!patient) {
      throw new Error('Patient not found from common input bundle');
    }
    ctx.patient = patient;

    const requester = await medplum.searchOne('Practitioner', {
      identifier: HEALTH_GORILLA_SYSTEM + '|' + REQUESTER_IDENTIFIER,
    });
    if (!requester) {
      throw new Error('Requester not found from common input bundle');
    }
    ctx.requester = requester;

    const performingLab = await medplum.searchOne('Organization', { identifier: PERFORMING_LAB_IDENTIFIER });
    if (!performingLab) {
      throw new Error('Performing lab not found from common input bundle');
    }
    ctx.performingLab = performingLab as LabOrganization;

    // Should not find any existing lab orders for this patient
    expect(
      await medplum.searchOne('ServiceRequest', {
        _profile: MEDPLUM_HEALTH_GORILLA_LAB_ORDER_PROFILE,
        subject: getReferenceString(patient),
      })
    ).toBeUndefined();
  });

  test<TestContext>('minimal input', async (ctx) => {
    const { medplum, patient, requester, performingLab } = ctx;

    const selectedTests: TestCoding[] = [];
    const testMetadata: Record<string, LabOrderTestMetadata> = {};
    for (const code of TEST_CODES) {
      selectedTests.push({ code } as TestCoding);
      testMetadata[code] = {};
    }

    const bundle = createLabOrderBundle({
      patient,
      requester,
      performingLab,
      selectedTests,
      testMetadata,
      billingInformation: {
        billTo: 'patient',
      },
    });

    expect(bundle.type).toEqual('transaction');

    const txnResponse = await medplum.executeBatch(bundle);
    expect(txnResponse.type).toEqual('transaction-response');
    expectBundleResultSuccessful(txnResponse);

    const orderServiceRequest = await medplum.searchOne('ServiceRequest', {
      _profile: MEDPLUM_HEALTH_GORILLA_LAB_ORDER_PROFILE,
      subject: getReferenceString(patient),
    });

    expectToBeDefined(orderServiceRequest);
    expect(orderServiceRequest?.extension).toEqual([
      { url: MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_BILL_TO, valueString: 'patient' },
    ]);
  });

  test<TestContext>('insurance and coverage', async (ctx) => {
    const { medplum, patient, requester, performingLab } = ctx;

    const selectedTests: TestCoding[] = [];
    const testMetadata: Record<string, LabOrderTestMetadata> = {};
    for (const code of TEST_CODES) {
      selectedTests.push({ code } as TestCoding);
    }

    const bundle = createLabOrderBundle({
      patient,
      requester,
      performingLab,
      selectedTests,
      testMetadata,
      billingInformation: {
        billTo: 'insurance',
        patientCoverage: [
          {
            resourceType: 'Coverage',
            id: 'coverage-1',
            status: 'active',
            beneficiary: { reference: 'Patient/123' },
            payor: [],
          },
        ],
      },
    });

    expect(bundle.type).toEqual('transaction');

    const txnResponse = await medplum.executeBatch(bundle);
    expect(txnResponse.type).toEqual('transaction-response');
    expectBundleResultSuccessful(txnResponse);

    const orderServiceRequest = await medplum.searchOne('ServiceRequest', {
      _profile: MEDPLUM_HEALTH_GORILLA_LAB_ORDER_PROFILE,
      subject: getReferenceString(patient),
    });

    expectToBeDefined(orderServiceRequest);
    expect(orderServiceRequest.insurance).toEqual([{ reference: 'Coverage/coverage-1' }]);
    expect(orderServiceRequest.extension).toEqual([
      { url: MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_BILL_TO, valueString: 'insurance' },
    ]);
  });

  test<TestContext>('Specify Account Number', async (ctx) => {
    const { medplum, patient, requester, performingLab } = ctx;
    const selectedTests: TestCoding[] = [];
    const testMetadata: Record<string, LabOrderTestMetadata> = {};
    for (const code of TEST_CODES) {
      selectedTests.push({ code } as TestCoding);
      testMetadata[code] = {};
    }

    const bundle = createLabOrderBundle({
      patient,
      requester,
      performingLab,
      performingLabAccountNumber: '123456',
      selectedTests,
      testMetadata,
      diagnoses: [],
      billingInformation: {
        billTo: 'customer-account',
      },
    });
    const txnResponse = await medplum.executeBatch(bundle);
    expectBundleResultSuccessful(txnResponse);

    const orderServiceRequest = await medplum.searchOne('ServiceRequest', {
      _profile: MEDPLUM_HEALTH_GORILLA_LAB_ORDER_PROFILE,
      subject: getReferenceString(patient),
    });

    expectToBeDefined(orderServiceRequest);
    expect(orderServiceRequest.extension).toEqual([
      { url: MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_BILL_TO, valueString: 'customer-account' },
      { url: MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_PERFORMING_LAB_AN, valueString: '123456' },
    ]);
  });

  test<TestContext>('With AOE response and specimenCollectedDateTime', async (ctx) => {
    const { medplum, patient, requester, performingLab } = ctx;
    const selectedTests: TestCoding[] = [TEST_CODE_WITH_REQUIRED_AOE];
    const testMetadata: Record<string, LabOrderTestMetadata> = {
      [TEST_CODE_WITH_REQUIRED_AOE.code]: {
        aoeQuestionnaire: TEST_CODES_TO_AOES.AOE,
        aoeResponses: {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            {
              linkId: 'fasting',
              answer: [
                {
                  valueCoding: {
                    code: 'Y',
                    display: 'Yes',
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const bundle = createLabOrderBundle({
      patient,
      requester,
      performingLab,
      performingLabAccountNumber: '123456',
      selectedTests,
      testMetadata,
      diagnoses: [],
      billingInformation: {
        billTo: 'customer-account',
      },
      specimenCollectedDateTime: new Date(),
    });
    const txnResponse = await medplum.executeBatch(bundle);
    expectBundleResultSuccessful(txnResponse);

    const orderServiceRequest = await medplum.searchOne('ServiceRequest', {
      _profile: MEDPLUM_HEALTH_GORILLA_LAB_ORDER_PROFILE,
      subject: getReferenceString(patient),
    });

    expectToBeDefined(orderServiceRequest);
    expect(orderServiceRequest.extension).toEqual([
      { url: MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_BILL_TO, valueString: 'customer-account' },
      { url: MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_PERFORMING_LAB_AN, valueString: '123456' },
    ]);
  });

  describe('Input validation', () => {
    test<TestContext>('Empty input', async () => {
      const inputs: PartialLabOrderInputs = {};
      expectToBeDefined(validateLabOrderInputs(inputs));
      expect(isValidLabOrderInputs(inputs)).toBe(false);
      expect(() => assertLabOrderInputs(inputs)).toThrow(LabOrderValidationError);
    });

    test<TestContext>('Missing tests, test metadata and billing information', async ({
      patient,
      requester,
      performingLab,
    }) => {
      const inputs: PartialLabOrderInputs = {
        patient,
        requester,
        performingLab,
      };
      expectToBeDefined(validateLabOrderInputs(inputs));
      expect(isValidLabOrderInputs(inputs)).toBe(false);
      expect(() => assertLabOrderInputs(inputs)).toThrow(LabOrderValidationError);
    });

    test<TestContext>('Complete input', async ({ patient, requester, performingLab }) => {
      const selectedTests: TestCoding[] = [];
      const testMetadata: Record<string, LabOrderTestMetadata> = {};
      for (const code of TEST_CODES) {
        selectedTests.push({ code } as TestCoding);
        testMetadata[code] = { notes: 'test notes', priority: 'urgent' };
      }

      const inputs: PartialLabOrderInputs = {
        patient,
        requester,
        performingLab,
        selectedTests,
        testMetadata,
        billingInformation: { billTo: 'customer-account' },
      };

      expect(validateLabOrderInputs(inputs)).toBeUndefined();
      expect(isValidLabOrderInputs(inputs)).toBe(true);
      expect(() => assertLabOrderInputs(inputs)).not.toThrow();
    });

    test<TestContext>('Invalid test priority', async ({ patient, requester, performingLab }) => {
      const selectedTests: TestCoding[] = [];
      const testMetadata: Record<string, LabOrderTestMetadata> = {};
      for (const code of TEST_CODES) {
        selectedTests.push({ code } as TestCoding);
        testMetadata[code] = { notes: 'test notes', priority: 'super duper urgent' as any };
      }

      const inputs: PartialLabOrderInputs = {
        patient,
        requester,
        performingLab,
        selectedTests,
        testMetadata,
        billingInformation: { billTo: 'customer-account' },
      };

      const errors = validateLabOrderInputs(inputs);
      expectToBeDefined(errors?.testMetadata?.[TEST_CODES[0]]?.priority);
      expect(isValidLabOrderInputs(inputs)).toBe(false);
      expect(() => assertLabOrderInputs(inputs)).toThrow();
    });

    test<TestContext>('Missing Coverage for insurance', async ({ patient, requester, performingLab }) => {
      const selectedTests: TestCoding[] = [];
      const testMetadata: Record<string, LabOrderTestMetadata> = {};
      for (const code of TEST_CODES) {
        selectedTests.push({ code } as TestCoding);
      }

      const inputs: PartialLabOrderInputs = {
        patient,
        requester,
        performingLab,
        selectedTests,
        testMetadata,
        billingInformation: { billTo: 'insurance' },
      };

      const errors = validateLabOrderInputs(inputs);
      expectToBeDefined(errors?.billingInformation?.patientCoverage);
      expect(isValidLabOrderInputs(inputs)).toBe(false);
      expect(() => assertLabOrderInputs(inputs)).toThrow();
    });

    test<TestContext>('Missing required AOE responses', async ({ patient, requester, performingLab }) => {
      const selectedTests: TestCoding[] = [TEST_CODE_WITH_REQUIRED_AOE];
      const testMetadata: Record<string, LabOrderTestMetadata> = {
        [TEST_CODE_WITH_REQUIRED_AOE.code]: {
          aoeQuestionnaire: TEST_CODES_TO_AOES.AOE,
          aoeResponses: { resourceType: 'QuestionnaireResponse', status: 'completed', item: [] },
        },
      };

      const inputs: PartialLabOrderInputs = {
        patient,
        requester,
        performingLab,
        selectedTests,
        testMetadata,
        billingInformation: { billTo: 'patient' },
      };

      const errors = validateLabOrderInputs(inputs);
      expectToBeDefined(errors?.testMetadata?.[TEST_CODE_WITH_REQUIRED_AOE.code]?.aoeResponses);
      expect(isValidLabOrderInputs(inputs)).toBe(false);
      expect(() => assertLabOrderInputs(inputs)).toThrow();
    });

    test<TestContext>('With required AOE responses', async ({ patient, requester, performingLab }) => {
      const selectedTests: TestCoding[] = [TEST_CODE_WITH_REQUIRED_AOE];
      const testMetadata: Record<string, LabOrderTestMetadata> = {
        [TEST_CODE_WITH_REQUIRED_AOE.code]: {
          aoeQuestionnaire: TEST_CODES_TO_AOES.AOE,
          aoeResponses: {
            resourceType: 'QuestionnaireResponse',
            status: 'completed',
            item: [
              {
                linkId: 'fasting',
                answer: [
                  {
                    valueCoding: {
                      code: 'Y',
                      display: 'Yes',
                    },
                  },
                ],
              },
            ],
          },
        },
      };

      const inputs: PartialLabOrderInputs = {
        patient,
        requester,
        performingLab,
        selectedTests,
        testMetadata,
        billingInformation: { billTo: 'patient' },
      };

      expect(validateLabOrderInputs(inputs)).toBeUndefined();
      expect(isValidLabOrderInputs(inputs)).toBe(true);
      expect(() => assertLabOrderInputs(inputs)).not.toThrow();
    });
  });
});

function expectBundleResultSuccessful(bundle: Bundle): boolean {
  if (bundle.entry === undefined || bundle.entry.length === 0) {
    throw new Error('Empty bundle');
  }
  return bundle.entry.every((e) => e.response?.status.startsWith('2'));
}
